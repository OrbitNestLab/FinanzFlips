import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeBankTransaction,
  normalizeBankAccount,
  fetchTransactionPages,
} from "../banking.mjs";
const account = { uid: "konto-1", currency: "EUR" },
  raw = {
    status: "BOOK",
    transaction_amount: { amount: "12.34", currency: "EUR" },
    booking_date: "2026-10-20",
    credit_debit_indicator: "DBIT",
    creditor: { name: "Händler" },
    creditor_account: { iban: "DE123" },
    entry_reference: "123",
  };
test("debit and credit indicators determine sign and counterparty correctly", () => {
  const debit = normalizeBankTransaction(raw, account);
  assert.equal(debit.amount, -12.34);
  assert.equal(debit.merchant, "Händler");
  assert.equal(debit.syncId, "konto-1:123");
  const credit = normalizeBankTransaction(
    { ...raw, credit_debit_indicator: "CRDT", debtor: { name: "Arbeitgeber" } },
    account,
  );
  assert.equal(credit.amount, 12.34);
  assert.equal(credit.merchant, "Arbeitgeber");
});
test("pending, ambiguous and non-euro transactions are not misreported", () => {
  assert.equal(
    normalizeBankTransaction({ ...raw, status: "PDNG" }, account),
    null,
  );
  assert.equal(
    normalizeBankTransaction(
      { ...raw, credit_debit_indicator: undefined },
      account,
    ),
    null,
  );
  assert.equal(
    normalizeBankTransaction(
      { ...raw, transaction_amount: { amount: "12", currency: "USD" } },
      account,
    ),
    null,
  );
});
test("booked accounting balance is preferred to available credit line", () => {
  const result = normalizeBankAccount(
    { uid: "a", bank: "Bank", currency: "EUR", account_id: { iban: "DE123" } },
    {
      balances: [
        {
          balance_type: "CLAV",
          balance_amount: { amount: "1100", currency: "EUR" },
        },
        {
          balance_type: "CLBD",
          balance_amount: { amount: "100", currency: "EUR" },
        },
      ],
    },
    [raw],
  );
  assert.equal(result.balance, 100);
  assert.equal(result.transactions.length, 1);
});
test("pagination imports all pages and encodes opaque keys", async () => {
  const calls = [];
  const rows = await fetchTransactionPages(async (url) => {
    calls.push(url);
    return calls.length === 1
      ? { transactions: [1], continuation_key: "a/b +" }
      : { transactions: [2] };
  }, "konto");
  assert.deepEqual(rows, [1, 2]);
  assert.ok(calls[1].includes("continuation_key=a%2Fb+%2B"));
});
test("available credit alone is not treated as a booked balance", () => {
  const result = normalizeBankAccount(
    { uid: "a", currency: "EUR" },
    {
      balances: [
        {
          balance_type: "CLAV",
          balance_amount: { amount: "1000", currency: "EUR" },
        },
      ],
    },
    [],
  );
  assert.equal(result.balance, null);
});
test("repeated continuation key stops without silently truncating data", async () => {
  await assert.rejects(
    fetchTransactionPages(
      async () => ({ transactions: [1], continuation_key: "same" }),
      "konto",
    ),
    /wiederholten Seitenschlüssel/,
  );
});
