import {
  allTransactions,
  detectRecurring,
  isTransfer,
  norm,
  sum,
  today,
  addMonths,
  advanceDate,
} from "./model.mjs";
const day = (d) => Number(d.slice(8, 10));
const median = (xs) => {
  const a = [...xs].sort((a, b) => a - b);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
};
const daysBetween = (a, b) =>
  Math.round(
    (Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000,
  );
const shiftDays = (d, n) =>
  new Date(Date.parse(d + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function nextTenth(asOf = today()) {
  return day(asOf) < 10 ? asOf.slice(0, 7) + "-10" : addMonths(asOf, 1, 10);
}
export function forecastAccount(state, items = detectRecurring(state)) {
  const explicit = state.settings?.forecastAccountId;
  if (explicit) return state.accounts.find((a) => a.id === explicit) || null;
  const named = state.accounts.filter((a) => norm(a.name) === "gehaltskonto");
  if (named.length === 1) return named[0];
  const salaries = items.filter(
    (r) => r.kind === "salary" && r.status === "active",
  );
  const ids = [...new Set(salaries.map((r) => r.accountId))];
  return ids.length === 1 ? state.accounts.find((a) => a.id === ids[0]) : null;
}
function salaryParts(item, txs, asOf) {
  if (!item.splitSalary || item.frequency !== "monthly") return null;
  const ids = new Set(item.evidenceIds || []);
  const rows = txs.filter(
    (t) =>
      ids.has(t.id) &&
      t.amount > 0 &&
      t.bookingDate.slice(0, 7) < asOf.slice(0, 7),
  );
  const months = [...new Set(rows.map((t) => t.bookingDate.slice(0, 7)))]
    .sort()
    .slice(-3);
  const recent = rows.filter((t) => months.includes(t.bookingDate.slice(0, 7)));
  const groups = [
    recent.filter((t) => day(t.bookingDate) <= 15),
    recent.filter((t) => day(t.bookingDate) > 15),
  ];
  if (
    months.length < 2 ||
    groups.some(
      (g) => new Set(g.map((t) => t.bookingDate.slice(0, 7))).size < 2,
    )
  )
    return null;
  const parts = groups.map((g) => ({
    dueDay: median(g.map((t) => day(t.bookingDate))),
    amount: median(
      months.map((m) =>
        sum(g.filter((t) => t.bookingDate.startsWith(m)).map((t) => t.amount)),
      ),
    ),
  }));
  const total = sum(parts.map((p) => p.amount));
  if (!total) return null;
  const first = Math.round((parts[0].amount / total) * item.amount * 100) / 100;
  return [
    { ...parts[0], amount: first },
    { ...parts[1], amount: sum([item.amount, -first]) },
  ];
}
function monthlyTransfers(txs, state, accountId, asOf) {
  const buckets = new Map();
  for (const t of txs.filter(
    (t) =>
      t.accountId === accountId &&
      !t.splitExcluded &&
      isTransfer(t, state) &&
      t.bookingDate <= asOf &&
      daysBetween(asOf, t.bookingDate) <= 120,
  )) {
    const key = [
      norm(t.merchant),
      t.counterpartyIban || "",
      Math.sign(t.amount),
    ].join("|");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  const out = [];
  for (const [key, rows] of buckets) {
    const months = [
      ...new Set(rows.map((t) => t.bookingDate.slice(0, 7))),
    ].sort();
    if (months.length < 2 || rows.length > months.length + 1) continue;
    const amounts = rows.map((t) => Math.abs(t.amount)),
      amount = median(amounts);
    if (amounts.some((v) => Math.abs(v - amount) > Math.max(1, amount * 0.08)))
      continue;
    const last = rows
      .map((t) => t.bookingDate)
      .sort()
      .at(-1);
    if (daysBetween(asOf, last) > 45) continue;
    out.push({
      id: "forecast-transfer-" + key,
      name: rows[0].merchant,
      accountId,
      amount,
      direction: rows[0].amount < 0 ? "expense" : "income",
      frequency: "monthly",
      dueDay: median(rows.map((t) => day(t.bookingDate))),
      nextDate: addMonths(last, 1, median(rows.map((t) => day(t.bookingDate)))),
      status: "active",
      evidenceIds: rows.map((t) => t.id),
      transfer: true,
      reviewed: false,
    });
  }
  return out;
}
export function accountForecast(
  state,
  { asOf = today(), items = detectRecurring(state, asOf) } = {},
) {
  const account = forecastAccount(state, items),
    target = nextTenth(asOf),
    warnings = [];
  const base = {
    accountId: account?.id || "",
    target,
    asOf,
    warnings,
    events: [],
    income: 0,
    expenses: 0,
    variable: 0,
    projected: null,
  };
  if (!account) {
    warnings.push("Bitte das Gehaltskonto für die Prognose auswählen.");
    return base;
  }
  const balanceDate =
    account.balanceObservedAt?.slice(0, 10) || account.balanceUpdatedAt;
  if (!balanceDate || !Number.isFinite(account.balance)) {
    warnings.push("Kontostand mit Datum abgleichen oder Bank abrufen.");
    return base;
  }
  if (daysBetween(asOf, balanceDate) > 2)
    warnings.push(
      "Der Kontostand ist älter als zwei Tage. Vor der Planung aktualisieren.",
    );
  const txs = allTransactions(state).filter((t) => !t.splitExcluded),
    relevant = items.filter(
      (r) => r.status === "active" && r.accountId === account.id,
    );
  const transfers = monthlyTransfers(txs, state, account.id, asOf).filter(
    (r) =>
      !relevant.some((x) =>
        (x.evidenceIds || []).some((id) => r.evidenceIds.includes(id)),
      ),
  );
  const events = [];
  for (const item of [...relevant, ...transfers]) {
    const parts = salaryParts(item, txs, asOf) || [
      {
        dueDay: item.dueDay || day(item.nextDate || asOf),
        amount: item.amount,
      },
    ];
    for (let pi = 0; pi < parts.length; pi++) {
      const part = parts[pi];
      let date = item.nextDate;
      if (parts.length > 1) date = addMonths(asOf, 0, part.dueDay);
      if (!date) {
        warnings.push("Bei mindestens einem Vertrag fehlt ein Zahlungstermin.");
        continue;
      }
      const advance = (d) => advanceDate(d, item.frequency, part.dueDay);
      let guard = 0;
      while (date <= target && guard++ < 100) {
        if (date < shiftDays(asOf, -7)) {
          date = advance(date);
          continue;
        }
        if (item.endDate && date > item.endDate) break;
        let amount = part.amount;
        if (
          parts.length === 1 &&
          date === item.nextDate &&
          item.nextAmount != null
        )
          amount = item.nextAmount;
        const ids = new Set(item.evidenceIds || []);
        const paid = txs.filter(
          (t) =>
            t.accountId === account.id &&
            ids.has(t.id) &&
            t.bookingDate <= asOf &&
            Math.sign(t.amount) === (item.direction === "income" ? 1 : -1) &&
            Math.abs(daysBetween(t.bookingDate, date)) <= 5,
        );
        // For the residual current-month salary nextAmount already excludes advances.
        if (
          !(
            parts.length === 1 &&
            item.splitSalary &&
            item.nextAmount !== item.amount
          )
        )
          amount = Math.max(
            0,
            sum([amount, -Math.abs(sum(paid.map((t) => t.amount)))]),
          );
        if (amount > 0 && date >= balanceDate) {
          events.push({
            id: item.id + "-" + date + "-" + pi,
            recurringId: item.id,
            name: item.name,
            date,
            amount: item.direction === "income" ? amount : -amount,
            kind: item.transfer ? "transfer" : item.kind || "contract",
            reviewed: !!item.reviewed,
            overdue: date < asOf,
          });
        }
        date = advance(date);
      }
    }
  }
  // This forecast intentionally contains no inferred discretionary spending.
  // Only the booked balance and dated recurring movements are allowed to
  // affect the value shown for the next 10th.
  const daily = 0,
    variable = 0;
  const income = sum(events.filter((x) => x.amount > 0).map((x) => x.amount)),
    expenses = Math.abs(
      sum(events.filter((x) => x.amount < 0).map((x) => x.amount)),
    );
  if (events.some((x) => !x.reviewed))
    warnings.push("Enthält automatisch geschätzte Termine und Beträge.");
  if (events.some((x) => x.overdue))
    warnings.push(
      "Überfällige, noch nicht zugeordnete Zahlungen sind berücksichtigt.",
    );
  warnings.push(
    "Unbekannte Einmalzahlungen, vorgemerkte Kartenumsätze und Terminverschiebungen können abweichen.",
  );
  return {
    ...base,
    balance: account.balance,
    balanceDate,
    events: events.sort((a, b) => a.date.localeCompare(b.date)),
    income,
    expenses,
    variable,
    daily,
    projected: sum([account.balance, income, -expenses, -variable]),
  };
}
