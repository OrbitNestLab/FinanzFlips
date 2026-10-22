import {
  allTransactions,
  detectRecurring,
  norm,
  sum,
  today,
  addMonths,
  advanceDate,
} from "./model.mjs";
const day = (d) => Number(d.slice(8, 10));
const daysBetween = (a, b) =>
  Math.round(
    (Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000,
  );
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
    accountItems = items.filter(
      (r) => r.status === "active" && r.accountId === account.id,
    ),
    relevant = accountItems.filter((r) => r.reviewed);
  const omitted = accountItems.length - relevant.length;
  if (omitted)
    warnings.push(
      `${omitted} unbestätigte ${omitted === 1 ? "Zahlung wird" : "Zahlungen werden"} nicht eingerechnet.`,
    );
  const events = [];
  for (const item of relevant) {
    let date = item.nextDate;
    if (!date) {
      warnings.push("Bei mindestens einem bestätigten Eintrag fehlt ein Zahlungstermin.");
      continue;
    }
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      warnings.push("Bei mindestens einem bestätigten Eintrag fehlt ein gültiger Betrag.");
      continue;
    }
    const advance = (d) => advanceDate(d, item.frequency, item.dueDay || day(d));
    let guard = 0;
    while (date <= target && guard++ < 100) {
      if (date < asOf) {
        date = advance(date);
        continue;
      }
      if (item.endDate && date > item.endDate) break;
      const evidence = new Set(item.evidenceIds || []),
        alreadyBooked = txs.some(
          (t) =>
            t.accountId === account.id &&
            evidence.has(t.id) &&
            t.bookingDate <= asOf &&
            Math.sign(t.amount) === (item.direction === "income" ? 1 : -1) &&
            Math.abs(daysBetween(t.bookingDate, date)) <= 5,
        );
      if (alreadyBooked) {
        date = advance(date);
        continue;
      }
      events.push({
        id: item.id + "-" + date,
        recurringId: item.id,
        name: item.name,
        date,
        amount: item.direction === "income" ? amount : -amount,
        kind: item.kind || "contract",
        reviewed: true,
        overdue: false,
      });
      date = advance(date);
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
  warnings.push("Es zählen nur bestätigte Einträge mit dem in Einnahmen oder Fixkosten gespeicherten Datum und Betrag.");
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
