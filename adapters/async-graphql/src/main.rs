// A graphql-tla adapter for async-graphql's dynamic schema
// (docs/conformance.md).
//
// The schema SDL is parsed with async-graphql-parser and rebuilt as dynamic
// types, with one resolver on every field. Each resolver sends `call` and
// awaits a oneshot channel that the main loop completes on the kit's
// `settle`.
//
// Everything runs on one thread, on a `futures` LocalPool, with no other
// source of wakeups: async-graphql uses only future combinators, so the only
// thing that can wake a task is a `settle` from the kit. After each message
// the adapter runs the pool until it is stalled (`run_until_stalled`), at
// which point every unfinished execution is parked on a kit channel, and
// says `idle`.
//
// Usage: graphql-tla-async-graphql [--no-idle]

use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use async_graphql::dynamic::{
    Enum, Field, FieldFuture, FieldValue, InputObject, InputValue, Interface, InterfaceField,
    Object, Scalar, Schema, Subscription, SubscriptionField, SubscriptionFieldFuture, TypeRef,
    Union,
};
use async_graphql::{Error, Name, Request, Value, Variables};
use async_graphql_parser::types::{BaseType, Type, TypeKind, TypeSystemDefinition};
use futures::channel::oneshot;
use futures::executor::LocalPool;
use futures::future::RemoteHandle;
use futures::task::LocalSpawnExt;
use futures::StreamExt;
use serde_json::{json, Value as Json};

const BUILTIN_SCALARS: [&str; 5] = ["Int", "Float", "String", "Boolean", "ID"];

fn send(message: Json) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{message}");
    let _ = out.flush();
}

// What a named type is, as far as the outcomes need to know.
#[derive(Clone)]
enum Kind {
    Scalar,
    Enum(String),
    Object,
    Abstract,
    Input,
}

type Kinds = Arc<HashMap<String, Kind>>;

// One execution: its id, its call counter and its pending calls.
struct Execution {
    id: Json,
    next_call: AtomicU64,
    // How many settles have been applied, for each call's `after` stamp.
    applied: AtomicU64,
    pending: Mutex<HashMap<u64, oneshot::Sender<Json>>>,
    ended: AtomicBool,
}

impl Execution {
    fn call(&self, path: Vec<String>, return_type: String) -> oneshot::Receiver<Json> {
        let call = self.next_call.fetch_add(1, Ordering::SeqCst) + 1;
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(call, tx);
        let after = self.applied.load(Ordering::SeqCst);
        send(json!({"type": "call", "id": self.id, "call": call, "path": path, "returnType": return_type, "after": after}));
        rx
    }
}

fn type_ref(ty: &Type) -> TypeRef {
    let base = match &ty.base {
        BaseType::Named(name) => TypeRef::Named(name.to_string().into()),
        BaseType::List(inner) => TypeRef::List(Box::new(type_ref(inner))),
    };
    if ty.nullable {
        base
    } else {
        TypeRef::NonNull(Box::new(base))
    }
}

fn named(ty: &Type) -> &str {
    match &ty.base {
        BaseType::Named(name) => name.as_str(),
        BaseType::List(inner) => named(inner),
    }
}

// The canonical leaf value for a named type.
fn leaf(kinds: &Kinds, name: &str) -> Value {
    match (name, kinds.get(name)) {
        (_, Some(Kind::Enum(first))) => Value::Enum(Name::new(first)),
        ("Int", _) => Value::from(1),
        ("Float", _) => Value::from(1.5),
        ("Boolean", _) => Value::from(true),
        _ => Value::from("v"),
    }
}

// The value a resolver returns for a non-error, non-null outcome, or for an
// inline list item (where null can only be FieldValue::NULL).
fn value_for(kinds: &Kinds, ty: &Type, outcome: &Json) -> FieldValue<'static> {
    match outcome["kind"].as_str().unwrap_or("") {
        // A leaf at a list position (a wrong shape) is the number 1.
        "leaf" if matches!(ty.base, BaseType::List(_)) => FieldValue::value(1),
        "leaf" => FieldValue::value(leaf(kinds, named(ty))),
        "object" => {
            let runtime = outcome["type"].as_str().unwrap_or("").to_string();
            match kinds.get(named(ty)) {
                Some(Kind::Abstract) => FieldValue::owned_any(()).with_type(runtime),
                _ => FieldValue::owned_any(()),
            }
        }
        "list" => {
            let items = outcome["items"].as_array().cloned().unwrap_or_default();
            match &ty.base {
                BaseType::List(item_ty) => {
                    FieldValue::list(items.iter().map(|item| value_for(kinds, item_ty, item)))
                }
                // Not reachable from the kit: a list outcome for a non-list type.
                BaseType::Named(_) => {
                    FieldValue::list(items.iter().map(|item| value_for(kinds, ty, item)))
                }
            }
        }
        _ => FieldValue::NULL,
    }
}

fn resolved(
    kinds: &Kinds,
    ty: &Type,
    path: &[String],
    outcome: Json,
) -> async_graphql::Result<Option<FieldValue<'static>>> {
    match outcome["kind"].as_str().unwrap_or("") {
        "error" => Err(Error::new(format!("resolver at {} failed", path.join(".")))),
        "null" => Ok(None),
        _ => Ok(Some(value_for(kinds, ty, &outcome))),
    }
}

fn field(name: &str, ty: &Type, exec: &Arc<Execution>, kinds: &Kinds) -> Field {
    let (exec, kinds, ty_) = (exec.clone(), kinds.clone(), ty.clone());
    Field::new(name, type_ref(ty), move |ctx| {
        let path = ctx.path_node.map(|p| p.to_string_vec()).unwrap_or_default();
        let rx = exec.call(path.clone(), ty_.to_string());
        let (kinds, ty) = (kinds.clone(), ty_.clone());
        FieldFuture::new(async move {
            let outcome = rx.await.map_err(|_| Error::new("abandoned"))?;
            resolved(&kinds, &ty, &path, outcome)
        })
    })
}

// A subscription root field. In async-graphql the stream's items are the
// root field's values; there is no resolver that runs on an event. So the
// source stream's request for its one event is the root `call`, and the
// settled outcome is the event (docs/conformance.md, `subscription`).
fn subscription_field(name: &str, ty: &Type, exec: &Arc<Execution>, kinds: &Kinds) -> SubscriptionField {
    let (exec, kinds, ty_) = (exec.clone(), kinds.clone(), ty.clone());
    SubscriptionField::new(name, type_ref(ty), move |ctx| {
        let path = ctx.path_node.map(|p| p.to_string_vec()).unwrap_or_default();
        let (exec, kinds, ty) = (exec.clone(), kinds.clone(), ty_.clone());
        SubscriptionFieldFuture::new(async move {
            let event = futures::stream::once(async move {
                let rx = exec.call(path.clone(), ty.to_string());
                let outcome = rx.await.map_err(|_| Error::new("abandoned"))?;
                // A stream item can't be None; FieldValue::NULL is the null.
                resolved(&kinds, &ty, &path, outcome).map(|v| v.unwrap_or(FieldValue::NULL))
            });
            Ok(event)
        })
    })
}

fn input_value(def: &async_graphql_parser::types::InputValueDefinition) -> InputValue {
    let value = InputValue::new(def.name.node.as_str(), type_ref(&def.ty.node));
    match &def.default_value {
        Some(default) => value.default_value(default.node.clone()),
        None => value,
    }
}

fn build_schema(sdl: &str, exec: &Arc<Execution>) -> Result<Schema, String> {
    let document = async_graphql_parser::parse_schema(sdl).map_err(|e| e.to_string())?;
    let (mut query, mut mutation, mut subscription) =
        ("Query".to_string(), None::<String>, None::<String>);
    let mut kinds = HashMap::new();
    let mut types = Vec::new();
    for definition in &document.definitions {
        match definition {
            TypeSystemDefinition::Schema(schema) => {
                let schema = &schema.node;
                if let Some(q) = &schema.query {
                    query = q.node.to_string();
                }
                mutation = schema.mutation.as_ref().map(|m| m.node.to_string());
                subscription = schema.subscription.as_ref().map(|s| s.node.to_string());
            }
            TypeSystemDefinition::Type(ty) => {
                let ty = &ty.node;
                let kind = match &ty.kind {
                    TypeKind::Scalar => Kind::Scalar,
                    TypeKind::Enum(e) => {
                        Kind::Enum(e.values.first().map(|v| v.node.value.node.to_string()).unwrap_or_default())
                    }
                    TypeKind::Object(_) => Kind::Object,
                    TypeKind::Interface(_) | TypeKind::Union(_) => Kind::Abstract,
                    TypeKind::InputObject(_) => Kind::Input,
                };
                kinds.insert(ty.name.node.to_string(), kind);
                types.push(ty);
            }
            TypeSystemDefinition::Directive(_) => {}
        }
    }
    let has = |name: &str| types.iter().any(|t| t.name.node.as_str() == name);
    if !document.definitions.iter().any(|d| matches!(d, TypeSystemDefinition::Schema(_))) {
        mutation = has("Mutation").then(|| "Mutation".to_string());
        subscription = has("Subscription").then(|| "Subscription".to_string());
    }
    let kinds: Kinds = Arc::new(kinds);

    let mut builder = Schema::build(&query, mutation.as_deref(), subscription.as_deref());
    for ty in types {
        let name = ty.name.node.as_str();
        builder = match &ty.kind {
            TypeKind::Scalar if BUILTIN_SCALARS.contains(&name) => builder,
            TypeKind::Scalar => builder.register(Scalar::new(name)),
            TypeKind::Enum(e) => builder.register(
                Enum::new(name).items(e.values.iter().map(|v| v.node.value.node.to_string())),
            ),
            TypeKind::Union(u) => builder.register(
                u.members.iter().fold(Union::new(name), |u, m| u.possible_type(m.node.as_str())),
            ),
            TypeKind::InputObject(o) => builder.register(
                o.fields.iter().fold(InputObject::new(name), |o, f| o.field(input_value(&f.node))),
            ),
            TypeKind::Interface(i) => {
                let mut interface = Interface::new(name);
                for imp in &i.implements {
                    interface = interface.implement(imp.node.as_str());
                }
                for f in &i.fields {
                    let f = &f.node;
                    let mut field = InterfaceField::new(f.name.node.as_str(), type_ref(&f.ty.node));
                    for a in &f.arguments {
                        field = field.argument(input_value(&a.node));
                    }
                    interface = interface.field(field);
                }
                builder.register(interface)
            }
            TypeKind::Object(o) if Some(name) == subscription.as_deref() => {
                let mut root = Subscription::new(name);
                for f in &o.fields {
                    let f = &f.node;
                    let mut field = subscription_field(f.name.node.as_str(), &f.ty.node, exec, &kinds);
                    for a in &f.arguments {
                        field = field.argument(input_value(&a.node));
                    }
                    root = root.field(field);
                }
                builder.register(root)
            }
            TypeKind::Object(o) => {
                let mut object = Object::new(name);
                for imp in &o.implements {
                    object = object.implement(imp.node.as_str());
                }
                for f in &o.fields {
                    let f = &f.node;
                    let mut field = field(f.name.node.as_str(), &f.ty.node, exec, &kinds);
                    for a in &f.arguments {
                        field = field.argument(input_value(&a.node));
                    }
                    object = object.field(field);
                }
                builder.register(object)
            }
        };
    }
    builder.finish().map_err(|e| e.to_string())
}

fn start(message: &Json, pool: &LocalPool) -> Result<(Arc<Execution>, RemoteHandle<()>), String> {
    let exec = Arc::new(Execution {
        id: message["id"].clone(),
        next_call: AtomicU64::new(0),
        applied: AtomicU64::new(0),
        pending: Mutex::new(HashMap::new()),
        ended: AtomicBool::new(false),
    });
    let schema = build_schema(message["schema"].as_str().unwrap_or(""), &exec)
        .map_err(|e| format!("the adapter couldn't build the schema: {e}"))?;
    let request = Request::new(message["document"].as_str().unwrap_or(""))
        .variables(Variables::from_json(message["variables"].clone()));
    let subscription = message["operationType"] == "subscription";
    let e = exec.clone();
    let task = async move {
        let response = if subscription {
            let mut stream = schema.execute_stream(request);
            stream.next().await.unwrap_or_default()
        } else {
            schema.execute(request).await
        };
        if !e.ended.load(Ordering::SeqCst) {
            let response = serde_json::to_value(&response).unwrap_or(Json::Null);
            send(json!({"type": "response", "id": e.id, "response": response}));
        }
    };
    let handle = pool.spawner().spawn_local_with_handle(task).map_err(|e| e.to_string())?;
    Ok((exec, handle))
}

fn main() {
    let idle = !std::env::args().any(|a| a == "--no-idle");
    let mut capabilities = vec!["invalid-results", "mutation", "subscription"];
    if idle {
        capabilities.insert(0, "idle");
    }
    send(json!({
        "type": "hello",
        "protocol": 1,
        "name": "async-graphql 7.0.17 (dynamic schema)",
        "capabilities": capabilities,
    }));

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
                eprintln!("async-graphql adapter: bad message: {e}");
                continue;
            }
        };
        let id = message["id"].clone();
        let key = id.to_string();
        match message["type"].as_str().unwrap_or("") {
            "execute" => match start(&message, &pool) {
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
                    // The receiver may be gone: async-graphql dropped that
                    // future, for example after a sibling failed.
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
            other => eprintln!("async-graphql adapter: unknown message type {other:?}"),
        }
        pool.run_until_stalled();
        if idle {
            send(json!({"type": "idle", "id": id}));
        }
    }
}
