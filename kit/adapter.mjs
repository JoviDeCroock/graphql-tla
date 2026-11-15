// Talking to an adapter: a subprocess that speaks newline-delimited JSON on
// stdin and stdout (docs/conformance.md). Its stderr passes through.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { stringifyLine } from "./ndjson.mjs";

export const PROTOCOL = 1;

export class Adapter {
  constructor(command) {
    this.command = command;
    this.child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "inherit"] });
    this.queue = [];
    this.waiting = null;
    this.exited = null;
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      if (line.trim() === "") return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        message = { type: "invalid", line };
      }
      this.queue.push(message);
      this.wake();
    });
    this.child.on("exit", (code, signal) => {
      this.exited = { code, signal };
      this.wake();
    });
    this.child.stdin.on("error", () => {});
  }

  wake() {
    const waiting = this.waiting;
    this.waiting = null;
    waiting?.();
  }

  send(message) {
    if (this.exited) throw new Error(`adapter exited (${JSON.stringify(this.exited)})`);
    this.child.stdin.write(stringifyLine(message));
  }

  // The next message, or null after `timeout` ms without one.
  async next(timeout) {
    for (;;) {
      if (this.queue.length > 0) {
        const message = this.queue.shift();
        if (message.type === "invalid") throw new Error(`adapter wrote a line that isn't JSON: ${message.line}`);
        return message;
      }
      if (this.exited) throw new Error(`adapter exited (${JSON.stringify(this.exited)})`);
      let timer;
      const timedOut = await new Promise((resolve) => {
        this.waiting = () => resolve(false);
        timer = setTimeout(() => resolve(true), timeout);
      });
      clearTimeout(timer);
      this.waiting = null;
      if (timedOut && this.queue.length === 0) return null;
    }
  }

  async hello(timeout = 10000) {
    const message = await this.next(timeout);
    if (message?.type !== "hello") throw new Error(`expected hello from the adapter, got ${JSON.stringify(message)}`);
    if (message.protocol !== PROTOCOL) {
      throw new Error(`adapter speaks protocol ${message.protocol}; this kit speaks ${PROTOCOL}`);
    }
    this.name = message.name ?? this.command;
    this.capabilities = new Set(message.capabilities ?? []);
    // Execution only (docs/conformance.md, "Capabilities"): the leaf types
    // `uncoercible-results` covers, all of them if absent, and whether the
    // adapter can return null for a Non-Null list item or subscription
    // event.
    if (message.uncoercibleTypes !== undefined) {
      const known = ["Int", "Float", "Enum"];
      if (!Array.isArray(message.uncoercibleTypes) || message.uncoercibleTypes.some((t) => !known.includes(t))) {
        throw new Error(`uncoercibleTypes must be a list of ${known.join(", ")}; got ${JSON.stringify(message.uncoercibleTypes)}`);
      }
      this.uncoercibleTypes = new Set(message.uncoercibleTypes);
    }
    if (message.nullItems !== undefined && typeof message.nullItems !== "boolean") {
      throw new Error(`nullItems must be a boolean; got ${JSON.stringify(message.nullItems)}`);
    }
    this.nullItems = message.nullItems !== false;
    return message;
  }

  close() {
    this.child.stdin.end();
    this.child.kill();
  }
}
