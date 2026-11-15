# graphql-java adapter

A [graphql-tla conformance adapter](../../docs/conformance.md) for
[graphql-java](https://github.com/graphql-java/graphql-java) 26.2.

## Build

Needs JDK 21 and Maven.

```shell
cd adapters/graphql-java
mvn -q package        # writes target/graphql-java-adapter.jar (a fat jar)
```

## Run

```shell
node kit/cli.mjs run execution --adapter "adapters/graphql-java/run.sh"
node kit/cli.mjs run execution --adapter "adapters/graphql-java/run.sh" --strict
```

`run.sh` runs `java -jar target/graphql-java-adapter.jar`, with
`$JAVA_HOME/bin/java` if `JAVA_HOME` is set.

`--no-idle` leaves out `idle`, so the kit falls back to `--grace`.

## How it works

The schema is built with `SchemaParser` and `SchemaGenerator`. A
`WiringFactory` puts one data fetcher on every field, and a type resolver on
every interface and union that picks the object type named by the value's
`__typename`. The data fetcher sends `call`, stamped with `after` (the settles
applied so far), and returns a `CompletableFuture` that the kit's `settle`
completes.

Capabilities:

- `idle`: everything runs on the thread that reads stdin. graphql-java runs
  data fetchers and future continuations on the thread that calls
  `executeAsync` or completes a future, and the adapter installs no executor.
  So once a message has been handled, graphql-java is blocked on kit futures.
- `deferred-items` isn't claimed. graphql-java doesn't wait for a
  `CompletableFuture` that is a list item (`ExecutionStrategy#completeValueForList`
  only unboxes `Optional` and `DataFetcherResult`), so items are returned inline.
- `invalid-results`: wrong-shape values become field errors (type mismatch,
  unresolved type, Int/Float/Boolean coercion). `String` coerces anything with
  `String.valueOf` (`GraphqlStringCoercing`); the kit doesn't send objects for
  String or ID, which §3.5 lets a service coerce "where reasonable".
- `mutation`: graphql-java's default `AsyncSerialExecutionStrategy`.
- `error-propagation-off`: graphql-java's `@experimental_disableErrorPropagation`
  directive, added to the operation. It is built in, and
  `NonNullableFieldValidator` then stops throwing instead of propagating.
- `subscription`: graphql-java uses each source stream event as the root
  field's value (`SubscriptionExecutionStrategy#executeSubscriptionEvent`), so
  the source stream's request for its one event is the root `call`, and the
  settled outcome is the event.

## Known graphql-java deviation

When a subscription event's Non-Null root field ends up null, graphql-java
doesn't publish `{"data": null, "errors": [...]}` (§6.4.4). The event's
`NonNullableFieldWasNullException` fails the mapped future, and
`CompletionStageSubscriber` ends the response stream with `onError`. A client
gets no execution result, only the stream error, so the adapter reports a
response with only `errors`, which the kit rejects as malformed.
