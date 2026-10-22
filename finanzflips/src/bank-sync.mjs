import {
  allTransactions,
  classifyCategory,
  ibanKey,
  norm,
  sum,
  today,
  loanSchedule,
} from "./model.mjs";
import { BANKS } from "./bank-catalog.mjs";

// Provider descriptions include transport field labels; Finanzguru retains the
// original remittance plus optional card-network references. Compare substantive
// text only, and always require the same account, booking day and signed cents.
export function remittanceKey(value) {
  return norm(
    String(value || "")
      .replace(/^.*?remittanceinformation:/i, "")
      .replace(/\bARN\d+.*/i, "")
      .replace(/Apple Pay/gi, ""),
  );
}
const rowKey = (t) =>
  [t.accountId, t.bookingDate, Math.round(t.amount * 100)].join("|");
export function sameBankBooking(a, b) {
  if (rowKey(a) !== rowKey(b)) return false;
  if (a.providerReference && a.providerReference === b.providerReference)
    return true;
  const x = remittanceKey(a.description),
    y = remittanceKey(b.description);
  if (
    x.length >= 8 &&
    x === y &&
    !["lastschrift", "uberweisung", "kartenzahlung", "gutschrift"].includes(x)
  )
    return true;
  if (x.length >= 24 && y.length >= 24 && (x.includes(y) || y.includes(x)))
    return true;
  const ai = ibanKey(a.counterpartyIban),
    bi = ibanKey(b.counterpartyIban);
  if (ai && bi && ai === bi) return true;
  return !!norm(a.merchant) && norm(a.merchant) === norm(b.merchant);
}

export function reconcileBankDuplicates(state) {
  const rows = [
    ...(state.extraTransactions || []),
    ...(state.transactions || []),
  ];
  const originals = rows.filter(
    (t) =>
      !["enable-banking", "fints"].includes(t.source) && !t.bankDuplicateOf,
  );
  const available = new Map();
  for (const t of originals) {
    const key = rowKey(t);
    if (!available.has(key)) available.set(key, []);
    available.get(key).push(t);
  }
  const used = new Set(
    rows.filter((t) => t.bankDuplicateOf).map((t) => t.bankDuplicateOf),
  );
  const links = [];
  for (const t of rows.filter(
    (t) =>
      ["enable-banking", "fints"].includes(t.source) &&
      !t.bankDuplicateOf &&
      !t.keepBankDuplicate &&
      !t.editedAt,
  )) {
    const matches = (available.get(rowKey(t)) || []).filter(
      (x) => !used.has(x.id) && sameBankBooking(t, x),
    );
    // Ambiguity is deliberately retained for manual review, never guessed away.
    if (matches.length !== 1) continue;
    const original = matches[0];
    t.bankDuplicateOf = original.id;
    t.bankDuplicateReason =
      "Konto, Buchungstag, Betrag und Zahlungsreferenz stimmen überein.";
    used.add(original.id);
    links.push({ id: t.id, originalId: original.id });
  }
  return links;
}

export function mergeBankResult(
  state,
  result,
  { id = () => crypto.randomUUID() } = {},
) {
  state.extraTransactions ||= [];
  state.transactions ||= [];
  state.accounts ||= [];
  let added = 0,
    duplicates = 0;
  const addedIds = [];
  const all = [...state.extraTransactions, ...state.transactions];
  const syncIds = new Set(
    all.flatMap((t) => [t.syncId, ...(t.bankSyncIds || [])]).filter(Boolean),
  );
  const references = new Map();
  for (const t of all)
    if (t.providerReference)
      references.set(t.accountId + "|" + t.providerReference, t);
  for (const source of result.accounts || []) {
    let account =
      state.accounts.find((a) => a.syncKey === source.uid) ||
      state.accounts.find(
        (a) => ibanKey(source.iban) && ibanKey(a.iban) === ibanKey(source.iban),
      );
    if (!account) {
      account = {
        id: "acct_" + id(),
        name: source.name || source.bank || "Bankkonto",
        type: "Bankverbindung",
        displayType: source.displayType || "Girokonto",
        balance: 0,
        iban: source.iban || "",
        includeInNetWorth: true,
        source: source.source || "enable-banking",
      };
      state.accounts.push(account);
    }
    if (Number.isFinite(source.balance)) {
      account.balance = source.balance;
      account.balanceUpdatedAt =
        source.balanceDate || result.syncedAt.slice(0, 10);
      account.balanceObservedAt = result.syncedAt;
      account.balanceType = source.balanceType;
    }
    Object.assign(account, {
      syncKey: source.uid,
      bankName: source.bank,
      iban: source.iban || account.iban,
      lastSyncAt: result.syncedAt,
      bankSyncError: source.errors?.join(" ") || null,
    });
    if (source.transactionsComplete !== false)
      account.lastTransactionSyncAt = result.syncedAt;
    const logo = BANKS.find((b) => norm(source.bank) === norm(b.name));
    if (logo) account.bankLogoId = logo.id;
    const buckets = new Map();
    for (const t of all.filter((x) => !x.bankDuplicateOf)) {
      const k = rowKey(t);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(t);
    }
    const used = new Set();
    for (const raw of source.transactions || []) {
      const t = {
        ...raw,
        accountId: account.id,
        referenceIban: account.iban,
        account: account.name,
      };
      const refKey = account.id + "|" + t.providerReference;
      if (
        (t.syncId && syncIds.has(t.syncId)) ||
        (t.providerReference && references.has(refKey))
      ) {
        duplicates++;
        continue;
      }
      const matches = (buckets.get(rowKey(t)) || []).filter(
        (x) => !used.has(x.id) && sameBankBooking(t, x),
      );
      if (matches.length === 1) {
        const match = matches[0];
        used.add(match.id);
        duplicates++;
        if (t.syncId) {
          match.bankSyncIds = [
            ...new Set([...(match.bankSyncIds || []), t.syncId]),
          ];
          syncIds.add(t.syncId);
        }
        if (t.providerReference) {
          match.providerReference ||= t.providerReference;
          references.set(refKey, match);
        }
        continue;
      }
      Object.assign(t, {
        id: "tx_" + id(),
        source: source.source || "enable-banking",
        date: t.bookingDate,
        ...classifyCategory(
          t.category || "Nicht zugeordnet",
          t.merchant,
          t.amount,
        ),
      });
      for (const rule of state.categoryRules || [])
        if (
          rule.accountId === t.accountId &&
          rule.merchant === norm(t.merchant) &&
          rule.direction === Math.sign(t.amount) &&
          (rule.fromCategory === t.category || t.group === "Sonstiges")
        )
          Object.assign(t, {
            group: rule.group,
            subcategory: rule.subcategory,
            category: rule.subcategory,
          });
      state.extraTransactions.push(t);
      all.push(t);
      addedIds.push(t.id);
      added++;
      if (t.syncId) syncIds.add(t.syncId);
      if (t.providerReference) references.set(refKey, t);
    }
  }
  const reconciled = reconcileBankDuplicates(state);
  if (result.accounts?.length) {
    state.lastBankSyncAt = result.syncedAt;
    const assets = sum(
      state.accounts.filter((a) => a.includeInNetWorth).map((a) => a.balance),
    );
    const debt = sum(
      (state.loans || []).map((l) => {
        try {
          return loanSchedule(l).currentBalance;
        } catch {
          return Number(l.balance) || 0;
        }
      }),
    );
    const snapshot = {
      date: today(),
      assets,
      debt,
      netWorth: sum([assets, -debt]),
      source: "bank",
    };
    state.balanceHistory ||= [];
    const i = state.balanceHistory.findIndex((s) => s.date === snapshot.date);
    if (i < 0) state.balanceHistory.push(snapshot);
    else state.balanceHistory[i] = snapshot;
  }
  state.auditLog ||= [];
  state.auditLog.push({
    id: id(),
    at: result.syncedAt,
    label: `Bankabruf: ${result.accounts?.length || 0} Konten · ${added} neue Buchungen${reconciled.length ? " · " + reconciled.length + " Dubletten zugeordnet" : ""}`,
    undo: reconciled.length
      ? { type: "bank-reconciliation", links: reconciled }
      : null,
  });
  state.auditLog = state.auditLog.slice(-80);
  return {
    added,
    duplicates,
    addedIds,
    reconciled: reconciled.length,
    accounts: result.accounts?.length || 0,
  };
}

export function bankSearch(banks, query = "") {
  const q = norm(query).trim();
  const tokens = q.split(" ").filter(Boolean);
  return banks
    .filter(
      (b) =>
        b.psu_types?.includes("personal") &&
        tokens.every((t) => norm(b.name + " " + b.country).includes(t)),
    )
    .sort((a, b) => {
      const score = (x) =>
        norm(x.name) === q ? 0 : norm(x.name).startsWith(q) ? 1 : 2;
      return score(a) - score(b) || a.name.localeCompare(b.name, "de");
    });
}
