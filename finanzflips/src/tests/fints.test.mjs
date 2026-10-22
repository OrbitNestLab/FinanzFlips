import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { FinTSService } from "../fints-service.mjs";
function fixture() {
  let sent = "",
    args;
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin.on("data", (d) => (sent += d));
  child.kill = () => child.emit("exit", 0);
  const service = new FinTSService({
    python: "python",
    script: "fints-worker.py",
    spawnProcess: (...a) => {
      args = a;
      return child;
    },
  });
  return {
    service,
    child,
    get sent() {
      return sent;
    },
    get args() {
      return args;
    },
  };
}
test("ING credentials go only to stdin, never command arguments or environment", () => {
  const f = fixture(),
    s = f.service.start({
      username: "private-user",
      pin: "secret-pin",
      productId: "registered-id",
    });
  assert.ok(f.sent.includes("secret-pin"));
  assert.ok(!JSON.stringify(f.args).includes("secret-pin"));
  assert.ok(!JSON.stringify(f.args).includes("private-user"));
  assert.throws(() => f.service.start({}), /bereits/);
  f.service.cancel(s.id);
  assert.equal(f.service.active, null);
});
test("FinTS account selection validates bank-supplied IDs and does not permit arbitrary operations", () => {
  const f = fixture(),
    s = f.service.start({});
  f.child.stdout.write(
    JSON.stringify({
      type: "accounts",
      choices: [{ id: "0", name: "Extra-Konto" }],
    }) + "\n",
  );
  assert.throws(
    () => f.service.respond(s.id, { accounts: ["other"] }),
    /gültige/,
  );
  f.service.respond(s.id, {
    accounts: ["0"],
    operation: "transfer",
    amount: 999,
  });
  assert.ok(!f.sent.includes("transfer"));
  assert.equal(f.service.get(s.id).event.type, "waiting");
  f.service.cancel(s.id);
});
test("worker errors are controlled and stale sessions cannot be resumed", () => {
  const f = fixture(),
    s = f.service.start({});
  f.child.stderr.write("Sensitive library log");
  f.child.emit("error", Error("secret-pin"));
  assert.equal(f.service.get(s.id).event.type, "error");
  assert.ok(!f.service.get(s.id).event.message.includes("secret-pin"));
  f.service.cancel(s.id);
  assert.throws(() => f.service.get(s.id), /abgelaufen/);
});
