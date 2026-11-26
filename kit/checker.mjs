// The model checker that evaluates every TLA+ module the kit and the
// scripts write. By default it is the tla-ts CLI this package depends on,
// run with the current Node. Another checker can stand in if it takes the
// same arguments (`-workers N`, `-config F.cfg`, `F.tla`) and prints what
// tla-ts prints (PrintT values, and `Error:` lines when something fails):
//
//   TLA_CHECKER="<command>"   in the environment, or
//   --checker "<command>"     (or --checker=<command>) on any command line
//                             that runs the checker: the kit's CLI and the
//                             scripts in scripts/
//
// A command that names a .js, .mjs or .cjs file runs as a Node script with
// the current Node, so Node options (a bigger stack) still apply. Anything
// else runs as an executable: the command is split on whitespace, with
// single or double quotes grouping, and the checker's arguments follow it,
// for example TLA_CHECKER="java -cp tla2tools.jar tlc2.TLC".
//
// --checker is taken out of process.argv when this module loads, so the
// script's own argument parsing never sees it, and it is passed on to child
// processes as TLA_CHECKER. Import this module before reading process.argv.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// tla-ts exports only its package.json and its library, so its CLI is found
// next to the package.json, wherever the package manager put it.
const DEFAULT = join(dirname(createRequire(import.meta.url).resolve("tla-ts/package.json")), "dist/cli.js");

const fromArgv = () => {
  const argv = process.argv;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--checker") {
      if (i + 1 >= argv.length) throw new Error("--checker needs a command");
      return argv.splice(i, 2)[1];
    }
    if (argv[i].startsWith("--checker=")) return argv.splice(i, 1)[0].slice("--checker=".length);
  }
  return undefined;
};

const flagged = fromArgv();
if (flagged !== undefined) process.env.TLA_CHECKER = flagged;

// Splits a command into words: whitespace separates, quotes group, and a
// backslash escapes the next character outside single quotes.
export const splitCommand = (command) => {
  const words = [];
  let word = "";
  let quote = null;
  let started = false;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      started = true;
    } else if (c === "\\" && i + 1 < command.length) {
      word += command[++i];
      started = true;
    } else if (/\s/.test(c)) {
      if (started) words.push(word);
      word = "";
      started = false;
    } else {
      word += c;
      started = true;
    }
  }
  if (quote) throw new Error(`unclosed ${quote} in checker command: ${command}`);
  if (started) words.push(word);
  return words;
};

// The checker in use: { command, words, node }. `node` says whether it runs
// as a Node script (words[0] is then the script).
export const checker = () => {
  const command = process.env.TLA_CHECKER?.trim() || DEFAULT;
  const words = command === DEFAULT ? [DEFAULT] : splitCommand(command);
  if (words.length === 0) throw new Error("TLA_CHECKER is empty");
  return { command, words, node: words.length === 1 && /\.[cm]?js$/.test(words[0]) };
};

// Runs a Node script in a worker thread with a large stack, for modules that
// recurse deeper than Node's default stack allows.
const BIG_STACK = `
import { Worker } from "node:worker_threads";
const [script, ...args] = process.argv.slice(1);
const worker = new Worker(script, { argv: args, execArgv: [], resourceLimits: { stackSizeMb: 1024, maxOldGenerationSizeMb: 8192 } });
worker.on("exit", (code) => process.exit(code));
worker.on("error", (error) => { console.error(error); process.exit(1); });
`;

// Runs the checker on `args` in `cwd`, and resolves to { status, output }:
// its exit code and its stdout and stderr together.
//
// stack: "large" gives a Node checker a 3000 KB stack (--stack-size=3000);
// "huge" runs it in a worker thread with a 1 GB stack. Neither applies to a
// checker that isn't a Node script, whose own options set its stack.
export const runChecker = (args, { cwd, stack } = {}) =>
  new Promise((done) => {
    const { words, node } = checker();
    let file;
    let argv;
    if (node) {
      file = process.execPath;
      if (stack === "huge") argv = ["--input-type=module", "-e", BIG_STACK, words[0], ...args];
      else argv = [...(stack === "large" ? ["--stack-size=3000"] : []), words[0], ...args];
    } else {
      [file, ...argv] = [...words, ...args];
    }
    const child = spawn(file, argv, { cwd });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => done({ status: 127, output: output + `\nError: can't run the checker (${file}): ${error.message}\n` }));
    child.on("close", (status) => done({ status, output }));
  });
