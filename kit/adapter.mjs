// Talking to an adapter: a subprocess that speaks newline-delimited JSON on
// stdin and stdout (docs/conformance.md). Its stderr passes through.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

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
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
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
    return message;
  }

  close() {
    this.child.stdin.end();
    this.child.kill();
  }
}
