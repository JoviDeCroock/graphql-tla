using System.Text;
using System.Text.Json.Nodes;

namespace GraphQLTla.GraphQLDotnet;

// The adapter's side of the NDJSON channel: one line per message on stdout.
public static class Channel
{
    private static readonly StreamWriter Output = new(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
    private static readonly object WriteLock = new();
    private static readonly int StdinThread = Environment.CurrentManagedThreadId;
    private static int _brokenIdles;

    public static void Send(JsonObject message) => SendLine(message["type"]!.GetValue<string>(), message.ToJsonString());

    // A message whose JSON text is already built, such as a response
    // serialized by graphql-dotnet's serializer.
    public static void SendLine(string type, string line)
    {
        lock (WriteLock)
        {
            // `idle` relies on graphql-dotnet only running on the stdin
            // thread. Report anything that contradicts it.
            if (type is "call" or "response" or "stream-error" && Environment.CurrentManagedThreadId != StdinThread)
            {
                _brokenIdles++;
                Console.Error.WriteLine($"graphql-dotnet adapter: {type} sent off the stdin thread ({_brokenIdles}), so idle may be wrong: {line}");
            }
            Output.Write(line + "\n");
        }
    }
}
