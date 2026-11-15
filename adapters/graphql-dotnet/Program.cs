// A graphql-tla adapter for graphql-dotnet (docs/conformance.md).
//
// Every field of the schema gets one resolver, which tells the kit it was
// called and returns a Task that the stdin reader completes when the kit
// settles that call.
//
// Usage: run.sh [--no-idle] [--inline-items]
//
// Everything runs on the thread that reads stdin. graphql-dotnet doesn't
// schedule work of its own (no Task.Run, Task.Yield or thread pool use in
// the GraphQL package), and the adapter completes each resolver's
// TaskCompletionSource synchronously, so graphql-dotnet's continuations run
// inline on this thread until every remaining path waits on the kit. Then
// control returns to the read loop, and the adapter says `idle`. Every
// `call` and `response` is checked to come from this thread; one that
// doesn't is reported on stderr as a broken idle.

using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using GraphQL.Types;
using GraphQLTla.GraphQLDotnet;

var idle = !args.Contains("--no-idle");
var deferredItems = !args.Contains("--inline-items");

var capabilities = new JsonArray();
if (idle) capabilities.Add("idle");
if (deferredItems) capabilities.Add("deferred-items");
capabilities.Add("invalid-results");
capabilities.Add("uncoercible-results");
capabilities.Add("mutation");
capabilities.Add("subscription");
foreach (var area in Areas.Names) capabilities.Add(area);
foreach (var capability in Areas.Capabilities) capabilities.Add(capability);

var version = typeof(Schema).Assembly
    .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion?.Split('+')[0] ?? "?";
Channel.Send(new JsonObject
{
    ["type"] = "hello",
    ["protocol"] = 1,
    ["name"] = $"graphql-dotnet {version}",
    ["capabilities"] = capabilities,
});

var executions = new Dictionary<int, Execution>();
var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
string? line;
while ((line = input.ReadLine()) is not null)
{
    if (string.IsNullOrWhiteSpace(line)) continue;
    using var doc = JsonDocument.Parse(line);
    var message = doc.RootElement;
    var type = message.GetProperty("type").GetString();
    var id = message.GetProperty("id").GetInt32();
    switch (type)
    {
        case "execute":
            var execution = new Execution(id, deferredItems);
            executions[id] = execution;
            // Runs graphql-dotnet until it waits on the kit.
            execution.Start(message.Clone());
            break;
        case "settle":
            var call = message.GetProperty("call").GetInt32();
            // Runs graphql-dotnet's continuations inline, until it waits on the kit again.
            if (!executions.TryGetValue(id, out var settled) || !settled.Settle(call, message.GetProperty("outcome").Clone()))
            {
                Channel.Send(new JsonObject { ["type"] = "error", ["id"] = id, ["message"] = $"no pending call {call}" });
            }
            break;
        case "end":
            // Anything still pending is abandoned: its Task never completes.
            if (executions.Remove(id, out var ended)) ended.End();
            continue;
        default:
            if (Areas.Names.Contains(type))
            {
                Channel.Send(Areas.Answer(type!, id, message));
            }
            else
            {
                Channel.Send(new JsonObject { ["type"] = "error", ["id"] = id, ["message"] = $"unknown message type {type}" });
            }
            continue;
    }
    if (idle) Channel.Send(new JsonObject { ["type"] = "idle", ["id"] = id });
}
