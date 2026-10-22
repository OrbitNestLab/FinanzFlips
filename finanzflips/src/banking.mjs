import { isoDate, ibanKey, hash, today } from "./model.mjs";
export function normalizeBankTransaction(raw, account) {
  if (raw.status && raw.status !== "BOOK") return null;
  const value = Number(
      raw.transaction_amount?.amount ?? raw.amount?.amount ?? raw.amount,
    ),
    currency =
      raw.transaction_amount?.currency ||
      raw.amount?.currency ||
      account.currency ||
      "EUR";
  const direction = raw.credit_debit_indicator;
  if (
    !Number.isFinite(value) ||
    !["CRDT", "DBIT"].includes(direction) ||
    currency !== "EUR"
  )
    return null;
  const amount = Math.abs(value) * (direction === "DBIT" ? -1 : 1),
    bookingDate = isoDate(
      raw.booking_date || raw.value_date || raw.transaction_date,
    );
  if (!bookingDate) return null;
  const party = direction === "CRDT" ? raw.debtor : raw.creditor,
    partyAccount =
      direction === "CRDT" ? raw.debtor_account : raw.creditor_account;
  const reference = Array.isArray(raw.remittance_information)
    ? raw.remittance_information.join(" ")
    : String(raw.remittance_information || raw.note || "");
  const merchant = String(
      party?.name ||
        reference ||
        raw.bank_transaction_code?.description ||
        "Bankbuchung",
    ).slice(0, 250),
    referenceId =
      raw.entry_reference || raw.transaction_id || raw.transactionId;
  return {
    merchant,
    bookingDate,
    date: bookingDate,
    amount,
    currency,
    description: reference.slice(0, 2000),
    category: raw.category || "Nicht zugeordnet",
    counterpartyIban: ibanKey(
      partyAccount?.iban || partyAccount?.identification || "",
    ),
    syncId: referenceId ? `${account.uid}:${referenceId}` : "",
    providerReference: referenceId || "",
    valueDate: isoDate(raw.value_date),
    source: "enable-banking",
  };
}
export function normalizeBankAccount(raw, balanceResult, transactions) {
  const balances = balanceResult.balances || [],
    chosen =
      balances.find((b) => b.balance_type === "CLBD") ||
      balances.find((b) => b.balance_type === "ITBD");
  const currency = raw.currency || chosen?.balance_amount?.currency || "EUR";
  if (currency !== "EUR")
    throw Error(
      "Fremdwährungskonto wird nicht automatisch in die EUR-Übersicht übernommen.",
    );
  const value = chosen ? Number(chosen.balance_amount?.amount) : NaN;
  const account = {
    uid: raw.uid || raw.account_id?.uid,
    iban: ibanKey(raw.account_id?.iban || raw.iban || ""),
    bank: raw.bank,
    country: raw.country,
    currency,
    balance: Number.isFinite(value) ? value : null,
    balanceDate:
      isoDate(
        chosen?.reference_date || chosen?.last_change_date_time?.slice(0, 10),
      ) || today(),
    balanceType: chosen?.balance_type || null,
    name: raw.product || raw.details || raw.bank || "Bankkonto",
    displayType: /card|kreditkarte/i.test(
      raw.product || raw.cash_account_type || "",
    )
      ? "Kreditkarte"
      : /sav|saving/i.test(raw.cash_account_type || "")
        ? "Sparkonto"
        : "Girokonto",
  };
  account.transactions = transactions
    .map((t) => normalizeBankTransaction(t, account))
    .filter(Boolean);
  account.skipped = transactions.length - account.transactions.length;
  return account;
}
export async function fetchTransactionPages(
  request,
  uid,
  { from, limit = 100 } = {},
) {
  const out = [],
    seen = new Set();
  let key;
  for (let page = 0; page < limit; page++) {
    const query = new URLSearchParams({ transaction_status: "BOOK" });
    if (from) query.set("date_from", from);
    if (key) query.set("continuation_key", key);
    const data = await request(
      `/accounts/${encodeURIComponent(uid)}/transactions?${query}`,
    );
    out.push(...(data.transactions || []));
    if (!data.continuation_key) return out;
    if (seen.has(data.continuation_key))
      throw Error(
        "Die Bank hat einen wiederholten Seitenschlüssel geliefert. Der Kontoabruf wurde abgebrochen.",
      );
    key = data.continuation_key;
    seen.add(key);
  }
  throw Error(
    "Zu viele Buchungsseiten. Bitte einen kürzeren Zeitraum abrufen.",
  );
}
