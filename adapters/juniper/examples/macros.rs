// Reproduces the adapter's execution findings with an ordinary,
// macro-built Juniper schema, with no adapter code involved:
//
//     cargo run --release --example macros
//
// Each case prints the response a client would get, serialized as Juniper's
// HTTP integrations serialize it, and a subscription event as
// juniper_graphql_ws does.

use std::sync::atomic::{AtomicUsize, Ordering};

use futures::StreamExt;
use juniper::http::GraphQLRequest;
use juniper::{
    graphql_interface, graphql_object, graphql_subscription, EmptyMutation, EmptySubscription,
    FieldError, FieldResult, GraphQLObject, RootNode, SubscriptionCoordinator, ID,
};

static ID_CALLS: AtomicUsize = AtomicUsize::new(0);

// Only used through the `NodeValue` enum the macro generates.
#[allow(dead_code)]
#[graphql_interface(for = User)]
trait Node {
    fn id(&self) -> ID;
}

struct User;

#[graphql_object(impl = NodeValue)]
impl User {
    // Counts how often Juniper calls this resolver.
    fn id(&self) -> ID {
        ID_CALLS.fetch_add(1, Ordering::SeqCst);
        ID::new("1")
    }
    fn name(&self) -> Option<String> {
        Some("Ada".into())
    }
}

struct Post;

#[graphql_object]
impl Post {
    // A Non-Null field whose resolver fails.
    fn title(&self) -> FieldResult<String> {
        Err(FieldError::from("no title"))
    }
}

#[derive(GraphQLObject)]
struct Payload {
    likes: i32,
}

struct Liked;

#[graphql_object]
impl Liked {
    fn likes(&self) -> i32 {
        1
    }
    // A nullable field whose resolver fails.
    fn title(&self) -> FieldResult<Option<String>> {
        Err(FieldError::from("no title"))
    }
}

struct Query;

#[graphql_object]
impl Query {
    fn node() -> Option<NodeValue> {
        Some(User.into())
    }
    // [Post!]
    fn posts() -> Option<Vec<Post>> {
        Some(vec![Post])
    }
    // [[Post!]]
    fn matrix() -> Option<Vec<Option<Vec<Post>>>> {
        Some(vec![Some(vec![Post])])
    }
    // Float
    fn ratio() -> Option<f64> {
        Some(f64::INFINITY)
    }
}

struct Subscription;

type Events = std::pin::Pin<Box<dyn futures::Stream<Item = Payload> + Send>>;
type LikedEvents = std::pin::Pin<Box<dyn futures::Stream<Item = Liked> + Send>>;
type Failing = std::pin::Pin<Box<dyn futures::Stream<Item = FieldResult<Payload>> + Send>>;

#[graphql_subscription]
impl Subscription {
    // postLiked: Payload!
    async fn post_liked() -> Events {
        Box::pin(futures::stream::once(async { Payload { likes: 1 } }))
    }
    // liked: Liked!, whose event has a nullable field that fails
    async fn liked() -> LikedEvents {
        Box::pin(futures::stream::once(async { Liked }))
    }
    // failing: Payload!, whose one event is an error
    async fn failing() -> Failing {
        Box::pin(futures::stream::once(async { Err(FieldError::from("no event")) }))
    }
}

fn query(document: &str) -> String {
    let schema = RootNode::new(Query, EmptyMutation::<()>::new(), EmptySubscription::<()>::new());
    let request = GraphQLRequest::new(document.into(), None, None);
    let response = futures::executor::block_on(request.execute(&schema, &()));
    serde_json::to_string(&response).unwrap()
}

fn subscription(document: &str) -> String {
    let schema = RootNode::new(Query, EmptyMutation::<()>::new(), Subscription);
    let coordinator = juniper_subscriptions::Coordinator::new(schema);
    let request = GraphQLRequest::new(document.into(), None, None);
    futures::executor::block_on(async {
        let mut connection = coordinator.subscribe(&request, &()).await.unwrap();
        let output = connection.next().await.unwrap();
        // As juniper_graphql_ws 0.6.0's `NextPayload` serializes an event:
        // `errors` only if there are any (src/server_message.rs:13-25).
        let mut payload = serde_json::Map::new();
        payload.insert("data".into(), serde_json::to_value(&output.data).unwrap());
        if !output.errors.is_empty() {
            payload.insert("errors".into(), serde_json::to_value(&output.errors).unwrap());
        }
        serde_json::Value::Object(payload).to_string()
    })
}

fn main() {
    let fragments = "{ node { id ...F } } fragment F on User { id name }";
    println!("field collection: {fragments}\n  {}", query(fragments));
    println!("  User.id was called {} times\n", ID_CALLS.load(Ordering::SeqCst));

    let posts = "{ posts { title } }";
    println!("error path in a list: {posts}\n  {}\n", query(posts));

    let matrix = "{ matrix { title } }";
    println!("nested list: {matrix}\n  {}\n", query(matrix));

    let ratio = "{ ratio }";
    println!("non-finite Float: {ratio}\n  {}\n", query(ratio));

    let liked = "subscription { postLiked { likes } }";
    println!("subscription event: {liked}\n  {}\n", subscription(liked));

    let liked = "subscription { liked { likes title } }";
    println!("subscription error in a nullable field: {liked}\n  {}\n", subscription(liked));

    let failing = "subscription { failing { likes } }";
    println!("subscription error on a Non-Null root field: {failing}\n  {}", subscription(failing));
}
