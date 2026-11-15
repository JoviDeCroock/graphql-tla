// A graphql-tla adapter for Juniper (docs/conformance.md, docs/kit-areas.md).
//
// Juniper builds a schema from Rust types. For a schema known only at run
// time, its documented route is a hand-written `GraphQLType` whose `TypeInfo`
// carries the schema: `GraphQLType::meta` builds each type's metadata from
// the info, and `GraphQLValue::type_name` names the type. That is what this
// adapter does. One Rust type, `Obj`, stands for every named type of the
// kit's SDL, and its `resolve_field_async` is the one resolver on every
// field. It sends `call` and awaits a oneshot channel that the main loop
// completes on the kit's `settle`.
//
// The settled value is then completed by Juniper: objects through Juniper's
// own selection-set code, lists through `Vec<T>`, built-in scalars through
// Juniper's `i32`, `f64`, `bool`, `String` and `ID`. A subscription root
// field follows what `#[graphql_subscription]` generates, and the response
// comes from `juniper_subscriptions`, which Juniper's integrations use.
//
// Everything runs on one thread, on a `futures` LocalPool. Juniper spawns
// nothing and has no timers, so the only thing that can wake a task is a
// `settle` from the kit. After each message the adapter runs the pool until
// it is stalled and says `idle`.
//
// Usage: graphql-tla-juniper [--no-idle] [--inline-items]

use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use async_graphql_parser::types::{
    BaseType, ConstDirective, FieldDefinition, InputValueDefinition, Type as SdlType,
    TypeDefinition, TypeKind, TypeSystemDefinition,
};
use async_graphql_parser::Positioned;
use async_graphql_value::ConstValue;
use futures::channel::oneshot;
use futures::executor::LocalPool;
use futures::future::{self, RemoteHandle};
use futures::task::LocalSpawnExt;
use futures::{FutureExt, StreamExt};
use juniper::http::{GraphQLRequest, GraphQLResponse};
use juniper::meta::{Argument, EnumMeta, EnumValue, Field, InputObjectMeta, MetaType, ScalarMeta};
use juniper::{
    ArcStr, Arguments, BoxFuture, DefaultScalarValue, ExecutionResult, Executor, FieldError,
    FromInputValue, GraphQLSubscriptionValue, GraphQLType, GraphQLValue, GraphQLValueAsync,
    InputValue, ParseError, ParseScalarResult, ParseScalarValue, Registry, RootNode,
    ScalarToken, ScalarValue, Selection, Type, Value, ValuesStream, ID,
};
use juniper::SubscriptionCoordinator;
use serde_json::{json, Value as Json};

type S = DefaultScalarValue;

const BUILTIN_SCALARS: [&str; 5] = ["Int", "Float", "String", "Boolean", "ID"];
const VERSION: &str = "juniper 0.18.0";

fn send(message: Json) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{message}");
    let _ = out.flush();
}

// ---------------------------------------------------------------------------
// The kit's SDL

struct Sdl {
    types: HashMap<String, TypeDefinition>,
    names: Vec<String>,
    query: String,
    mutation: Option<String>,
    subscription: Option<String>,
    description: Option<String>,
}

// async-graphql-parser 7.0.17 doesn't read a description on a schema
// definition, so the adapter takes it out first: a string right before the
// `schema` keyword. Its value is read by the same parser, as the
// description of a scalar, so escapes and block strings (§2.10.4
// BlockStringValue) come out as they would anywhere else in the SDL.
fn schema_description(source: &str) -> Option<(String, String)> {
    let at = source.match_indices("schema").find(|(i, _)| {
        source[i + 6..].trim_start().starts_with('{') && source[..*i].trim_end().ends_with('"')
    })?.0;
    let before = source[..at].trim_end();
    let start = if before.ends_with("\"\"\"") {
        before[..before.len() - 3].rfind("\"\"\"")?
    } else {
        // The opening quote: the last `"` before the closing one that no
        // backslash escapes.
        let body = &before[..before.len() - 1];
        body.match_indices('"')
            .map(|(i, _)| i)
            .filter(|&i| body[..i].bytes().rev().take_while(|&b| b == b'\\').count() % 2 == 0)
            .last()?
    };
    let token = &before[start..];
    let document = async_graphql_parser::parse_schema(format!("{token} scalar Description")).ok()?;
    let text = document.definitions.into_iter().find_map(|d| match d {
        TypeSystemDefinition::Type(ty) => ty.node.description.map(|d| d.node),
        _ => None,
    })?;
    Some((format!("{}{}", &source[..start], &source[at..]), text))
}

impl Sdl {
    fn parse(source: &str) -> Result<Sdl, String> {
        let (document, description) = match async_graphql_parser::parse_schema(source) {
            Ok(document) => (document, None),
            Err(e) => match schema_description(source) {
                Some((rest, description)) => (
                    async_graphql_parser::parse_schema(&rest).map_err(|e| e.to_string())?,
                    Some(description),
                ),
                None => return Err(e.to_string()),
            },
        };
        let mut sdl = Sdl {
            types: HashMap::new(),
            names: Vec::new(),
            query: "Query".into(),
            mutation: None,
            subscription: None,
            description,
        };
        let mut explicit = false;
        for definition in document.definitions {
            match definition {
                TypeSystemDefinition::Schema(schema) => {
                    explicit = true;
                    let schema = schema.node;
                    if let Some(q) = schema.query {
                        sdl.query = q.node.to_string();
                    }
                    sdl.mutation = schema.mutation.map(|m| m.node.to_string());
                    sdl.subscription = schema.subscription.map(|s| s.node.to_string());
                }
                TypeSystemDefinition::Type(ty) => {
                    let name = ty.node.name.node.to_string();
                    sdl.names.push(name.clone());
                    sdl.types.insert(name, ty.node);
                }
                // Juniper can't declare a directive of its own: `DirectiveType`
                // is in its private `schema` module. See the README.
                TypeSystemDefinition::Directive(_) => {}
            }
        }
        if !explicit {
            sdl.mutation = sdl.types.contains_key("Mutation").then(|| "Mutation".into());
            sdl.subscription = sdl.types.contains_key("Subscription").then(|| "Subscription".into());
        }
        Ok(sdl)
    }

    fn field(&self, type_name: &str, field: &str) -> Option<&FieldDefinition> {
        let fields = match &self.types.get(type_name)?.kind {
            TypeKind::Object(o) => &o.fields,
            TypeKind::Interface(i) => &i.fields,
            _ => return None,
        };
        fields.iter().map(|f| &f.node).find(|f| f.name.node.as_str() == field)
    }

    fn enum_first(&self, name: &str) -> Option<String> {
        match &self.types.get(name)?.kind {
            TypeKind::Enum(e) => e.values.first().map(|v| v.node.value.node.to_string()),
            _ => None,
        }
    }
}

fn named(ty: &SdlType) -> &str {
    match &ty.base {
        BaseType::Named(name) => name.as_str(),
        BaseType::List(inner) => named(inner),
    }
}

#[derive(Clone)]
struct Info {
    sdl: Arc<Sdl>,
    name: ArcStr,
}

impl Info {
    fn named(&self, name: &str) -> Info {
        Info { sdl: self.sdl.clone(), name: name.into() }
    }
}

// ---------------------------------------------------------------------------
// Input types. Juniper checks an input value with a plain `fn` pointer
// (`FromInputValue`), which can't see the type info. Enums get one Rust type
// per set of values, so that a literal is checked against its enum's values,
// as a derived `GraphQLEnum` checks it.

static ENUM_VALUES: Mutex<Vec<Vec<String>>> = Mutex::new(Vec::new());

struct EnumSlot<const N: usize>;

impl<const N: usize> FromInputValue<S> for EnumSlot<N> {
    type Error = FieldError<S>;

    // As `#[derive(GraphQLEnum)]` generates it: an enum value or a string.
    fn from_input_value(v: &InputValue<S>) -> Result<Self, Self::Error> {
        let name = v.as_enum_value().or_else(|| v.as_scalar().and_then(|s| s.try_as_str()));
        let values = ENUM_VALUES.lock().unwrap();
        match name {
            Some(name) if values[N].iter().any(|value| value == name) => Ok(EnumSlot),
            _ => Err(FieldError::from(format!("Unknown enum value: {v}"))),
        }
    }
}

macro_rules! enum_slots {
    ($($n:literal)*) => {
        fn enum_meta(slot: usize, name: ArcStr, values: &[EnumValue]) -> EnumMeta<S> {
            match slot {
                $($n => EnumMeta::new::<EnumSlot<$n>>(name, values),)*
                _ => panic!("the adapter has no enum slot left"),
            }
        }
    };
}

enum_slots!(0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30
    31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60 61
    62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92
    93 94 95 96 97 98 99 100 101 102 103 104 105 106 107 108 109 110 111 112 113 114 115 116 117
    118 119 120 121 122 123 124 125 126 127);

fn enum_slot(values: Vec<String>) -> usize {
    let mut slots = ENUM_VALUES.lock().unwrap();
    if let Some(slot) = slots.iter().position(|v| *v == values) {
        return slot;
    }
    slots.push(values);
    slots.len() - 1
}

// A custom scalar declared in the SDL: it takes any scalar literal. Juniper
// itself refuses a list or object literal for any scalar.
struct DynScalar;

impl FromInputValue<S> for DynScalar {
    type Error = FieldError<S>;
    fn from_input_value(_: &InputValue<S>) -> Result<Self, Self::Error> {
        Ok(DynScalar)
    }
}

impl ParseScalarValue<S> for DynScalar {
    fn from_str(token: ScalarToken<'_>) -> ParseScalarResult<S> {
        match token {
            ScalarToken::String(_) => <String as ParseScalarValue<S>>::from_str(token),
            ScalarToken::Int(v) | ScalarToken::Float(v) => v
                .parse::<i32>()
                .map(S::from)
                .or_else(|_| v.parse::<f64>().map(S::from))
                .map_err(|_| ParseError::ExpectedScalarError("a number")),
        }
    }
}

// An input object. Like `#[derive(GraphQLInputObject)]` (juniper_codegen
// 0.18.0, src/graphql_input_object/mod.rs:713-719), it takes an object only.
// Juniper checks the fields against the metadata itself.
struct DynInput;

impl FromInputValue<S> for DynInput {
    type Error = FieldError<S>;
    fn from_input_value(v: &InputValue<S>) -> Result<Self, Self::Error> {
        match v.to_object_value() {
            Some(_) => Ok(DynInput),
            None => Err(FieldError::from(format!("Expected input object, found: {v}"))),
        }
    }
}

// ---------------------------------------------------------------------------
// Metadata

fn register(registry: &mut Registry<S>, info: &Info, name: &str) {
    match name {
        "Int" => drop(registry.get_type::<i32>(&())),
        "Float" => drop(registry.get_type::<f64>(&())),
        "String" => drop(registry.get_type::<String>(&())),
        "Boolean" => drop(registry.get_type::<bool>(&())),
        "ID" => drop(registry.get_type::<ID>(&())),
        _ => drop(registry.get_type::<Obj>(&info.named(name))),
    }
}

fn type_ref(registry: &mut Registry<S>, info: &Info, ty: &SdlType) -> Type {
    let base = match &ty.base {
        BaseType::Named(name) => {
            register(registry, info, name.as_str());
            Type::nullable(ArcStr::from(name.as_str()))
        }
        BaseType::List(inner) => type_ref(registry, info, inner).wrap_list(None),
    };
    if ty.nullable {
        base
    } else {
        base.wrap_non_null()
    }
}

fn directive<'a>(directives: &'a [Positioned<ConstDirective>], name: &str) -> Option<&'a ConstDirective> {
    directives.iter().map(|d| &d.node).find(|d| d.name.node.as_str() == name)
}

fn string_arg(directive: &ConstDirective, name: &str) -> Option<String> {
    match directive.get_argument(name).map(|v| &v.node) {
        Some(ConstValue::String(s)) => Some(s.clone()),
        _ => None,
    }
}

// `@deprecated` without a reason has the directive's default reason.
fn deprecation(directives: &[Positioned<ConstDirective>]) -> Option<String> {
    directive(directives, "deprecated")
        .map(|d| string_arg(d, "reason").unwrap_or_else(|| "No longer supported".into()))
}

fn input_value(value: &ConstValue) -> InputValue<S> {
    match value {
        ConstValue::Null => InputValue::null(),
        ConstValue::Number(n) => match n.as_i64().and_then(|n| i32::try_from(n).ok()) {
            Some(n) => InputValue::scalar(n),
            None => InputValue::scalar(n.as_f64().unwrap_or(0.0)),
        },
        ConstValue::String(s) => InputValue::scalar(s.clone()),
        ConstValue::Boolean(b) => InputValue::scalar(*b),
        ConstValue::Enum(e) => InputValue::enum_value(e.as_str()),
        ConstValue::List(items) => InputValue::list(items.iter().map(input_value).collect()),
        ConstValue::Object(fields) => InputValue::object(
            fields.iter().map(|(k, v)| (k.to_string(), input_value(v))).collect(),
        ),
        ConstValue::Binary(_) => InputValue::null(),
    }
}

fn argument(registry: &mut Registry<S>, info: &Info, def: &InputValueDefinition) -> Argument<S> {
    let mut arg = Argument::new(def.name.node.as_str(), type_ref(registry, info, &def.ty.node));
    if let Some(d) = &def.description {
        arg = arg.description(d.node.as_str());
    }
    if let Some(default) = &def.default_value {
        arg = arg.default_value(input_value(&default.node));
    }
    if let Some(reason) = deprecation(&def.directives) {
        arg = arg.deprecated(Some(reason));
    }
    arg
}

fn field(registry: &mut Registry<S>, info: &Info, def: &FieldDefinition) -> Field<S> {
    let mut field = Field {
        name: def.name.node.as_str().into(),
        description: def.description.as_ref().map(|d| d.node.as_str().into()),
        arguments: None,
        field_type: type_ref(registry, info, &def.ty.node),
        deprecation_status: juniper::meta::DeprecationStatus::Current,
    };
    for a in &def.arguments {
        field = field.argument(argument(registry, info, &a.node));
    }
    if let Some(reason) = deprecation(&def.directives) {
        field = field.deprecated(Some(reason));
    }
    field
}

fn build_meta(info: &Info, registry: &mut Registry<S>) -> MetaType<S> {
    let name = info.name.as_str();
    // The roots Juniper uses for a schema without a mutation or subscription
    // type (`EmptyMutation`, `EmptySubscription`); introspection hides them.
    if name == "_EmptyMutation" || name == "_EmptySubscription" {
        return registry.build_object_type::<Obj>(info, &[]).into_meta();
    }
    let sdl = info.sdl.clone();
    if name == sdl.query {
        // Register every type, including those only reachable as the
        // implementation of an interface, as the macros do.
        for other in &sdl.names {
            if !BUILTIN_SCALARS.contains(&other.as_str()) {
                register(registry, info, other);
            }
        }
    }
    let def = &sdl.types[name];
    let description = def.description.as_ref().map(|d| d.node.clone());
    let interfaces = |registry: &mut Registry<S>, names: &[Positioned<async_graphql_value::Name>]| {
        names
            .iter()
            .map(|n| {
                register(registry, info, n.node.as_str());
                Type::nullable(ArcStr::from(n.node.as_str()))
            })
            .collect::<Vec<_>>()
    };
    let meta = match &def.kind {
        TypeKind::Object(o) => {
            let fields: Vec<_> = o.fields.iter().map(|f| field(registry, info, &f.node)).collect();
            let implements = interfaces(registry, &o.implements);
            let mut meta = registry.build_object_type::<Obj>(info, &fields).interfaces(&implements);
            if let Some(d) = description {
                meta = meta.description(d);
            }
            meta.into_meta()
        }
        TypeKind::Interface(i) => {
            let fields: Vec<_> = i.fields.iter().map(|f| field(registry, info, &f.node)).collect();
            let implements = interfaces(registry, &i.implements);
            let mut meta = registry.build_interface_type::<Obj>(info, &fields).interfaces(&implements);
            if let Some(d) = description {
                meta = meta.description(d);
            }
            meta.into_meta()
        }
        TypeKind::Union(u) => {
            let members = interfaces(registry, &u.members);
            let mut meta = registry.build_union_type::<Obj>(info, &members);
            if let Some(d) = description {
                meta = meta.description(d);
            }
            meta.into_meta()
        }
        TypeKind::Enum(e) => {
            let values: Vec<_> = e
                .values
                .iter()
                .map(|v| {
                    let v = &v.node;
                    let mut value = EnumValue::new(v.value.node.as_str());
                    if let Some(d) = &v.description {
                        value = value.description(d.node.as_str());
                    }
                    if let Some(reason) = deprecation(&v.directives) {
                        value = value.deprecated(Some(reason));
                    }
                    value
                })
                .collect();
            let slot = enum_slot(values.iter().map(|v| v.name.to_string()).collect());
            let mut meta = enum_meta(slot, info.name.clone(), &values);
            if let Some(d) = description {
                meta = meta.description(d);
            }
            meta.into_meta()
        }
        TypeKind::Scalar => {
            let mut meta = ScalarMeta::new::<DynScalar>(info.name.clone());
            if let Some(d) = description {
                meta = meta.description(d);
            }
            if let Some(url) = directive(&def.directives, "specifiedBy").and_then(|d| string_arg(d, "url")) {
                meta = meta.specified_by_url(url);
            }
            meta.into_meta()
        }
        TypeKind::InputObject(o) => {
            let fields: Vec<_> = o.fields.iter().map(|f| argument(registry, info, &f.node)).collect();
            let mut meta = InputObjectMeta::new::<DynInput>(info.name.clone(), &fields);
            if let Some(d) = description {
                meta = meta.description(d);
            }
            if directive(&def.directives, "oneOf").is_some() {
                meta = meta.one_of();
            }
            meta.into_meta()
        }
    };
    meta
}

// ---------------------------------------------------------------------------
// Execution state

struct Execution {
    id: Json,
    next_call: AtomicU64,
    // How many settles have been applied, for each call's `after` stamp.
    applied: AtomicU64,
    pending: Mutex<HashMap<u64, oneshot::Sender<Json>>>,
    ended: AtomicBool,
    inline_items: bool,
}

impl Execution {
    fn new(id: Json, inline_items: bool) -> Arc<Execution> {
        Arc::new(Execution {
            id,
            next_call: AtomicU64::new(0),
            applied: AtomicU64::new(0),
            pending: Mutex::new(HashMap::new()),
            ended: AtomicBool::new(false),
            inline_items,
        })
    }

    fn call(&self, path: &[Json], return_type: String) -> oneshot::Receiver<Json> {
        let call = self.next_call.fetch_add(1, Ordering::SeqCst) + 1;
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(call, tx);
        let after = self.applied.load(Ordering::SeqCst);
        send(json!({"type": "call", "id": self.id, "call": call, "path": path, "returnType": return_type, "after": after}));
        rx
    }
}

struct Ctx {
    exec: Arc<Execution>,
}

impl juniper::Context for Ctx {}

fn kind(outcome: &Json) -> &str {
    outcome["kind"].as_str().unwrap_or("")
}

fn failure(path: &[Json]) -> FieldError<S> {
    let path: Vec<String> = path.iter().map(|p| p.as_str().map_or_else(|| p.to_string(), String::from)).collect();
    FieldError::from(format!("resolver at {} failed", path.join(".")))
}

// The response name of the field an executor is for: the last entry of the
// path Juniper gives a new error.
fn response_name(executor: &Executor<Ctx, S>) -> String {
    executor.new_error(FieldError::from("")).path().last().cloned().unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Values

// An object, or a value of an interface or union type: `concrete` is its
// runtime type. The static type is the type info's name.
struct Obj {
    concrete: ArcStr,
    path: Vec<Json>,
}

// What a resolver returns, once settled.
enum Dyn {
    Obj(Obj),
    List(Vec<Dyn>),
    Null,
    Int(i32),
    Float(f64),
    Bool(bool),
    Str(String),
    Id(ID),
    // A value Juniper's leaf types don't produce themselves: an enum value
    // (what a derived enum's `resolve` returns for one of its values), or a
    // custom scalar's value.
    Raw(Value<S>),
    // A list item that hasn't settled yet (`deferred-items`).
    Pending { ty: SdlType, path: Vec<Json> },
}

fn build(sdl: &Sdl, ty: &SdlType, path: &[Json], outcome: &Json, inline: bool) -> Dyn {
    let name = named(ty);
    match kind(outcome) {
        "leaf" if matches!(ty.base, BaseType::List(_)) => Dyn::Raw(Value::scalar(1)),
        "leaf" => match name {
            "Int" => Dyn::Int(1),
            "Float" => Dyn::Float(1.5),
            "Boolean" => Dyn::Bool(true),
            "String" => Dyn::Str("v".into()),
            "ID" => Dyn::Id(ID::new("v")),
            _ => match sdl.enum_first(name) {
                Some(first) => Dyn::Raw(Value::scalar(first)),
                None => Dyn::Raw(Value::scalar("v")),
            },
        },
        // Only for a Float (`uncoercibleTypes`): an `f64` is what a Juniper
        // Float field returns, and it can be infinite. An `i32` can't hold
        // 1.2, and a Rust enum can't hold a name that isn't one of its
        // values, so a typed schema can't return those, and the kit doesn't
        // send them.
        "uncoercible" if name == "Float" => Dyn::Float(f64::INFINITY),
        "uncoercible" => {
            eprintln!("juniper adapter: an uncoercible {name}, which the adapter doesn't claim");
            Dyn::Null
        }
        "object" => Dyn::Obj(Obj {
            concrete: outcome["type"].as_str().unwrap_or("").into(),
            path: path.to_vec(),
        }),
        "list" => {
            let item_ty = match &ty.base {
                BaseType::List(inner) => (**inner).clone(),
                BaseType::Named(_) => ty.clone(),
            };
            let item_path = |i: usize| {
                let mut p = path.to_vec();
                p.push(json!(i));
                p
            };
            if inline {
                let items = outcome["items"].as_array().cloned().unwrap_or_default();
                Dyn::List(
                    items
                        .iter()
                        .enumerate()
                        .map(|(i, item)| build(sdl, &item_ty, &item_path(i), item, inline))
                        .collect(),
                )
            } else {
                let length = outcome["length"].as_u64().unwrap_or(0) as usize;
                Dyn::List(
                    (0..length)
                        .map(|i| Dyn::Pending { ty: item_ty.clone(), path: item_path(i) })
                        .collect(),
                )
            }
        }
        _ => Dyn::Null,
    }
}

// Completes a settled outcome through Juniper.
fn complete<'a>(
    info: &'a Info,
    ty: SdlType,
    path: Vec<Json>,
    outcome: Json,
    executor: &'a Executor<'a, 'a, Ctx, S>,
) -> BoxFuture<'a, ExecutionResult<S>> {
    Box::pin(async move {
        if kind(&outcome) == "error" {
            return Err(failure(&path));
        }
        let inline = executor.context().exec.inline_items;
        let value = build(&info.sdl, &ty, &path, &outcome, inline);
        let info = info.named(named(&ty));
        executor.resolve_async(&info, &value).await
    })
}

impl GraphQLType<S> for Obj {
    fn name(info: &Info) -> Option<ArcStr> {
        Some(info.name.clone())
    }

    fn meta(info: &Info, registry: &mut Registry<S>) -> MetaType<S> {
        build_meta(info, registry)
    }
}

impl GraphQLValue<S> for Obj {
    type Context = Ctx;
    type TypeInfo = Info;

    fn type_name(&self, info: &Info) -> Option<ArcStr> {
        Some(info.name.clone())
    }

    fn concrete_type_name(&self, _: &Ctx, _: &Info) -> String {
        self.concrete.to_string()
    }
}

impl GraphQLValueAsync<S> for Obj {
    // The one resolver.
    fn resolve_field_async<'a>(
        &'a self,
        info: &'a Info,
        field_name: &'a str,
        _: &'a Arguments<S>,
        executor: &'a Executor<Ctx, S>,
    ) -> BoxFuture<'a, ExecutionResult<S>> {
        Box::pin(async move {
            let ty = match info.sdl.field(&self.concrete, field_name) {
                Some(f) => f.ty.node.clone(),
                None => return Err(FieldError::from(format!("no field {field_name} on {}", self.concrete))),
            };
            let mut path = self.path.clone();
            path.push(json!(response_name(executor)));
            let rx = executor.context().exec.call(&path, ty.to_string());
            let outcome = rx.await.map_err(|_| FieldError::from("abandoned"))?;
            complete(info, ty, path, outcome, executor).await
        })
    }

    // As the macros do for interfaces and unions: resolve the value as its
    // concrete type.
    fn resolve_into_type_async<'a>(
        &'a self,
        info: &'a Info,
        type_name: &str,
        selection_set: Option<&'a [Selection<'a, S>]>,
        executor: &'a Executor<'a, 'a, Ctx, S>,
    ) -> BoxFuture<'a, ExecutionResult<S>> {
        let info = info.named(type_name);
        Box::pin(async move { self.resolve_async(&info, selection_set, executor).await })
    }
}

// A subscription root field, as `#[graphql_subscription]` generates it
// (juniper_codegen 0.18.0, src/common/field/mod.rs:318-380): the field's
// resolver returns the source stream, and each item is resolved with an
// owned executor. Its errors make the item an error.
impl GraphQLSubscriptionValue<S> for Obj {
    fn resolve_field_into_stream<'s, 'i, 'ft, 'args, 'e, 'ref_e, 'res, 'f>(
        &'s self,
        info: &'i Info,
        field_name: &'ft str,
        _: Arguments<'args, S>,
        executor: &'ref_e Executor<'ref_e, 'e, Ctx, S>,
    ) -> BoxFuture<'f, Result<Value<ValuesStream<'res, S>>, FieldError<S>>>
    where
        's: 'f,
        'i: 'res,
        'ft: 'f,
        'args: 'f,
        'ref_e: 'f,
        'res: 'f,
        'e: 'res,
    {
        Box::pin(async move {
            let ty = match info.sdl.field(&self.concrete, field_name) {
                Some(f) => f.ty.node.clone(),
                None => return Err(FieldError::from(format!("no field {field_name}"))),
            };
            let path = vec![json!(response_name(executor))];
            // The source stream. Its request for its one event is the root
            // `call`, and the settled outcome is the event.
            let exec = executor.context().exec.clone();
            let (p, t) = (path.clone(), ty.clone());
            let source = futures::stream::once(async move {
                let rx = exec.call(&p, t.to_string());
                rx.await.unwrap_or_else(|_| json!({"kind": "error"}))
            });
            let executor = executor.as_owned_executor();
            let info = info.clone();
            let stream = source.then(move |outcome| {
                let executor = executor.clone();
                let (info, ty, path) = (info.clone(), ty.clone(), path.clone());
                async move {
                    let ex = executor.as_executor();
                    match kind(&outcome) {
                        "error" => Err(vec![ex.new_error(failure(&path))]),
                        "null" => Ok(Value::null()),
                        _ => {
                            let value = build(&info.sdl, &ty, &path, &outcome, ex.context().exec.inline_items);
                            let info = info.named(named(&ty));
                            let val = ex.resolve_async(&info, &value).await.map_err(|e| vec![ex.new_error(e)])?;
                            let errs = ex.take_errors();
                            if !errs.is_empty() {
                                return Err(errs);
                            }
                            Ok(val)
                        }
                    }
                }
            });
            let stream: ValuesStream<'res, S> = Box::pin(stream);
            Ok(Value::Scalar(stream))
        })
    }
}

impl GraphQLValue<S> for Dyn {
    type Context = Ctx;
    type TypeInfo = Info;

    fn type_name(&self, info: &Info) -> Option<ArcStr> {
        match self {
            Dyn::Obj(_) => Some(info.name.clone()),
            _ => None,
        }
    }

    fn concrete_type_name(&self, _: &Ctx, info: &Info) -> String {
        match self {
            Dyn::Obj(o) => o.concrete.to_string(),
            _ => info.name.to_string(),
        }
    }
}

impl GraphQLValueAsync<S> for Dyn {
    fn resolve_async<'a>(
        &'a self,
        info: &'a Info,
        selection_set: Option<&'a [Selection<S>]>,
        executor: &'a Executor<Ctx, S>,
    ) -> BoxFuture<'a, ExecutionResult<S>> {
        match self {
            Dyn::Obj(o) => o.resolve_async(info, selection_set, executor),
            Dyn::List(items) => items.resolve_async(info, selection_set, executor),
            Dyn::Null => Box::pin(future::ready(Ok(Value::null()))),
            Dyn::Int(v) => Box::pin(async move { executor.resolve_with_ctx_async(&(), v).await }),
            Dyn::Float(v) => Box::pin(async move { executor.resolve_with_ctx_async(&(), v).await }),
            Dyn::Bool(v) => Box::pin(async move { executor.resolve_with_ctx_async(&(), v).await }),
            Dyn::Str(v) => Box::pin(async move { executor.resolve_with_ctx_async(&(), v).await }),
            Dyn::Id(v) => Box::pin(async move { executor.resolve_with_ctx_async(&(), v).await }),
            Dyn::Raw(v) => Box::pin(future::ready(Ok(v.clone()))),
            Dyn::Pending { ty, path } => Box::pin(async move {
                let rx = executor.context().exec.call(path, ty.to_string());
                let outcome = rx.await.map_err(|_| FieldError::from("abandoned"))?;
                complete(info, ty.clone(), path.clone(), outcome, executor).await
            }),
        }
    }
}

// ---------------------------------------------------------------------------
// Schemas

type Schema = RootNode<Obj, Obj, Obj, S>;

fn panic_message(e: Box<dyn std::any::Any + Send>) -> String {
    e.downcast_ref::<String>()
        .cloned()
        .or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string()))
        .unwrap_or_else(|| "panic".into())
}

fn build_schema(source: &str) -> Result<Schema, String> {
    let sdl = Arc::new(Sdl::parse(source)?);
    let root = |name: &str| Obj { concrete: name.into(), path: vec![] };
    let info = |name: &str| Info { sdl: sdl.clone(), name: name.into() };
    let query = sdl.query.clone();
    let mutation = sdl.mutation.clone().unwrap_or_else(|| "_EmptyMutation".into());
    let subscription = sdl.subscription.clone().unwrap_or_else(|| "_EmptySubscription".into());
    catch_unwind(AssertUnwindSafe(|| {
        let mut root = RootNode::new_with_info(
            root(&query),
            root(&mutation),
            root(&subscription),
            info(&query),
            info(&mutation),
            info(&subscription),
        );
        if let Some(description) = &sdl.description {
            root.schema.set_description(description.as_str());
        }
        root
    }))
    .map_err(|e| format!("Juniper panicked building the schema: {}", panic_message(e)))
}

// A subscription event as `juniper_graphql_ws` 0.6.0 sends it: its
// `NextPayload` (aliased `DataPayload` for graphql-ws) holds the
// `ExecutionOutput`'s data, and its errors only if there are any
// (`#[serde(skip_serializing_if = "Vec::is_empty")]`,
// src/server_message.rs:13-25). Serializing `ExecutionOutput` itself would
// always write `errors`, but no Juniper transport sends it that way.
fn event_payload(output: &juniper::ExecutionOutput<S>) -> Result<Json, String> {
    let mut payload = serde_json::Map::new();
    payload.insert("data".into(), serde_json::to_value(&output.data).map_err(|e| e.to_string())?);
    if !output.errors.is_empty() {
        payload.insert("errors".into(), serde_json::to_value(&output.errors).map_err(|e| e.to_string())?);
    }
    Ok(Json::Object(payload))
}

fn start(message: &Json, pool: &LocalPool, inline_items: bool) -> Result<(Arc<Execution>, RemoteHandle<()>), String> {
    let exec = Execution::new(message["id"].clone(), inline_items);
    let schema = build_schema(message["schema"].as_str().unwrap_or(""))
        .map_err(|e| format!("the adapter couldn't build the schema: {e}"))?;
    let variables: Option<InputValue<S>> = serde_json::from_value(message["variables"].clone()).ok();
    let request = GraphQLRequest::new(message["document"].as_str().unwrap_or("").to_string(), None, variables);
    let subscription = message["operationType"] == "subscription";
    let e = exec.clone();
    let task = async move {
        let ctx = Ctx { exec: e.clone() };
        let response: Result<Json, String> = if subscription {
            // As juniper_graphql_ws does: a `Coordinator` from
            // juniper_subscriptions, and the first `ExecutionOutput` of its
            // connection.
            let coordinator = juniper_subscriptions::Coordinator::new(schema);
            let subscribed = coordinator.subscribe(&request, &ctx).await;
            let response = match subscribed {
                Ok(mut connection) => match connection.next().await {
                    Some(output) => event_payload(&output),
                    None => Err("the response stream ended without an event".into()),
                },
                Err(err) => serde_json::to_value(GraphQLResponse::<S>::from_result(Err(err)))
                    .map_err(|e| e.to_string()),
            };
            response
        } else {
            let response = request.execute(&schema, &ctx).await;
            serde_json::to_value(&response).map_err(|e| e.to_string())
        };
        (response, subscription)
    };
    let e = exec.clone();
    let task = AssertUnwindSafe(task).catch_unwind().map(move |result| {
        if e.ended.load(Ordering::SeqCst) {
            return;
        }
        match result {
            Ok((Ok(response), _)) => send(json!({"type": "response", "id": e.id, "response": response})),
            Ok((Err(message), true)) => send(json!({"type": "stream-error", "id": e.id, "message": message})),
            Ok((Err(message), false)) => send(json!({"type": "no-response", "id": e.id, "message": message})),
            Err(panic) => send(json!({"type": "no-response", "id": e.id, "message": format!("Juniper panicked: {}", panic_message(panic))})),
        }
    });
    let handle = pool.spawner().spawn_local_with_handle(task).map_err(|e| e.to_string())?;
    Ok((exec, handle))
}

// ---------------------------------------------------------------------------
// Areas beyond execution

// Juniper's parser reads a scalar literal as the type of the argument it is
// given to, and when that isn't known, by its token, which needs a type of
// that name in the schema: a Float literal is a parse error against a schema
// without Float. So the parse schema has every built-in scalar.
const PARSE_SCHEMA: &str = "type Query { a: Int b: Float c: String d: Boolean e: ID }";

// parse: Juniper's parser, as `ValidatedOperation::new` calls it. It needs a
// schema, to read scalar literals by the type of the argument they're given
// to; with no field of the document in this one, a literal is read by its
// token: a String, an `i32` Int or an `f64` Float. A panic is a crash, not
// a rejection: the request gets no verdict.
fn parse(message: &Json, schema: &Schema) -> Json {
    let id = message["id"].clone();
    let source = message["source"].as_str().unwrap_or("");
    match catch_unwind(AssertUnwindSafe(|| juniper::parser::parse_document_source(source, &schema.schema).is_ok())) {
        Ok(ok) => json!({"type": "result", "id": id, "ok": ok}),
        Err(panic) => json!({"type": "error", "id": id, "message": format!("Juniper panicked: {}", panic_message(panic))}),
    }
}

// validate: parse, then `visit_all_rules`, as `ValidatedOperation::new` does.
fn validate(message: &Json) -> Json {
    let id = message["id"].clone();
    let schema = match build_schema(message["schema"].as_str().unwrap_or("")) {
        Ok(schema) => schema,
        Err(e) => return json!({"type": "error", "id": id, "message": format!("the adapter couldn't build the schema: {e}")}),
    };
    let document = message["document"].as_str().unwrap_or("");
    let result = catch_unwind(AssertUnwindSafe(|| {
        let parsed = match juniper::parser::parse_document_source(document, &schema.schema) {
            Ok(parsed) => parsed,
            Err(e) => return (false, vec![json!({"message": format!("parse error: {e}")})]),
        };
        let mut context = juniper::validation::ValidatorContext::new(&schema.schema, &parsed);
        juniper::validation::visit_all_rules(&mut context, &parsed);
        let errors: Vec<Json> = context
            .into_errors()
            .iter()
            .map(|e| {
                json!({"message": e.message(), "locations": e.locations().iter()
                    .map(|l| json!({"line": l.line() + 1, "column": l.column() + 1})).collect::<Vec<_>>()})
            })
            .collect();
        if !errors.is_empty() {
            return (false, errors);
        }
        // `ValidatedOperation::new` picks the document's one operation, and
        // executing it fails before any resolver runs if the schema has no
        // root type for it (`GraphQLError::NotSupported`,
        // src/executor/validated_operation.rs:347-355). So Juniper doesn't
        // execute such a document. With several operations, the kit names
        // none, and which one runs is the client's choice.
        let operations: Vec<_> = parsed
            .iter()
            .filter_map(|d| match d {
                juniper::Definition::Operation(op) => Some(op.item.operation_type),
                _ => None,
            })
            .collect();
        if let [operation_type] = operations[..] {
            let root = match operation_type {
                juniper::OperationType::Query => true,
                juniper::OperationType::Mutation => schema.schema.mutation_type().is_some(),
                juniper::OperationType::Subscription => schema.schema.subscription_type().is_some(),
            };
            if !root {
                let message = juniper::GraphQLError::NotSupported(operation_type).to_string();
                return (false, vec![json!({"message": message})]);
            }
        }
        (true, errors)
    }));
    match result {
        Ok((valid, errors)) => json!({"type": "result", "id": id, "valid": valid, "errors": errors}),
        // A panic is a crash: the request gets no verdict (docs/kit/validate.md).
        Err(panic) => json!({"type": "error", "id": id, "message": format!("Juniper panicked: {}", panic_message(panic))}),
    }
}

fn introspect(message: &Json) -> Json {
    let id = message["id"].clone();
    let schema = match build_schema(message["sdl"].as_str().unwrap_or("")) {
        Ok(schema) => schema,
        Err(e) => return json!({"type": "result", "id": id, "response": {"errors": [{"message": e}]}}),
    };
    let request = GraphQLRequest::<S>::new(message["query"].as_str().unwrap_or("").to_string(), None, None);
    let ctx = Ctx { exec: Execution::new(id.clone(), false) };
    let response = catch_unwind(AssertUnwindSafe(|| futures::executor::block_on(request.execute(&schema, &ctx))));
    match response {
        Ok(response) => json!({"type": "result", "id": id, "response": serde_json::to_value(&response).unwrap_or(Json::Null)}),
        Err(panic) => json!({"type": "error", "id": id, "message": format!("Juniper panicked: {}", panic_message(panic))}),
    }
}

fn main() {
    // Panics are caught and reported; keep stderr quiet about them.
    std::panic::set_hook(Box::new(|_| {}));
    let idle = !std::env::args().any(|a| a == "--no-idle");
    let inline_items = std::env::args().any(|a| a == "--inline-items");
    let mut capabilities = vec!["uncoercible-results", "mutation", "subscription", "parse", "validate", "introspect"];
    if !inline_items {
        capabilities.insert(0, "deferred-items");
    }
    if idle {
        capabilities.insert(0, "idle");
    }
    send(json!({
        "type": "hello",
        "protocol": 1,
        "name": format!("{VERSION} (GraphQLType with TypeInfo)"),
        "capabilities": capabilities,
        // Only a Float can hold a value its type can't represent in a
        // typed schema (an infinite `f64`).
        "uncoercibleTypes": ["Float"],
        // A Non-Null list item or subscription event is a non-`Option` Rust
        // type, which has no null.
        "nullItems": false,
    }));

    let parse_schema = build_schema(PARSE_SCHEMA).expect("the parse schema builds");
    let mut pool = LocalPool::new();
    // Dropping a RemoteHandle cancels its task, which is what `end` wants.
    let mut executions: HashMap<String, (Arc<Execution>, RemoteHandle<()>)> = HashMap::new();
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let message: Json = match serde_json::from_str(&line) {
            Ok(m) => m,
            Err(e) => {
                // A source with a lone surrogate can't be read into a Rust
                // string, so Juniper never sees it: the adapter can't carry
                // that input (docs/kit/parse.md).
                // serde_json says "unexpected end of hex escape" for a lone
                // leading surrogate and "lone leading surrogate in hex
                // escape" for a lone trailing one. The kit's JSON has no
                // other bad escapes.
                let surrogate = e.to_string().contains("hex escape");
                if surrogate && line.contains("\"type\":\"parse\"") {
                    if let Some(id) = line.split("\"id\":").nth(1).and_then(|r| r.split([',', '}']).next()) {
                        let id: Json = serde_json::from_str(id.trim()).unwrap_or(Json::Null);
                        send(json!({"type": "result", "id": id,
                            "unsupported": format!("lone surrogate: a Rust string can't hold the source ({e})")}));
                        continue;
                    }
                }
                eprintln!("juniper adapter: bad message: {e}");
                continue;
            }
        };
        let id = message["id"].clone();
        let key = id.to_string();
        match message["type"].as_str().unwrap_or("") {
            "parse" => {
                send(parse(&message, &parse_schema));
                continue;
            }
            "validate" => {
                send(validate(&message));
                continue;
            }
            "introspect" => {
                send(introspect(&message));
                continue;
            }
            "execute" => match start(&message, &pool, inline_items) {
                Ok(execution) => {
                    executions.insert(key, execution);
                }
                Err(e) => send(json!({"type": "error", "id": id, "message": e})),
            },
            "settle" => {
                let call = message["call"].as_u64().unwrap_or(0);
                let sender = executions.get(&key).and_then(|(exec, _)| {
                    let sender = exec.pending.lock().unwrap().remove(&call);
                    if sender.is_some() {
                        exec.applied.fetch_add(1, Ordering::SeqCst);
                    }
                    sender
                });
                match sender {
                    // The receiver may be gone: Juniper dropped that future.
                    Some(tx) => {
                        let _ = tx.send(message["outcome"].clone());
                    }
                    None => send(json!({"type": "error", "id": id, "message": format!("no pending call {call}")})),
                }
            }
            "end" => {
                if let Some((exec, handle)) = executions.remove(&key) {
                    exec.ended.store(true, Ordering::SeqCst);
                    drop(handle);
                }
                pool.run_until_stalled();
                continue;
            }
            other => {
                eprintln!("juniper adapter: unknown message type {other:?}");
                continue;
            }
        }
        pool.run_until_stalled();
        if idle {
            send(json!({"type": "idle", "id": id}));
        }
    }
}
