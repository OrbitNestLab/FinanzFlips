import {localVault} from "../local-vault.mjs";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "finanzflips-test-")),
  base = "http://127.0.0.1:18790";
let child, revision;
let state = {
  schemaVersion: 2,
  accounts: [{ id: "a", name: "Testkonto", balance: 100 }],
  budgets: [],
  extraTransactions: [{ id: "t", merchant: "Test", amount: -10 }],
  transactions: [],
  loans: [],
};
async function start() {
  child = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: "18790",
      HOST: "127.0.0.1",
      FINANZFLIPS_DATA_DIR: dir,
      OPENAI_API_KEY: "",
      ENABLE_BANKING_APP_ID: "",
      APP_BASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.stderr.once("data", (d) => reject(Error(String(d))));
    child.once("error", reject);
  });
}
async function stop() {
  if (!child) return;
  const exit = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await exit;
  child = null;
}
async function get() {
  return (await fetch(base + "/api/app-state")).json();
}
async function put(s = state, rev = revision) {
  const r = await fetch(base + "/api/app-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ state: s, revision: rev }),
  });
  return { status: r.status, data: await r.json() };
}
before(start);
after(async () => {
  await stop();
  fs.rmSync(dir, { recursive: true, force: true });
});
test("fresh server has no fictitious finances; first versioned save succeeds", async () => {
  assert.equal((await get()).state, null);
  const r = await put(state, null);
  assert.equal(r.status, 200);
  revision = r.data.updatedAt;
  assert.deepEqual((await get()).state, state);
});
test("stale revision and legacy client cannot overwrite shared finances", async () => {
  assert.equal((await put({ ...state, accounts: [] }, "stale")).status, 409);
  const old = { ...state };
  delete old.schemaVersion;
  assert.equal((await put(old)).status, 409);
  assert.deepEqual((await get()).state, state);
});
test("two simultaneous saves with same revision accept exactly one", async () => {
  const a = { ...state, accounts: [{ ...state.accounts[0], balance: 120 }] },
    b = { ...state, accounts: [{ ...state.accounts[0], balance: 140 }] };
  const results = await Promise.all([put(a), put(b)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const current = await get();
  assert.ok([120, 140].includes(current.state.accounts[0].balance));
  state = current.state;
  revision = current.updatedAt;
});
test("invalid transactions cannot replace a complete state", async () => {
  const r = await put({
    ...state,
    extraTransactions: [{ merchant: "Bad", amount: "oops" }],
  });
  assert.equal(r.status, 400);
  assert.deepEqual((await get()).state, state);
});
test("foreign origin and unrecognized host are rejected", async () => {
  const r = await fetch(base + "/api/app-state", {
    headers: { Origin: "https://example.com" },
  });
  assert.equal(r.status, 403);
  const code = await new Promise((resolve, reject) =>
    http
      .get(
        base + "/api/app-state",
        { headers: { Host: "attacker.example:18790" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      )
      .on("error", reject),
  );
  assert.equal(code, 403);
});
test("source, secrets, test files and nested backups cannot be downloaded", async () => {
  for (const p of [
    "/server.mjs",
    "/banking.mjs",
    "/.env",
    "/.finanzflips-data.json",
    "/work/backups/private/.finanzflips-data.json",
    "/tests/model.test.mjs",
    "/assets/banks/sources.json",
  ])
    assert.equal((await fetch(base + p)).status, 404, p);
});
test("frontend modules have correct MIME and strict browser policies", async () => {
  const r = await fetch(base + "/model.mjs");
  assert.equal(r.status, 200);
  assert.ok(r.headers.get("content-type").startsWith("text/javascript"));
  assert.ok(
    r.headers.get("content-security-policy").includes("script-src 'self'"),
  );
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
});
test("local backups exist with private permissions and survive restart", async () => {
  const r = await fetch(base + "/api/app-state/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: '{"reason":"before-restore"}',
  });
  const b = await r.json();
  assert.equal(r.status, 200);
  const p = path.join(dir, ".finanzflips-backups", b.name);
  assert.equal(fs.statSync(p).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(p)).state, state);
  assert.equal(
    fs.statSync(path.join(dir, ".finanzflips-data.json")).mode & 0o777,
    0o600,
  );
  await stop();
  await start();
  assert.deepEqual((await get()).state, state);
});
test("bank setup clearly reports absent credentials without leaking secrets", async () => {
  const r = await fetch(base + "/api/enable/status"),
    s = await r.json();
  assert.equal(s.configured, false);
  assert.deepEqual(s.checks, {
    appId: false,
    privateKey: false,
    redirect: false,
    publicCertificate: false,
  });
  assert.equal((await fetch(base + "/api/enable/certificate")).status, 404);
  assert.equal(JSON.stringify(s).includes("PRIVATE KEY"), false);
});
test("malformed API JSON returns a controlled error", async () => {
  const r = await fetch(base + "/api/app-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: base },
    body: "{bad",
  });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /ungültige/);
});
test("bank setup serves a matching public X509 certificate and never the private key", async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const response = await fetch(base + "/api/enable/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      app_id: "test-app-123456",
      base_url: base,
      private_key: pem,
    }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).checks.publicCertificate, true);
  const text = await (await fetch(base + "/api/enable/certificate")).text();
  assert.ok(text.includes("BEGIN CERTIFICATE"));
  assert.ok(!text.includes("PRIVATE KEY"));
  const cert = new crypto.X509Certificate(text);
  assert.ok(
    cert.publicKey
      .export({ format: "der", type: "spki" })
      .equals(publicKey.export({ format: "der", type: "spki" })),
  );
  assert.equal(
    (await fetch(base + "/secrets/enable-banking-public.crt")).status,
    404,
  );
  assert.equal(
    fs.statSync(path.join(dir, "secrets/enable-banking-private.key")).mode &
      0o777,
    0o600,
  );
  const invalid = await fetch(base + "/api/enable/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      app_id: "test-app-123456",
      base_url: base + "/nested",
    }),
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual((await get()).state, state);
});
test("monthly AI limit stops chat and review before any external request", async () => {
  const setup = await fetch(base + "/api/ai/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ api_key: "sk_test_not_a_real_key_1234567890" }),
  });
  assert.equal(setup.status, 200);
  const p = path.join(dir, ".finanzflips-data.json"),
    data = JSON.parse(localVault(dir).read(p));
  const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" })
    .format(new Date())
    .slice(0, 7);
  data.ai = { month, usd: 5, reservations: {} };
  fs.writeFileSync(p, JSON.stringify(data), { mode: 0o600 });
  for (const [endpoint, body] of [
    ["chat", { message: "Test", finances: {} }],
    [
      "review",
      {
        candidates: [
          { id: "t", merchant: "Test", amount: -10, bookingDate: "2026-10-01" },
        ],
      },
    ],
  ]) {
    const r = await fetch(base + "/api/ai/" + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 429);
    assert.match((await r.json()).error, /5-US-Dollar/);
  }
  assert.deepEqual((await get()).state, state);
  assert.equal(JSON.parse(localVault(dir).read(p)).ai.usd, 5);
});
test("bank schedule is validated, persisted and leaves finances unchanged", async () => {
  const post = (mode) =>
    fetch(base + "/api/enable/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ mode }),
    });
  assert.equal((await post("every-minute")).status, 400);
  const response = await post("four");
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).schedule.hours, [8, 12, 16, 20]);
  await stop();
  await start();
  assert.equal(
    (await (await fetch(base + "/api/enable/status")).json()).schedule.mode,
    "four",
  );
  assert.deepEqual((await get()).state, state);
  await post("off");
});
test("FinTS cannot start without registration and private worker stays inaccessible", async () => {
  const response = await fetch(base + "/api/fints/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ username: "test", pin: "synthetic-only" }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Produktregistrierung/);
  for (const name of [
    "fints-worker.py",
    "fints-service.mjs",
    "bank-schedule.mjs",
  ]) {
    assert.equal((await fetch(base + "/" + name)).status, 404);
  }
});
