// JSON permits raw Unicode separators, but some line readers (including
// Node's readline) treat them as message boundaries. Keep them inside strings.
export const stringifyLine = (message) =>
  JSON.stringify(message).replace(/[\u2028\u2029]/g, (character) =>
    character === "\u2028" ? "\\u2028" : "\\u2029",
  ) + "\n";

// The keys a JSON text repeats within one object, each as the path to the
// object followed by the key: [["data", "a"]] for {"data":{"a":1,"a":2}}.
// JSON.parse keeps the last of them silently, so a response that repeats a
// key can only be seen in its text (docs/conformance.md, `uniqueKeys`).
// Expects valid JSON; list items are numbered from 0.
export const duplicateKeys = (text) => {
  const found = [];
  let i = 0;
  const space = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++;
  };
  const string = () => {
    const start = i++;
    while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const value = (path) => {
    space();
    if (text[i] === "{") {
      i++;
      const seen = new Set();
      space();
      if (text[i] === "}") return void i++;
      for (;;) {
        space();
        const key = string();
        if (seen.has(key)) found.push([...path, key]);
        seen.add(key);
        space();
        i++; // :
        value([...path, key]);
        space();
        if (text[i++] === "}") return;
      }
    }
    if (text[i] === "[") {
      i++;
      space();
      if (text[i] === "]") return void i++;
      for (let n = 0; ; n++) {
        value([...path, n]);
        space();
        if (text[i++] === "]") return;
      }
    }
    if (text[i] === '"') return void string();
    while (i < text.length && !",}] \t\n\r".includes(text[i])) i++;
  };
  value([]);
  return found;
};
