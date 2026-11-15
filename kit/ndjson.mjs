// JSON permits raw Unicode separators, but some line readers (including
// Node's readline) treat them as message boundaries. Keep them inside strings.
export const stringifyLine = (message) =>
  JSON.stringify(message).replace(/[\u2028\u2029]/g, (character) =>
    character === "\u2028" ? "\\u2028" : "\\u2029",
  ) + "\n";
