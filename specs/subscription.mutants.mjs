export default [
  {
    name: "reports a subscribe resolver error like a Non-Null root field error, with data: null",
    find: 'resolverRaised = true;\n    subscribeResult = "requestError";',
    replace: 'resolverRaised = true;\n    subscribeResult = "dataNull";',
    property: "creationFailureIsRequestError",
  },
  {
    name: "a Non-Null likes error nulls postLiked but stops there, though postLiked is Non-Null",
    find: 'if (postLiked === "error" || likes === "error") {\n    response[k] = "dataNull";',
    replace: 'if (postLiked === "error") {\n    response[k] = "dataNull";',
    property: "responseMatchesOutcome",
  },
  {
    name: "pulls the next source event without awaiting the previous execution, like a push-based emitter",
    find: "if (executing.size > 0) return;\n  if (pulled >= arrived) return;",
    replace: "if (pulled >= arrived) return;",
    property: "responsesInSourceOrder",
  },
  {
    name: "a Non-Null root error escapes ExecuteSubscriptionEvent, so the mapper closes the source and rethrows",
    find: "  if (!returnRequested) delivered.push(k);\n};",
    replace:
      '  if (response[k] === "dataNull") {\n    sourceReturned = true;\n    rethrown = true;\n    closed = "error";\n  } else if (!returnRequested) {\n    delivered.push(k);\n  }\n};',
    property: "closesOnlyForCause",
  },
  {
    name: "swallows a source error and completes the response stream normally",
    find: 'rethrown = true;\n    closed = "error";\n  } else {',
    replace: 'closed = "done";\n  } else {',
    property: "sourceErrorIsRethrown",
  },
  {
    name: "delivers the response of an event in flight when the client unsubscribed, before return() completes (graphql-js 17)",
    find: "if (!returnRequested) delivered.push(k);",
    replace: 'if (closed === "open") delivered.push(k);',
    property: "nothingNewAfterUnsubscribe",
  },
  {
    name: "return() resolves at once while an event is in flight, whose response then arrives (graphql-js 16)",
    find: "if (!returnRequested) delivered.push(k);",
    replace: "delivered.push(k);",
    property: "nothingAfterClose",
  },
  {
    name: "a source error that arrived before the client unsubscribed still ends the cancelled stream with that error",
    find: 'if (closed !== "open" || rethrown || returnRequested) return;',
    replace: 'if (closed !== "open" || rethrown) return;',
    property: "cancelCompletesNormally",
  },
  {
    name: "nothing makes return() complete the cancelled response stream, like a mapper that completes it only on the client's next pull",
    find: "/** @fair */\nexport const finishReturn",
    replace: "export const finishReturn",
    property: "completesOnceCancelled",
  },
  {
    name: "completes as soon as the source reports done, dropping events still buffered",
    find: "if (pulled < arrived) return; // events still buffered",
    replace: "",
    property: "everyEventIsAnswered",
  },
  {
    name: "rethrows a source error but leaves the response stream open (graphql-js 16 mapAsyncIterator)",
    find: 'rethrown = true;\n    closed = "error";\n  } else {',
    replace: "rethrown = true;\n  } else {",
    property: "completesOnceSourceEnds",
  },
  {
    name: "a plain async-generator mapper: return() can't reach the source while parked on source.next()",
    find: "if (!returnRequested || sourceReturned) return;",
    replace:
      'if (!returnRequested || sourceReturned) return;\n  if (executing.size === 0 && source === "open") return;',
    property: "sourceIsCleanedUp",
  },
];
