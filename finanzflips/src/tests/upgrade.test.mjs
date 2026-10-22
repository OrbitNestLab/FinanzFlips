import test from "node:test";
import assert from "node:assert/strict";
import { dateLabel, shortDate } from "../ui.mjs";
import { accountForecast, nextTenth } from "../forecast.mjs";
import {
  bankSearch,
  reconcileBankDuplicates,
  mergeBankResult,
} from "../bank-sync.mjs";
import {
  scheduleSlot,
  scheduleDue,
  createSingleFlight,
} from "../bank-schedule.mjs";
import { allTransactions, emptyState } from "../model.mjs";
test("agent last-review timestamp and malformed dates never break rendering", () => {
  assert.equal(dateLabel("2026-10-21T08:23:25.561Z"), "21.10.2026");
  assert.equal(dateLabel("wrong"), "Noch offen");
  assert.equal(shortDate("2026-02-30"), "–");
});
test("exact ING ranks before substring Sparkassen matches; personal access only", () => {
  const list = [
    { name: "Sparkasse Solingen", psu_types: ["personal"] },
    { name: "ING", psu_types: ["personal"] },
    { name: "ING Wholesale", psu_types: ["business"] },
  ];
  assert.equal(bankSearch(list, "ING")[0].name, "ING");
  assert.equal(bankSearch(list, "ING").length, 2);
});
const tx = (id, extra = {}) => ({
  id,
  accountId: "a",
  bookingDate: "2026-10-20",
  amount: -12.34,
  merchant: "Lidl",
  description: "NR XXXX 1234 BERLIN KAUFUMSATZ 19.10 12.34 847239",
  ...extra,
});
test("bank reconciliation preserves raw rows and original edits while excluding only clear copies", () => {
  const state = emptyState();
  state.extraTransactions = [
    tx("old", { source: "Finanzguru", editedAt: "yes", group: "Wohnen" }),
    tx("new", {
      source: "enable-banking",
      merchant: "VISA LIDL SAGT DANKE",
      description:
        "mandatereference:,creditorid:,remittanceinformation:NR XXXX 1234 BERLIN KAUFUMSATZ 19.10 12.34 847239",
    }),
  ];
  assert.equal(reconcileBankDuplicates(state).length, 1);
  assert.equal(state.extraTransactions.length, 2);
  assert.equal(allTransactions(state).length, 1);
  assert.equal(state.extraTransactions[0].group, "Wohnen");
  assert.equal(reconcileBankDuplicates(state).length, 0);
});
test("equal amounts alone and ambiguous import pairs are not discarded", () => {
  const state = emptyState();
  state.extraTransactions = [
    tx("a1"),
    tx("a2"),
    tx("b", { source: "enable-banking" }),
  ];
  assert.equal(reconcileBankDuplicates(state).length, 0);
  state.extraTransactions = [
    tx("a1"),
    tx("b", {
      source: "enable-banking",
      merchant: "Someone else",
      description: "Unrelated",
    }),
  ];
  assert.equal(reconcileBankDuplicates(state).length, 0);
});
test("repeated sync and provider UID renewal preserve imported rows and user category", () => {
  const state = emptyState();
  state.accounts = [
    { id: "a", name: "Gehaltskonto", iban: "DE123", balance: 0 },
  ];
  state.extraTransactions = [tx("old", { group: "Auto", editedAt: "manual" })];
  const source = {
    uid: "u1",
    iban: "DE123",
    bank: "ING",
    balance: 200,
    balanceDate: "2026-10-21",
    transactions: [tx("", { syncId: "u1:r1", providerReference: "r1" })],
  };
  let report = mergeBankResult(state, {
    accounts: [source],
    syncedAt: "2026-10-21T12:00:00Z",
  });
  assert.equal(report.added, 0);
  assert.equal(state.accounts[0].balance, 200);
  assert.equal(state.extraTransactions[0].group, "Auto");
  source.uid = "u2";
  source.transactions[0].syncId = "u2:r1";
  report = mergeBankResult(state, {
    accounts: [source],
    syncedAt: "2026-10-21T13:00:00Z",
  });
  assert.equal(report.added, 0);
  assert.equal(state.accounts.length, 1);
});
test("scheduler honors Berlin summer/winter time, persists slots, no overnight backlog", () => {
  assert.equal(
    scheduleSlot(new Date("2026-10-21T06:01:00Z")),
    "2026-10-21T08:00",
  );
  assert.equal(
    scheduleSlot(new Date("2026-11-01T07:01:00Z")),
    "2026-11-01T08:00",
  );
  assert.equal(scheduleSlot(new Date("2026-10-21T04:00:00Z")), null);
  assert.equal(
    scheduleDue(
      { mode: "twice", lastSlot: "2026-10-21T18:00" },
      new Date("2026-10-21T20:00:00Z"),
    ),
    false,
  );
  assert.equal(scheduleDue({ mode: "off" }, new Date()), false);
});
test("manual and scheduled overlapping syncs share one network operation", async () => {
  let calls = 0,
    resolve;
  const run = createSingleFlight(async () => {
    calls++;
    await new Promise((r) => (resolve = r));
    return 42;
  });
  const a = run(),
    b = run();
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve();
  assert.deepEqual(await Promise.all([a, b]), [42, 42]);
  assert.equal(run.busy(), false);
});
const forecastState = () => ({
  ...emptyState(),
  accounts: [
    {
      id: "a",
      name: "Gehaltskonto",
      balance: 1000,
      balanceUpdatedAt: "2026-10-21",
    },
  ],
  settings: { forecastVariableDaily: 0 },
});
const rec = (id, extra = {}) => ({
  id,
  accountId: "a",
  name: id,
  status: "active",
  direction: "expense",
  amount: 100,
  frequency: "monthly",
  dueDay: 1,
  nextDate: "2026-11-01",
  reviewed: true,
  ...extra,
});
test("next 10 rolls across year and uses next month on the 10th itself", () => {
  assert.equal(nextTenth("2026-12-21"), "2027-01-10");
  assert.equal(nextTenth("2026-10-09"), "2026-10-10");
  assert.equal(nextTenth("2026-10-10"), "2026-11-10");
});
test("forecast uses only selected account, exact due dates, expenses and income", () => {
  const s = forecastState();
  s.settings.forecastVariableDaily = 10;
  const f = accountForecast(s, {
    asOf: "2026-10-21",
    items: [
      rec("rent", { amount: 500 }),
      rec("salary", {
        direction: "income",
        kind: "salary",
        amount: 2000,
        dueDay: 30,
        nextDate: "2026-10-30",
      }),
      rec("other", { accountId: "b", amount: 999 }),
      rec("annual", {
        frequency: "annual",
        nextDate: "2027-01-01",
        amount: 1000,
      }),
    ],
  });
  assert.equal(f.projected, 2500);
  assert.equal(f.target, "2026-11-10");
  assert.equal(f.events.length, 2);
});
test("forecast never subtracts inferred or configured variable spending", () => {
  const s = forecastState();
  s.settings.forecastVariableDaily = 999;
  s.extraTransactions = [
    tx("shopping", { bookingDate: "2026-10-20", amount: -900 }),
  ];
  const f = accountForecast(s, { asOf: "2026-10-21", items: [] });
  assert.equal(f.daily, 0);
  assert.equal(f.variable, 0);
  assert.equal(f.projected, 1000);
});
test("forecast recalculates immediately when a contract changes", () => {
  const s = forecastState();
  const first = accountForecast(s, {
    asOf: "2026-10-21",
    items: [rec("rent", { amount: 500 })],
  });
  const changed = accountForecast(s, {
    asOf: "2026-10-21",
    items: [rec("rent", { amount: 650 })],
  });
  assert.equal(first.projected, 500);
  assert.equal(changed.projected, 350);
});
test("forecast needs dated balance; paid dates and ended contracts do not get subtracted again", () => {
  const s = forecastState();
  delete s.accounts[0].balanceUpdatedAt;
  assert.equal(accountForecast(s, { items: [] }).projected, null);
  s.accounts[0].balanceUpdatedAt = "2026-10-21";
  s.extraTransactions = [
    tx("paid", { bookingDate: "2026-10-21", amount: -100 }),
  ];
  const f = accountForecast(s, {
    asOf: "2026-10-21",
    items: [
      rec("paid", {
        nextDate: "2026-10-21",
        dueDay: 21,
        evidenceIds: ["paid"],
      }),
      rec("ended", { endDate: "2026-10-25" }),
    ],
  });
  assert.equal(f.projected, 1000);
});
test("split salaries allocate historical advances and residuals without counting a full month twice", () => {
  const s = forecastState();
  s.extraTransactions = ["08", "09"].flatMap((m) => [
    tx(m + "a", { bookingDate: `2026-${m}-05`, amount: 800 }),
    tx(m + "b", { bookingDate: `2026-${m}-30`, amount: 1200 }),
  ]);
  const item = rec("salary", {
    kind: "salary",
    splitSalary: true,
    direction: "income",
    amount: 2000,
    nextDate: "2026-10-30",
    dueDay: 30,
    evidenceIds: s.extraTransactions.map((t) => t.id),
  });
  const f = accountForecast(s, { asOf: "2026-10-21", items: [item] });
  assert.equal(f.income, 2000);
  assert.deepEqual(
    f.events.map((x) => x.date),
    ["2026-10-30", "2026-11-05"],
  );
});
test("weekly forecast advances weeks rather than fractional months", () => {
  const f = accountForecast(forecastState(), {
    asOf: "2026-10-21",
    items: [
      rec("weekly", {
        frequency: "weekly",
        nextDate: "2026-10-23",
        amount: 10,
      }),
    ],
  });
  assert.equal(f.expenses, 30);
  assert.equal(f.events.length, 3);
});
test("a monthly debit booked early across the month boundary is already paid", () => {
  const s = forecastState();
  s.accounts[0].balanceUpdatedAt = "2026-10-31";
  s.extraTransactions = [
    tx("early", { bookingDate: "2026-10-30", amount: -100 }),
  ];
  const f = accountForecast(s, {
    asOf: "2026-10-31",
    items: [rec("rent", { evidenceIds: ["early"] })],
  });
  assert.equal(f.expenses, 0);
  assert.equal(f.projected, 1000);
});
