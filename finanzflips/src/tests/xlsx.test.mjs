import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { parseXLSX } from "../xlsx.mjs";
import {
  parseTabularRows,
  migrateState,
  cashflow,
  mergeTransactions,
} from "../model.mjs";
function zip(entries) {
  const locals = [],
    central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const n = Buffer.from(name),
      raw = Buffer.from(text),
      data = deflateRawSync(raw),
      head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(8, 8);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(n.length, 26);
    locals.push(head, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += head.length + n.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
test("XLSX uses shared strings, Excel date styles and numeric amounts", () => {
  const s = [
    "Buchungstag",
    "Name Referenzkonto",
    "Betrag",
    "Beguenstigter/Auftraggeber",
    "Analyse-Unterkategorie",
    "Giro",
    "Anbieter &amp; Partner",
    "Strom",
  ];
  const strings =
    "<sst>" + s.map((t) => "<si><t>" + t + "</t></si>").join("") + "</sst>";
  const cell = (r, v, attrs = "") => `<c r="${r}" ${attrs}><v>${v}</v></c>`;
  const xml =
    '<worksheet><sheetData><row r="1">' +
    ["A", "B", "C", "D", "E"]
      .map((col, i) => cell(col + "1", i, 't="s"'))
      .join("") +
    '</row><row r="2">' +
    cell("A2", 46315, 's="1"') +
    cell("B2", 5, 't="s"') +
    cell("C2", -12.34) +
    cell("D2", 6, 't="s"') +
    cell("E2", 7, 't="s"') +
    "</row></sheetData></worksheet>";
  const data = zip({
    "xl/sharedStrings.xml": strings,
    "xl/styles.xml":
      '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml": xml,
  });
  const result = parseXLSX(data);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.transactions[0].merchant, "Anbieter & Partner");
  assert.equal(result.transactions[0].amount, -12.34);
  assert.match(result.transactions[0].date, /^2026-/);
});
test("corrupt and encrypted input fails rather than importing fictitious values", () => {
  assert.throws(
    () => parseXLSX(Buffer.from("not a zip")),
    /kein unterstütztes/,
  );
  const data = zip({ "xl/worksheets/sheet1.xml": "<worksheet/>" });
  data.writeUInt16LE(
    1,
    data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 8,
  );
  assert.throws(() => parseXLSX(data), /Passwort/);
});
test("Finanzguru header mapping keeps source IDs, IBANs, transfers and split metadata", () => {
  const headers = [
    "Buchungstag",
    "Referenzkonto",
    "Name Referenzkonto",
    "Betrag",
    "Beguenstigter/Auftraggeber",
    "IBAN Beguenstigter/Auftraggeber",
    "Verwendungszweck",
    "Analyse-Unterkategorie",
    "Buchungs-ID",
    "Referenz-Original-ID",
    "Split-Typ",
    "Analyse-Umbuchung",
  ];
  const rows = [
    headers,
    [
      "01.10.2026",
      "DE111",
      "Giro",
      -20,
      "Shop",
      "DE222",
      "Notiz",
      "Shopping",
      "id1",
      "parent",
      "Teilbuchung",
      "ja",
    ],
  ];
  const r = parseTabularRows(rows).transactions[0];
  assert.equal(r.account, "Giro");
  assert.equal(r.referenceIban, "DE111");
  assert.equal(r.counterpartyIban, "DE222");
  assert.equal(r.sourceId, "id1");
  assert.equal(r.splitParentId, "parent");
  assert.equal(r.sourceTransfer, true);
});
function splitState(complete = true) {
  return migrateState({
    accounts: [{ name: "Giro", iban: "DE111", balance: 0 }],
    budgets: [],
    transactions: [],
    extraTransactions: [
      {
        merchant: "Shop",
        date: "2026-10-01",
        amount: -100,
        account: "Giro",
        category: "Shopping",
        sourceId: "parent",
        splitType: "Original",
      },
      {
        merchant: "Shop",
        date: "2026-10-01",
        amount: -30,
        account: "Giro",
        category: "Shopping",
        sourceId: "part1",
        splitParentId: "parent",
        splitType: "Teilbuchung",
      },
      ...(complete
        ? [
            {
              merchant: "Shop",
              date: "2026-10-01",
              amount: -70,
              account: "Giro",
              category: "Lebensmittel",
              sourceId: "part2",
              splitParentId: "parent",
              splitType: "Restbetrag",
            },
          ]
        : []),
    ],
  });
}
test("complete splits retain every record but original is not counted twice", () => {
  const s = splitState();
  assert.equal(s.extraTransactions.length, 3);
  assert.equal(s.extraTransactions.filter((x) => x.splitExcluded).length, 1);
  assert.equal(cashflow(s, "2026-10").expenses, 100);
  assert.equal(cashflow(s, "2026-10").groups["Freizeit & Lifestyle"], 30);
  assert.equal(cashflow(s, "2026-10").groups["Lebensmittel & Alltag"], 70);
});
test("incomplete splits count original once and suppress incomplete parts", () => {
  const s = splitState(false);
  assert.equal(cashflow(s, "2026-10").expenses, 100);
  assert.equal(s.extraTransactions[0].splitMismatch, true);
  assert.equal(s.extraTransactions[1].splitExclusionReason, "incomplete");
});
test("same external source ID is not duplicated after manual corrections", () => {
  const old = {
    accountId: "a",
    sourceId: "id1",
    merchant: "Korrigiert",
    date: "2026-10-01",
    amount: -20,
  };
  const next = { ...old, merchant: "Original", amount: -25 };
  assert.equal(mergeTransactions([old], [next]).added, 0);
});
