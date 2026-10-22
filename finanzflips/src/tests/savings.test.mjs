import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import {
  cents,
  decimal,
  calculateSavingsAmount,
  bookedSnapshot,
  validIngIban,
  epcPayload,
  savingsSlot,
  nextSavingsRun,
  DEFAULT_SAVINGS,
} from "../savings-core.mjs";
import { SavingsService } from "../savings-service.mjs";
import { localVault } from "../local-vault.mjs";
import { validateIngress } from "../ha-security.mjs";
// Mathematically valid synthetic ING numbers, never transmitted to a bank.
function iban(number) {
  const b = "50010517" + String(number).padStart(10, "0");
  const mod = BigInt(b + "131400") % 97n;
  return "DE" + String(98n - mod).padStart(2, "0") + b;
}
const source = iban(1),
  target = iban(2);
function fixture() {
  let data = {},
    time = new Date("2026-11-23T10:00:00Z"),
    balance = 284000,
    error = false,
    calls = 0,
    push = 0;
  const deps = {
    read: () => structuredClone(data),
    write: (d) => {
      data = structuredClone(d);
    },
    now: () => new Date(time),
    sourceAccounts: () => [{ id: "giro", name: "Testgiro", iban: source }],
    fetchBalance: async () => {
      calls++;
      if (error) throw Error("private bank details");
      return {
        balanceCents: balance,
        fetchedAt: time.toISOString(),
        balanceType: "ITBD",
      };
    },
    notify: async () => {
      push++;
      return { sent: 1 };
    },
  };
  let service = new SavingsService(deps);
  service.settings({
    sourceId: "giro",
    targetIban: target,
    recipient: "Test Person",
    targetName: "Extra",
    day: 10,
    time: "15:00",
    confirmTarget: true,
  });
  return {
    get service() {
      return service;
    },
    get data() {
      return data;
    },
    get calls() {
      return calls;
    },
    get push() {
      return push;
    },
    set balance(n) {
      balance = n;
    },
    set error(v) {
      error = v;
    },
    set time(t) {
      time = new Date(t);
    },
    restart() {
      service = new SavingsService(deps);
    },
  };
}
const run = (f) => f.service.run({ requestId: crypto.randomUUID() });
test("cent-precise balance rules including negative and exact boundary", () => {
  for (const [b, a] of [
    ["500", 0],
    ["1000", 0],
    ["1850.75", 85075],
    ["3250", 225000],
    ["-500", 0],
    ["3750.85", 275085],
  ])
    assert.equal(calculateSavingsAmount(cents(b)), a);
  assert.equal(decimal(85075), "850.75");
  for (const b of [1.23, "NaN", "1e3", "1,00", "1.001"])
    assert.throws(() => cents(b));
});
test("only fresh booked EUR balances; available including overdraft is never used", () => {
  const now = Date.parse("2026-11-10T14:00Z"),
    times = {
      requestedAt: "2026-11-10T13:59:59Z",
      receivedAt: "2026-11-10T14:00Z",
      now,
    };
  const b = (type, amount = "1850.75", currency = "EUR") => ({
    balance_type: type,
    balance_amount: { amount, currency },
  });
  assert.equal(
    bookedSnapshot({ balances: [b("CLAV", "9000"), b("ITBD")] }, times)
      .balanceCents,
    185075,
  );
  assert.throws(() => bookedSnapshot({ balances: [b("CLAV")] }, times));
  assert.throws(() =>
    bookedSnapshot({ balances: [b("ITBD", "10", "USD")] }, times),
  );
  assert.throws(() =>
    bookedSnapshot({ balances: [b("ITBD")] }, { ...times, now: now + 61000 }),
  );
  assert.throws(() =>
    bookedSnapshot(
      { balances: [b("ITBD")] },
      { ...times, receivedAt: "2026-11-11T14:00Z" },
    ),
  );
  assert.throws(() =>
    bookedSnapshot(
      { balances: [{ ...b("CLBD"), reference_date: "2026-10-01" }] },
      times,
    ),
  );
  assert.equal(
    bookedSnapshot({ balances: [b("CLBD"), b("XPCD", "2000")] }, times)
      .pendingKnown,
    false,
  );
});
test("Berlin monthly schedule starts November 2026, handles summer/winter and restart catchup", () => {
  const s = DEFAULT_SAVINGS;
  assert.equal(savingsSlot(new Date("2026-10-10T14:00Z"), s), null);
  assert.equal(savingsSlot(new Date("2026-11-10T13:59Z"), s), null);
  assert.equal(
    savingsSlot(new Date("2026-11-10T14:00Z"), s),
    "2026-11-10T15:00",
  );
  assert.equal(savingsSlot(new Date("2027-06-10T12:59Z"), s), null);
  assert.equal(
    savingsSlot(new Date("2027-06-10T13:00Z"), s),
    "2027-06-10T15:00",
  );
  assert.equal(
    savingsSlot(new Date("2026-11-12T10:00Z"), s),
    "2026-11-10T15:00",
  );
  assert.equal(
    nextSavingsRun(new Date("2026-10-22T10:00Z"), s),
    "2026-11-10T15:00",
  );
});
test("manual run freshly fetches each time, same operation, no push and no payment", async () => {
  const f = fixture();
  const a = await run(f);
  assert.equal(a.amountCents, 184000);
  assert.equal(a.status, "calculated");
  f.balance = 185075;
  const b = await run(f);
  assert.equal(b.id, a.id);
  assert.equal(b.amountCents, 85075);
  assert.equal(f.calls, 2);
  assert.equal(f.push, 0);
  assert.throws(() => f.service.payment(a.id));
});
test("concurrent double tap, retry key and prepared operation never create duplicates", async () => {
  const f = fixture(),
    requestId = crypto.randomUUID();
  const [a, b] = await Promise.all([
    f.service.run({ requestId }),
    f.service.run({ requestId }),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(f.calls, 1);
  await f.service.run({ requestId });
  assert.equal(f.calls, 1);
  await f.service.prepare(a.id, { confirm: true, quote: a.quote });
  const reused = await run(f);
  assert.equal(reused.id, a.id);
  assert.equal(f.calls, 2);
  assert.equal(f.data.operations.length, 1);
});
test("recheck changes amount, requires explicit new confirmation, failure revokes stale quote", async () => {
  const f = fixture();
  const a = await run(f);
  f.balance = 200000;
  const changed = await f.service.prepare(a.id, {
    confirm: true,
    quote: a.quote,
  });
  assert.equal(changed.changed, true);
  assert.equal(changed.status, "calculated");
  await assert.rejects(() =>
    f.service.prepare(a.id, { confirm: true, quote: a.quote }),
  );
  f.error = true;
  await assert.rejects(() =>
    f.service.prepare(a.id, { confirm: true, quote: changed.quote }),
  );
  assert.equal(f.data.operations[0].amountCents, null);
  assert.throws(() => f.service.payment(a.id));
  assert.ok(!JSON.stringify(f.data).includes("private bank details"));
});
test("manual confirmation never inferred from QR; new monthly transfer explicitly confirmed", async () => {
  const f = fixture();
  let a = await run(f);
  a = await f.service.prepare(a.id, { confirm: true, quote: a.quote });
  assert.equal(f.service.payment(a.id).status, "prepared");
  assert.throws(() => f.service.update(a.id, { action: "confirm" }));
  f.service.update(a.id, { action: "confirm", confirm: true });
  await assert.rejects(
    () => run(f),
    (e) => e.code === "NEW_CONFIRMATION",
  );
  const b = await f.service.run({
    requestId: crypto.randomUUID(),
    confirmNew: true,
    previousId: a.id,
  });
  assert.notEqual(a.id, b.id);
  assert.equal(
    f.data.operations.find((o) => o.id === a.id).confirmation,
    "manual",
  );
});
test("expired payment cannot be copied; target changes blocked until cancellation", async () => {
  const f = fixture();
  let a = await run(f);
  a = await f.service.prepare(a.id, { confirm: true, quote: a.quote });
  f.time = "2026-11-23T10:06:00Z";
  assert.throws(() => f.service.payment(a.id));
  assert.throws(() =>
    f.service.settings({
      ...f.data.settings,
      recipient: "Other",
      confirmTarget: true,
    }),
  );
  assert.throws(() => f.service.update(a.id, { action: "cancel" }));
  f.service.update(a.id, { action: "cancel", confirm: true });
  f.service.settings({
    ...f.data.settings,
    recipient: "Other",
    confirmTarget: true,
  });
});
test("scheduler stays off initially, persists once monthly across restart, bounded retry", async () => {
  const f = fixture();
  await f.service.tick();
  assert.equal(f.calls, 0);
  f.service.activate({
    enabled: true,
    confirm: true,
    acceptHostRequirement: true,
  });
  f.error = true;
  await f.service.tick();
  assert.equal(f.calls, 1);
  f.restart();
  await f.service.tick();
  assert.equal(f.calls, 1);
  f.time = "2026-11-23T10:06:00Z";
  await f.service.tick();
  assert.equal(f.calls, 2);
  f.time = "2026-11-23T10:37:00Z";
  await f.service.tick();
  assert.equal(f.calls, 3);
  f.time = "2026-11-24T10:00:00Z";
  await f.service.tick();
  assert.equal(f.calls, 3);
  f.time = "2026-12-10T14:00:00Z";
  f.error = false;
  await f.service.tick();
  assert.equal(f.calls, 4);
  assert.equal(f.push, 1);
  f.restart();
  await f.service.tick();
  assert.equal(f.calls, 4);
});
test("QR PNG decodes to exact EPC fields, correct cents and local UTF-8", async () => {
  assert.ok(validIngIban(target));
  assert.ok(!validIngIban(target.slice(0, -1) + "9"));
  const payload = epcPayload({
    recipient: "Jörg Test",
    targetIban: target,
    amountCents: 85075,
    purpose: "Finanzflips Sparen 11/2026",
  });
  const png = PNG.sync.read(
    await QRCode.toBuffer(payload, {
      errorCorrectionLevel: "M",
      width: 600,
      margin: 4,
    }),
  );
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(result.data, payload);
  assert.deepEqual(payload.split("\n").slice(0, 8), [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    "Jörg Test",
    target,
    "EUR850.75",
  ]);
  assert.ok(
    QRCode.create(payload, { errorCorrectionLevel: "M" }).version <= 13,
  );
});
test("encrypted store detects modification; plaintext migration remains readable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ff-vault-"));
  try {
    const v = localVault(dir),
      file = path.join(dir, "data");
    v.write(file, "private-token");
    const raw = fs.readFileSync(file, "utf8");
    assert.ok(!raw.includes("private-token"));
    assert.equal(v.read(file), "private-token");
    assert.equal(v.open("legacy"), "legacy");
    const b = Buffer.from(raw.slice(9), "base64");
    b[15] ^= 1;
    assert.throws(() => v.open("FFVAULT1:" + b.toString("base64")));
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
test("HA ingress checks trusted peer and exact owner, rejects forged proxy and foreign origin", () => {
  const req = {
    socket: { remoteAddress: "172.30.32.2" },
    headers: {
      "x-remote-user-id": "owner",
      host: "ha.example",
      origin: "https://ha.example",
    },
  };
  assert.doesNotThrow(() => validateIngress(req, "owner"));
  assert.throws(() =>
    validateIngress(
      { ...req, socket: { remoteAddress: "127.0.0.1" } },
      "owner",
    ),
  );
  assert.throws(() => validateIngress(req, "other"));
  assert.throws(() =>
    validateIngress(
      { ...req, headers: { ...req.headers, origin: "https://evil.example" } },
      "owner",
    ),
  );
});
