import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { createBankCallback } from "../bank-callback.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "finanzflips-callback-"));
let callback,
  upstream,
  cert,
  callbackPort,
  mainPort,
  received = [];
before(async () => {
  fs.writeFileSync(
    path.join(dir, "tls.cnf"),
    "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\n",
  );
  execFileSync(
    "openssl",
    [
      "req",
      "-new",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-x509",
      "-days",
      "1",
      "-config",
      path.join(dir, "tls.cnf"),
      "-keyout",
      path.join(dir, "tls.key"),
      "-out",
      path.join(dir, "tls.crt"),
    ],
    { stdio: "ignore" },
  );
  cert = fs.readFileSync(path.join(dir, "tls.crt"));
  upstream = http.createServer((req, res) => {
    received.push({
      url: req.url,
      cookie: req.headers.cookie,
      authorization: req.headers.authorization,
    });
    res.writeHead(303, { Location: "/?connected=1#/bank" });
    res.end();
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  mainPort = upstream.address().port;
  callback = createBankCallback({
    key: fs.readFileSync(path.join(dir, "tls.key")),
    cert,
    root: process.cwd(),
    mainPort,
  });
  await new Promise((resolve) => callback.listen(0, "127.0.0.1", resolve));
  callbackPort = callback.address().port;
});
after(async () => {
  await Promise.all([
    new Promise((resolve) => callback.close(resolve)),
    new Promise((resolve) => upstream.close(resolve)),
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});
function request(route, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "127.0.0.1",
        servername: "localhost",
        port: callbackPort,
        path: route,
        ca: cert,
        ...options,
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}
test("local HTTPS serves only the landing page and its registration notices", async () => {
  assert.equal((await request("/")).status, 200);
  assert.match((await request("/privacy.html")).body, /Lokale Speicherung/);
  assert.match(
    (await request("/terms.html")).body,
    /private Installation|privaten Nutzung/i,
  );
  for (const route of [
    "/api/app-state",
    "/.env",
    "/server.mjs",
    "/secrets/localhost-tls.key",
    "/callback/../api/app-state",
  ])
    assert.equal((await request(route)).status, 404, route);
  assert.equal(
    (await request("/", { headers: { Host: "attacker.example" } })).status,
    403,
  );
});
test("only the callback is forwarded; browser credentials stay out of the local request", async () => {
  const r = await request("/callback?state=synthetic&code=example", {
    headers: { Cookie: "test-cookie", Authorization: "Bearer test-only" },
  });
  assert.equal(r.status, 303);
  assert.equal(
    r.headers.location,
    `http://finanzflips.localhost:${mainPort}/?connected=1#/bank`,
  );
  assert.equal(r.headers["referrer-policy"], "no-referrer");
  assert.deepEqual(received, [
    {
      url: "/callback?state=synthetic&code=example",
      cookie: undefined,
      authorization: undefined,
    },
  ]);
  assert.equal(
    (await request("/callback?state=synthetic", { method: "HEAD" })).status,
    405,
  );
  assert.equal((await request("/callback", { method: "POST" })).status, 405);
  assert.equal(received.length, 1);
});
