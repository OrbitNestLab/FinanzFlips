import test from "node:test";
import assert from "node:assert/strict";
import {
  isoDate,
  parseAmount,
  migrateState,
  detectRecurring,
  recurringSummary,
  cashflow,
  parseCSV,
  mergeTransactions,
  monthlyEquivalent,
  classifyCategory,
  addMonths,
  nextPayments,
} from "../model.mjs";
function fixture(rows) {
  return migrateState({
    accounts: [
      { name: "Giro", iban: "DE00001", balance: 100 },
      { name: "Karte", iban: "DE00002", balance: -10 },
    ],
    extraTransactions: rows,
    transactions: [],
    budgets: [],
    loans: [],
  });
}
const tx = (
  merchant,
  date,
  amount,
  category = "Sonstige Ausgaben",
  extra = {},
) => ({ merchant, date, amount, category, account: "Giro", ...extra });
test("calendar parsing rejects overflow dates and handles leap years", () => {
  assert.equal(isoDate("29.02.2024"), "2024-02-29");
  assert.equal(isoDate("31.02.2026"), "");
  assert.equal(isoDate("2026-10-21T11:00:00Z"), "2026-10-21");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
});
test("amount parsing distinguishes German and decimal CSV numbers", () => {
  assert.equal(parseAmount("1.234,56 €"), 1234.56);
  assert.equal(parseAmount("12.34"), 12.34);
  assert.equal(parseAmount(""), NaN);
});
test("hierarchy maps imported German ASCII categories correctly", () => {
  assert.deepEqual(classifyCategory("KFZ Steuer"), {
    group: "Auto",
    subcategory: "Kfz-Steuer",
  });
  assert.equal(classifyCategory("Hundesteuern").group, "Haustiere");
  assert.equal(
    classifyCategory("Tieraerztliche Behandlung").group,
    "Haustiere",
  );
  assert.equal(classifyCategory("Strom").group, "Wohnen");
});
test("split and fluctuating salary is monthly income, based on completed months", () => {
  const rows = [];
  for (const [m, a, b] of [
    [6, 1200, 1400],
    [7, 1300, 1400],
    [8, 1200, 1300],
    [9, 1200, 1450],
  ]) {
    rows.push(
      tx(
        "Arbeitgeber",
        `2026-${String(m).padStart(2, "0")}-15`,
        a,
        "Lohn / Gehalt",
      ),
      tx(
        "Arbeitgeber",
        `2026-${String(m).padStart(2, "0")}-28`,
        b,
        "Lohn / Gehalt",
      ),
    );
  }
  rows.push(tx("Arbeitgeber", "2026-10-15", 1200, "Lohn / Gehalt"));
  const [item] = detectRecurring(fixture(rows), "2026-10-21");
  assert.equal(item.kind, "salary");
  assert.equal(item.amount, 2650);
  assert.equal(item.splitSalary, true);
  assert.equal(item.lastMonthAmount, 1200);
  assert.equal(item.nextDate, "2026-10-28");
  assert.equal(item.nextAmount, 1450);
});
test("same provider electricity and gas remain separate and price rises survive", () => {
  const rows = [];
  for (let m = 4; m <= 10; m++) {
    const d = `2026-${String(m).padStart(2, "0")}-02`;
    rows.push(
      tx("Energie", d, m >= 9 ? -160 : -74, "Strom"),
      tx("Energie", d, m >= 9 ? -100 : -58, "Gas"),
    );
  }
  const items = detectRecurring(fixture(rows), "2026-10-21");
  assert.equal(items.length, 2);
  assert.equal(items.find((x) => x.subcategory === "Strom").amount, 160);
  assert.equal(items.find((x) => x.subcategory === "Gas").amount, 100);
  assert.equal(recurringSummary(items).expenses, 260);
  assert.equal(
    items.find((x) => x.subcategory === "Strom").change.difference,
    86,
  );
});
test("historic salaries stay out of active planned income", () => {
  const rows = [1, 2, 3].map((m) =>
    tx("Alter Arbeitgeber", `2026-0${m}-28`, 2000, "Lohn / Gehalt"),
  );
  const items = detectRecurring(fixture(rows), "2026-10-21");
  assert.equal(items[0].status, "inactive");
  assert.equal(recurringSummary(items).income, 0);
});
test("annual insurance is converted to monthly provision", () => {
  const rows = [2025, 2026].map((y) =>
    tx("Versicherung", `${y}-04-01`, -120, "Haftpflichtversicherung"),
  );
  const [item] = detectRecurring(fixture(rows), "2026-10-21");
  assert.equal(item.frequency, "annual");
  assert.equal(monthlyEquivalent(item), 10);
  assert.equal(item.status, "active");
});
test("ordinary supermarket purchases are not subscriptions", () => {
  const rows = [6, 7, 8, 9, 10].map((m) =>
    tx(
      "Supermarkt",
      `2026-${String(m).padStart(2, "0")}-05`,
      -100,
      "Lebensmittel",
    ),
  );
  assert.equal(detectRecurring(fixture(rows), "2026-10-21").length, 0);
});
test("manual recurring correction remains authoritative and rejected records stay rejected", () => {
  const s = fixture(
    [6, 7, 8, 9, 10].map((m) =>
      tx("Miete", `2026-${String(m).padStart(2, "0")}-01`, -600, "Miete"),
    ),
  );
  const [item] = detectRecurring(s, "2026-10-21");
  s.recurringOverrides[item.id] = {
    name: "Meine Miete",
    amount: 650,
    reviewed: true,
  };
  assert.equal(detectRecurring(s, "2026-10-21")[0].amount, 650);
  s.recurringOverrides[item.id].status = "rejected";
  assert.equal(detectRecurring(s, "2026-10-21").length, 0);
});
test("account assignment is stable by own IBAN and survives renaming", () => {
  const s = fixture([
    tx("Shop", "2026-10-01", -20, "Shopping", {
      account: "Alter Name",
      referenceIban: "DE00001",
    }),
  ]);
  assert.equal(s.extraTransactions[0].accountId, s.accounts[0].id);
  s.accounts[0].name = "Neu";
  const m = migrateState(s);
  assert.equal(m.extraTransactions[0].accountId, m.accounts[0].id);
  assert.equal(m.extraTransactions[0].id, s.extraTransactions[0].id);
});
test("own transfers excluded but manual include overrides detection", () => {
  const s = fixture([
    tx("Umbuchung", "2026-10-01", -100, "Umbuchung", {
      counterpartyIban: "DE00002",
    }),
    tx("Lohn", "2026-10-01", 500, "Lohn / Gehalt"),
    tx("Shop", "2026-10-01", -70),
  ]);
  assert.equal(cashflow(s, "2026-10").net, 430);
  s.extraTransactions[0].transferOverride = "include";
  assert.equal(cashflow(s, "2026-10").net, 330);
});
test("CSV handles multiline quoted fields, decimal amounts and invalid rows", () => {
  const r = parseCSV(
    'Datum;Empfänger;Betrag;Kategorie\n01.10.2026;"Shop; A\nFiliale";-12,34;Shopping\n32.10.2026;Fehler;2,00;Sonstiges',
  );
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].merchant, "Shop; A\nFiliale");
  assert.equal(r.transactions[0].amount, -12.34);
  assert.deepEqual(r.errors, [3]);
});
test("overlapping reimports preserve legitimate identical repeated transactions", () => {
  const a = tx("Shop", "2026-10-01", -10),
    existing = [{ ...a }, { ...a }];
  let r = mergeTransactions(existing, [{ ...a }, { ...a }]);
  assert.equal(r.added, 0);
  assert.equal(r.duplicates, 2);
  r = mergeTransactions(existing, [{ ...a }, { ...a }, { ...a }]);
  assert.equal(r.added, 1);
  assert.equal(r.transactions.length, 3);
});
test("kindergeld is income even though its category contains Kinder", () => {
  assert.deepEqual(classifyCategory("Kindergeld", "Familienkasse", 259), {
    group: "Einnahmen",
    subcategory: "Kindergeld",
  });
});
test("rent reversals are netted and do not double the monthly contract", () => {
  const rows = [];
  for (let m = 6; m <= 10; m++) {
    const date = `2026-${String(m).padStart(2, "0")}-01`;
    rows.push(tx("Vermieter", date, -650, "Miete"));
    if (m >= 9)
      rows.push(
        tx("Vermieter", date, 650, "Miete"),
        tx("Vermieter", date, -30, "Miete"),
        tx("Vermieter", `2026-${String(m).padStart(2, "0")}-15`, -678, "Miete"),
      );
  }
  const [item] = detectRecurring(fixture(rows), "2026-10-21");
  assert.equal(item.amount, 708);
  assert.equal(item.direction, "expense");
});
test("incidental fee does not turn annual tax into a half yearly contract", () => {
  const rows = [
    tx("Stadt", "2024-08-01", -27, "Hundesteuern"),
    tx("Stadt", "2024-11-01", -27, "Hundesteuern"),
    tx("Stadt", "2025-01-02", -108, "Hundesteuern"),
    tx("Stadt", "2026-01-02", -108, "Hundesteuern"),
    tx("Stadt", "2026-09-29", -9, "Hundesteuern"),
  ];
  const [item] = detectRecurring(fixture(rows), "2026-10-21");
  assert.equal(item.amount, 108);
  assert.equal(item.frequency, "annual");
  assert.equal(monthlyEquivalent(item), 9);
});
const { loanSchedule, requiredLoanPayment } = await import("../model.mjs");
test("zero interest loan has exact final instalment and date", () => {
  const r = loanSchedule(
    {
      balance: 1000,
      annualRate: 0,
      monthlyPayment: 300,
      balanceDate: "2026-10-01",
      nextDueDate: "2026-11-01",
    },
    "2026-12-02",
  );
  assert.equal(r.months, 4);
  assert.equal(r.endDate, "2027-02-01");
  assert.equal(r.rows.at(-1).payment, 100);
  assert.equal(r.interest, 0);
  assert.equal(r.currentBalance, 400);
});
test("loan negative amortization is reported instead of looping", () => {
  const r = loanSchedule({
    balance: 10000,
    annualRate: 12,
    monthlyPayment: 80,
    balanceDate: "2026-10-01",
    nextDueDate: "2026-11-01",
  });
  assert.equal(r.notAmortizing, true);
  assert.equal(r.endDate, null);
});
test("special repayment shortens schedule and preserves principal balance", () => {
  const base = {
      balance: 10000,
      annualRate: 6,
      monthlyPayment: 300,
      balanceDate: "2026-10-01",
      nextDueDate: "2026-11-01",
    },
    a = loanSchedule(base),
    b = loanSchedule({
      ...base,
      extraPayments: [{ date: "2026-12-01", amount: 2000 }],
    });
  assert.ok(b.months < a.months);
  assert.ok(b.interest < a.interest);
  assert.equal(b.rows.at(-1).balance, 0);
  assert.ok(Math.abs(b.total - b.interest - 10000) < 0.01);
});
test("target term derives sufficient rate with and without interest", () => {
  assert.equal(requiredLoanPayment(1200, 0, 12), 100);
  const rate = requiredLoanPayment(10000, 6, 36);
  const r = loanSchedule({
    balance: 10000,
    annualRate: 6,
    monthlyPayment: rate,
    balanceDate: "2026-10-01",
    nextDueDate: "2026-11-01",
  });
  assert.equal(r.months, 36);
});
test("manual recurring schedule follows observed payments without changing manual amount", () => {
  const s = fixture([tx("Vermieter", "2026-10-01", -600, "Miete")]);
  s.manualRecurring = [
    {
      id: "m",
      name: "Meine Miete",
      matchMerchant: "Vermieter",
      accountId: s.accounts[0].id,
      direction: "expense",
      group: "Wohnen",
      subcategory: "Miete",
      amount: 650,
      frequency: "monthly",
      dueDay: 1,
      nextDate: "2026-10-01",
      status: "active",
    },
  ];
  const [item] = detectRecurring(s, "2026-10-21");
  assert.equal(item.nextDate, "2026-11-01");
  assert.equal(item.amount, 650);
  assert.equal(item.evidenceIds.length, 1);
});
test("explicit ended contracts no longer contribute and final date caps payment calendar", () => {
  const s = fixture([]);
  s.manualRecurring = [
    {
      id: "m",
      name: "Vertrag",
      direction: "expense",
      amount: 12,
      frequency: "monthly",
      nextDate: "2026-11-01",
      status: "active",
      endDate: "2026-10-31",
    },
  ];
  const items = detectRecurring(s, "2026-11-02");
  assert.equal(items[0].status, "ended");
  assert.equal(recurringSummary(items).expenses, 0);
  assert.equal(
    nextPayments(detectRecurring(s, "2026-10-21"), "2026-10-21", 35).length,
    0,
  );
});

test("manual monthly salary correction keeps remaining instalment separate from full monthly plan", () => {
  const s = fixture([
    tx("Arbeitgeber", "2026-08-15", 1200, "Lohn / Gehalt"),
    tx("Arbeitgeber", "2026-08-30", 1300, "Lohn / Gehalt"),
    tx("Arbeitgeber", "2026-09-15", 1200, "Lohn / Gehalt"),
    tx("Arbeitgeber", "2026-09-30", 1300, "Lohn / Gehalt"),
    tx("Arbeitgeber", "2026-10-15", 1200, "Lohn / Gehalt"),
  ]);
  const original = detectRecurring(s, "2026-10-21")[0];
  s.recurringOverrides[original.id] = {
    amount: 2600,
    nextAmount: 2600,
    reviewed: true,
  };
  const updated = detectRecurring(s, "2026-10-21")[0];
  assert.equal(updated.amount, 2600);
  assert.equal(updated.nextAmount, 1400);
});
test("delayed quarterly contributions stay quarterly with corroborated export metadata", () => {
  const s = fixture(
    [
      "2025-02-03",
      "2025-04-01",
      "2025-07-01",
      "2025-10-01",
      "2026-02-02",
      "2026-04-01",
      "2026-07-01",
      "2026-10-01",
    ].map((date) =>
      tx("Verein", date, -19.5, "Mitgliedschaft", {
        sourceContract: true,
        contractFrequency: "vierteljaehrlich",
      }),
    ),
  );
  const item = detectRecurring(s, "2026-10-21")[0];
  assert.equal(item.frequency, "quarterly");
  assert.equal(monthlyEquivalent(item), 6.5);
});
test("variable purchases mislabeled as Prime and ordinary pet food do not become fixed contracts", () => {
  const s = fixture([
    tx("Amazon", "2026-08-19", -96.04, "Prime-Mitgliedschaft"),
    tx("Amazon", "2026-09-25", -19.97, "Prime-Mitgliedschaft"),
    tx("Amazon", "2026-10-02", -12.98, "Prime-Mitgliedschaft"),
    tx("Amazon", "2026-10-20", -19.99, "Prime-Mitgliedschaft"),
    ...["2026-01-12", "2026-04-12", "2026-07-12", "2026-10-12"].map((date) =>
      tx("Futterladen", date, -83.62, "Futter & Tierbedarf"),
    ),
  ]);
  assert.equal(detectRecurring(s, "2026-10-21").length, 0);
});
test("category changes to source bookings do not duplicate a manually confirmed contract", () => {
  const s = fixture(
    ["2026-08-01", "2026-09-01", "2026-10-01"].map((date) =>
      tx("Anbieter", date, -50, "Mobilfunk"),
    ),
  );
  const old = detectRecurring(s, "2026-10-21")[0];
  s.recurringOverrides[old.id] = {
    snapshot: structuredClone(old),
    amount: 55,
    reviewed: true,
  };
  for (const t of s.extraTransactions) {
    t.group = "Abos & Digitales";
    t.subcategory = "Internet & Telefon";
    t.category = "Internet & Telefon";
  }
  const result = detectRecurring(s, "2026-10-21");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, old.id);
  assert.equal(result[0].amount, 55);
});
test("rejected contract remains rejected after the same source bookings receive a different category", () => {
  const s = fixture(
    ["2026-08-01", "2026-09-01", "2026-10-01"].map((date) =>
      tx("Anbieter", date, -50, "Mobilfunk"),
    ),
  );
  const old = detectRecurring(s, "2026-10-21")[0];
  s.recurringOverrides[old.id] = {
    snapshot: structuredClone(old),
    status: "rejected",
  };
  for (const t of s.extraTransactions) {
    t.group = "Abos & Digitales";
    t.subcategory = "Cloud";
    t.category = "Cloud";
  }
  assert.equal(detectRecurring(s, "2026-10-21").length, 0);
});
