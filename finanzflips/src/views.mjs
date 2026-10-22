import {
  GROUPS,
  FREQUENCIES,
  allTransactions,
  cashflow,
  datasetDate,
  detectRecurring,
  recurringSummary,
  monthlyEquivalent,
  nextPayments,
  shiftMonth,
  isTransfer,
  maskedIdentifier,
  today,
  sum,
  loanSchedule,
  monthIndex,
} from "./model.mjs";
import {
  escape as e,
  icon,
  money,
  badge,
  empty,
  option,
  dateLabel,
  shortDate,
  monthLabel,
  currency,
  sparkBars,
  categoryChart,
  lineChart,
} from "./ui.mjs";
import { BANKS } from "./bank-catalog.mjs";
import { forecastTile } from "./planning-ui.mjs";
import { bankPageView } from "./bank-ui.mjs";
import { fintsPage } from "./fints-ui.mjs";
export const pageNames = {
  savings: "Automatisches Sparen",
  dashboard: "Übersicht",
  transactions: "Buchungen",
  accounts: "Konten & Kredite",
  recurring: "Fixkosten & Verträge",
  income: "Einnahmen",
  analytics: "Auswertungen",
  budgets: "Budgets",
  agent: "Finanzagent",
  settings: "Einstellungen",
  bank: "Bankverbindung",
  fints: "ING Extra-Konten",
  loan: "Kredit im Detail",
};
const nav = [
  ["dashboard", "grid", "Übersicht"],
  ["transactions", "list", "Buchungen"],
  ["accounts", "wallet", "Konten & Kredite"],
  ["recurring", "contract", "Fixkosten & Verträge"],
  ["income", "income", "Einnahmen"],
  ["analytics", "chart", "Auswertungen"],
  ["budgets", "target", "Budgets"],
  ["savings", "target", "Automatisches Sparen"],
  ["agent", "spark", "Finanzagent"],
];
export function accountName(c, id) {
  const i = c.state.accounts.findIndex((a) => a.id === id);
  if (i < 0) return "Ohne Konto";
  return c.privacy
    ? "Konto " + String(i + 1).padStart(2, "0")
    : c.state.accounts[i]?.name || "Ohne Konto";
}
export const merchantName = (c, name) =>
  c.privacy ? "Zahlungspartner" : e(name);
export function bankIcon(entity, large = false) {
  const bank = BANKS.find((b) => b.id === entity.bankLogoId);
  const logo = bank?.logo || entity.bankLogo;
  const label = bank?.name || entity.bankName || entity.displayType || "Konto";
  return `<span class="bank-icon ${large ? "large" : ""}">${logo && /^\/assets\/banks\/[a-z0-9.-]+$/.test(logo) ? `<img src=".${e(logo)}" alt="${e(label)}" loading="lazy">` : icon(/kredit|loan/i.test(entity.displayType || "") ? "contract" : "wallet", large ? 25 : 19)}</span>`;
}
const categoryIcon = (group) =>
  `<span class="category-icon" style="--cat-color:${GROUPS[group]?.color || "#93a998"}">${icon(GROUPS[group]?.icon || "more", 17)}</span>`;
export const link = (href, text, cls = "link-button", ic = "arrow") =>
  `<a href="#/${href}" class="${cls}">${e(text)}${ic ? icon(ic, 15) : ""}</a>`;
export function monthPicker(c) {
  const months = new Set([
    today().slice(0, 7),
    c.month,
    ...c.txs.filter((t) => t.bookingDate).map((t) => t.bookingDate.slice(0, 7)),
  ]);
  return `<div class="month-picker"><button data-action="prev-month" aria-label="Vorheriger Monat">${icon("chevron", 16).replace("<svg ", '<svg style="transform:rotate(180deg)" ')}</button><label class="sr-only" for="global-month">Monat auswählen</label><select id="global-month" data-filter="global-month">${[
    ...months,
  ]
    .sort()
    .reverse()
    .map((m) => option(m, monthLabel(m), c.month))
    .join(
      "",
    )}</select><button data-action="next-month" aria-label="Nächster Monat">${icon("chevron", 16)}</button></div>`;
}
export function shell(c, content) {
  return `<aside class="sidebar ${c.menuOpen ? "open" : ""}" id="sidebar"><a class="brand" href="#/dashboard"><span class="brand-mark">F</span><span>FinanzFlips<small>Dein Finanzblick</small></span></a><div class="nav-label">DEINE FINANZEN</div><nav aria-label="Hauptnavigation">${nav.map(([id, ic, label]) => `<a class="nav-link ${c.route === id || (c.route === "loan" && id === "accounts") ? "active" : ""}" href="#/${id}" ${c.route === id ? 'aria-current="page"' : ""}>${icon(ic, 19)}<span>${label}</span></a>`).join("")}</nav><div class="sidebar-bottom"><a class="nav-link ${c.route === "bank" ? "active" : ""}" href="#/bank">${icon("bank", 19)}<span>Bankverbindung</span></a><a class="nav-link ${c.route === "settings" ? "active" : ""}" href="#/settings">${icon("settings", 19)}<span>Einstellungen</span></a><div class="local-card"><strong>${icon("lock", 13)} Privat gespeichert</strong><span class="status-dot ${c.syncStatus === "error" ? "warn" : ""}"></span>${c.syncStatus === "saving" ? "Änderungen werden gespeichert …" : c.syncStatus === "error" ? "Speicherung prüfen" : "Daten gespeichert"}</div><div class="sidebar-foot"><span>FinanzFlips 2.1</span><span>Persönlich</span></div></div></aside>${c.menuOpen ? '<button class="sidebar-overlay" data-action="close-menu" aria-label="Navigation schließen"></button>' : ""}<div class="app-main"><header class="topbar"><div class="row"><button class="icon-button mobile-menu" data-action="menu" aria-label="Navigation öffnen">${icon("menu")}</button><div class="breadcrumb"><span>Dein Finanzblick</span>${icon("chevron", 12)}<strong>${e(pageNames[c.route] || "Kontodetails")}</strong></div></div><div class="top-actions"><span class="sync-label muted text-small">${c.privacy ? '<span class="privacy-indicator">Privatmodus</span>' : `${icon("lock", 12)} Auf deinem eigenen Gerät`}</span><button class="icon-button" data-action="privacy" aria-label="${c.privacy ? "Beträge und Namen anzeigen" : "Beträge und Namen ausblenden"}" title="${c.privacy ? "Privatmodus ausschalten" : "Privatmodus einschalten"}">${icon(c.privacy ? "eyeoff" : "eye", 19)}</button><button class="icon-button" data-action="refresh" aria-label="Daten neu laden" title="Gespeicherte Daten aktualisieren">${icon("refresh", 18)}</button><a href="#/settings" class="avatar" aria-label="Einstellungen">M</a></div></header>${c.syncStatus === "error" ? `<div class="save-banner"><span>${e(c.syncError || "Änderungen konnten noch nicht gespeichert werden.")}</span><button class="button small" data-action="export-backup">Sicherung speichern</button><button class="button small" data-action="refresh">Neu laden</button></div>` : ""}<main class="content" id="main-content">${content}<footer class="footer-note"><span>${icon("lock", 10)} Privat gespeichert · FinanzFlips</span><span>Importstand ${dateLabel(datasetDate(c.state))}</span></footer></main></div><nav class="bottomnav" aria-label="Mobile Navigation">${[
    ["dashboard", "grid", "Übersicht"],
    ["transactions", "list", "Buchungen"],
    ["recurring", "contract", "Verträge"],
    ["accounts", "wallet", "Konten"],
    ["agent", "spark", "Agent"],
  ]
    .map(
      ([id, ic, label]) =>
        `<a href="#/${id}" class="${c.route === id ? "active" : ""}" ${c.route === id ? 'aria-current="page"' : ""}>${icon(ic)}<span>${label}</span></a>`,
    )
    .join("")}</nav>`;
}
function heading(c, title, subtitle, actions = "", showMonth = false) {
  return `<div class="page-heading"><div><div class="eyebrow">${c.route === "dashboard" ? "DEIN FINANZBLICK" : "FINANZFLIPS"}</div><h1>${e(title)}</h1><p>${e(subtitle)}</p></div><div class="heading-actions">${showMonth ? monthPicker(c) : ""}${actions}</div></div>`;
}
function kpi(c, label, value, note, ic = "wallet", featured = false, cls = "") {
  return `<div class="kpi ${featured ? "featured" : ""}"><div class="kpi-label">${e(label)}${icon(ic, 16)}</div><div class="kpi-value ${cls}">${money(value, c.privacy)}</div><div class="kpi-note">${e(note)}</div></div>`;
}
function accountMini(c, a) {
  return `<a class="account-mini" href="#/accounts/${a.id}">${bankIcon(a)}<div class="grow"><div class="account-title">${e(accountName(c, a.id))}</div><div class="account-caption">${e(a.displayType || "Konto")} · ${c.privacy ? "IBAN ausgeblendet" : e(maskedIdentifier(a.iban))}</div></div><div class="account-value">${money(a.balance, c.privacy, a.balance < 0 ? "negative" : "")}<div class="caption">${a.lastActivity ? shortDate(a.lastActivity.split(".").reverse().join("-")) : "Manuell"}</div></div>${icon("chevron", 13)}</a>`;
}
export function txTable(c, rows, { compact = false } = {}) {
  if (!rows.length)
    return empty(
      "Keine Buchungen gefunden.",
      "Passe die Filter an oder importiere weitere Buchungen.",
    );
  return `<div class="table-wrap"><table class="tx-table"><thead><tr><th>Zahlungspartner</th>${compact ? "" : "<th>Datum</th><th>Konto</th>"}<th>Kategorie</th><th>Betrag</th></tr></thead><tbody>${rows.map((t) => `<tr data-action="transaction-detail" data-id="${t.id}" tabindex="0" role="button" aria-label="Buchung ${c.privacy ? "öffnen" : e(t.merchant)} bearbeiten"><td><div class="transaction-name">${categoryIcon(t.group)}<div><div class="tx-title">${merchantName(c, t.merchant)}</div><div class="tx-caption">${compact ? shortDate(t.bookingDate) + " · " : ""}${t.splitExcluded ? (t.splitExclusionReason === "original" ? "Aufteilungs-Original · nicht doppelt gezählt" : "Teilbuchung · unvollständige Aufteilung") : isTransfer(t, c.state) ? "Umbuchung" : e(t.subcategory || t.category)}</div></div></div></td>${compact ? "" : `<td class="nowrap muted">${dateLabel(t.bookingDate)}</td><td class="muted nowrap">${e(accountName(c, t.accountId))}</td>`}<td><span class="tx-category">${e(t.group)}</span></td><td class="nowrap">${money(t.amount, c.privacy, isTransfer(t, c.state) ? "transfer-amount" : t.amount > 0 ? "positive" : "")}</td></tr>`).join("")}</tbody></table></div>`;
}
function upcoming(c, items) {
  const rows = nextPayments(items, today(), 35).slice(0, 7);
  return rows.length
    ? `<div class="upcoming-list">${rows.map((x) => `<button class="payment-row" style="border-left:0;border-right:0;border-top:0;background:none;width:100%;text-align:left" data-action="edit-recurring" data-id="${x.id}"><div class="date-tile">${Number(x.paymentDate.slice(8))}<small>${shortDate(x.paymentDate).split(" ").slice(1).join(" ")}</small></div><div class="grow"><div class="payment-name truncate">${merchantName(c, x.name)}</div><div class="payment-caption">${e(x.subcategory)} · ${e(accountName(c, x.accountId))}</div></div><div class="upcoming-amount ${x.direction === "income" ? "positive" : ""}">${money(x.direction === "expense" ? -x.amount : x.amount, c.privacy)}<small>${x.paymentDate < today() ? "Termin prüfen" : x.reviewed ? "Bestätigt" : "Voraussichtlich"}</small></div></button>`).join("")}</div>`
    : empty(
        "Noch keine Zahlungstermine.",
        "Lege einen Vertrag oder eine regelmäßige Einnahme an, um kommende Zahlungen zu planen.",
      );
}
export function dashboard(c) {
  const flow = cashflow(c.state, c.month, c.txs),
    previous = cashflow(c.state, shiftMonth(c.month, -1), c.txs),
    summary = recurringSummary(c.recurring),
    assets = sum(
      c.state.accounts.filter((a) => a.includeInNetWorth).map((a) => a.balance),
    ),
    debt = sum(c.state.loans.map((a) => loanBalance(a))),
    net = sum([assets, -debt]);
  const recent = c.txs
      .filter((t) => t.bookingDate.startsWith(c.month))
      .slice(0, 6),
    activeAccounts = c.state.accounts
      .filter((a) => a.includeInNetWorth)
      .slice(0, 5),
    series = Array.from({ length: 6 }, (_, i) => {
      const m = shiftMonth(c.month, i - 5);
      return { month: m, ...cashflow(c.state, m, c.txs) };
    }),
    changes = c.recurring.filter((x) => x.status === "active" && x.change),
    inactiveIncome = c.recurring.filter(
      (x) => x.direction === "income" && x.status === "inactive",
    ),
    unreviewed = c.recurring.filter(
      (x) => x.status === "active" && !x.reviewed,
    ).length;
  return (
    heading(
      c,
      "Alles im Blick.",
      "Deine Konten, laufenden Verträge und dein Spielraum an einem Ort.",
      `<a href="#/bank" class="button">${icon("bank", 15)} Bank verbinden</a>`,
      true,
    ) +
    `<div class="data-strip"><span>${icon("calendar", 13)} ${e(monthLabel(c.month))} · Buchungen bis ${dateLabel(datasetDate(c.state))}</span>${badge("Importierte Daten", "subtle")}</div><div class="kpi-grid dashboard-kpis">${kpi(c, "Nettovermögen", net, "Kontostände abzüglich erfasster Kredite", "wallet", true)}${kpi(c, "Einnahmen", flow.income, "Tatsächlich gebucht im ausgewählten Monat", "income")}${kpi(c, "Ausgaben", flow.expenses, "Ohne interne Umbuchungen", "contract")}${kpi(c, "Monatsbilanz", flow.net, flow.net >= 0 ? "Einnahmen minus Ausgaben" : "Ausgaben übersteigen die Einnahmen", "chart", false, flow.net < 0 ? "negative" : "positive")}${forecastTile(c)}</div><div class="grid-main"><section class="card hero-plan"><div><div class="row between"><div class="eyebrow" style="margin:0">DEIN MONATLICHER PLAN</div>${badge("Auf Monatsbasis", "mint")}</div><div class="plan-value">${money(summary.available, c.privacy)}</div><p class="plan-copy">Geplanter Spielraum nach laufenden Fixkosten, vor variablen Ausgaben und Sparzielen.</p></div><div><div class="plan-split"><div><div class="label">Regelmäßige Einnahmen</div>${money(summary.income, c.privacy)}</div><div class="divider"></div><div><div class="label">Fixkosten & Rücklagen</div>${money(summary.expenses, c.privacy)}</div></div><div class="plan-meter"><span style="width:${Math.min(100, summary.income ? (summary.expenses / summary.income) * 100 : 0)}%"></span></div><div class="row between mt-sm"><small class="muted">Jährliche und vierteljährliche Zahlungen anteilig enthalten.</small>${link("recurring", "Plan prüfen", "", "chevron")}</div></div></section><section class="card tip-card"><div class="card-header"><h2>${icon("spark", 19)} Dein Finanzradar</h2>${link("agent", "Zum Agenten")}</div><div class="insight-row"><span class="insight-icon">${icon("contract", 17)}</span><div><h3>${unreviewed ? unreviewed + " erkannte Verträge prüfen" : "Deine laufenden Zahlungen"}</h3><p>Erkannte Vorschläge fließen in den Plan ein. Du kannst jeden Betrag und jede Zuordnung ändern.</p></div></div>${changes.length ? `<div class="insight-row"><span class="insight-icon">${icon("trend", 17)}</span><div><h3>${changes.length} mögliche Preisänderungen</h3><p>Neuere Monatsbeträge weichen vom bisherigen Verlauf ab.</p>${link("recurring?changes=1", "Änderungen ansehen")}</div></div>` : `<div class="insight-row"><span class="insight-icon">${icon("check", 17)}</span><div><h3>Übersicht statt Zahlensalat</h3><p>Wohnen, Auto und Abos sind sauber getrennt. Öffne ein Konto für den vollständigen Verlauf.</p></div></div>`}<div class="insight-row"><span class="insight-icon">${icon("info", 17)}</span><div><h3>Importstände im Blick behalten</h3><p>Kontostände und Kreditrestschulden sind erst nach deinem Abgleich oder einem Bankabruf aktuell.</p></div></div></section><section class="card"><div class="card-header"><div><h2>Einnahmen & Ausgaben</h2><p>Sechs Monate im Vergleich · gebuchte Beträge</p></div>${link("analytics", "Auswerten")}</div>${sparkBars(series, c.privacy)}</section><section class="card"><div class="card-header"><div><h2>Wohin dein Geld fließt</h2><p>${e(monthLabel(c.month))} · ohne interne Umbuchungen</p></div>${link("analytics?chart=categories", "Details")}</div>${Object.keys(flow.groups).length ? categoryChart(flow.groups, c.privacy) : empty("Noch keine Ausgaben.", "Für diesen Monat liegen keine passenden Buchungen vor.")}</section><section class="card"><div class="card-header"><div><h2>Als Nächstes</h2><p>Fällige und kommende Zahlungen · 35 Tage</p></div>${icon("calendar", 18)}</div>${upcoming(c, c.recurring)}</section><section class="card"><div class="card-header"><div><h2>Deine Konten</h2><p>Ein Klick öffnet alle Buchungen des Kontos</p></div>${link("accounts", "Alle ansehen")}</div>${activeAccounts.length ? activeAccounts.map((a) => accountMini(c, a)).join("") : empty("Noch keine Konten.", "Lege ein Konto an oder verbinde deine Bank.", link("accounts", "Konto anlegen", "button"))}<div class="notice mt" style="margin-bottom:0">${icon("info", 16)}<p>${c.state.loans.length ? "Kreditrestschulden werden getrennt als Verbindlichkeiten abgezogen." : "Kreditrestschulden sind noch nicht erfasst. Lege ING, DSL oder andere Kredite unter Konten & Kredite an."}</p></div></section><section class="card" style="grid-column:1/-1"><div class="card-header"><div><h2>Letzte Buchungen</h2><p>${e(monthLabel(c.month))} · einschließlich Umbuchungen</p></div>${link("transactions?month=" + c.month, "Alle Buchungen")}</div>${txTable(c, recent)}</section></div>`
  );
}
function monthOptions(c, selected, all = true) {
  const months = [
    ...new Set(c.txs.map((t) => t.bookingDate.slice(0, 7)).filter(Boolean)),
  ]
    .sort()
    .reverse();
  if (!months.includes(c.month)) months.unshift(c.month);
  return (
    (all ? option("all", "Gesamter Zeitraum", selected) : "") +
    months.map((m) => option(m, monthLabel(m), selected)).join("")
  );
}
export function filteredTransactions(c) {
  const f = c.filters;
  let rows = c.txs;
  if (c.route === "accounts" && c.accountId)
    rows = rows.filter((t) => t.accountId === c.accountId);
  else if (f.account) rows = rows.filter((t) => t.accountId === f.account);
  if (f.month && f.month !== "all")
    rows = rows.filter((t) => t.bookingDate.startsWith(f.month));
  if (f.rangeFrom)
    rows = rows.filter((t) => t.bookingDate.slice(0, 7) >= f.rangeFrom);
  if (f.rangeTo)
    rows = rows.filter((t) => t.bookingDate.slice(0, 7) <= f.rangeTo);
  if (f.group) rows = rows.filter((t) => t.group === f.group);
  if (f.direction === "income")
    rows = rows.filter((t) => t.amount > 0 && !isTransfer(t, c.state));
  else if (f.direction === "expense")
    rows = rows.filter((t) => t.amount < 0 && !isTransfer(t, c.state));
  else if (f.direction === "transfer")
    rows = rows.filter((t) => isTransfer(t, c.state));
  if (f.recurring) {
    const item = c.recurring.find((x) => x.id === f.recurring),
      ids = new Set(item?.evidenceIds || []);
    rows = rows.filter(
      (t) =>
        ids.has(t.id) ||
        (item?.source === "manual" &&
          (!item.accountId || t.accountId === item.accountId) &&
          t.merchant
            .toLocaleLowerCase("de-DE")
            .includes(
              (item.matchMerchant || item.name || "").toLocaleLowerCase(
                "de-DE",
              ),
            )),
    );
  }
  if (f.q) {
    const query = f.q.toLocaleLowerCase("de-DE");
    rows = rows.filter((t) =>
      [
        t.merchant,
        t.description,
        t.category,
        t.subcategory,
        t.amount,
        t.date,
        t.bookingDate,
      ].some((v) =>
        String(v || "")
          .toLocaleLowerCase("de-DE")
          .includes(query),
      ),
    );
  }
  if (f.sort === "oldest") rows = rows.toReversed();
  if (f.sort === "amount")
    rows = rows.toSorted((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  return rows;
}
export function transactionSection(c, { account = false } = {}) {
  const rows = filteredTransactions(c),
    f = c.filters,
    count = rows.length,
    limit = 50,
    maxPage = Math.max(1, Math.ceil(count / limit)),
    page = Math.min(c.page, maxPage),
    shown = rows.slice((page - 1) * limit, page * limit),
    flow = cashflow(c.state, null, rows);
  return `<section class="card"><div class="card-header"><div><h2>${account ? "Buchungen dieses Kontos" : "Buchungsverlauf"}</h2><p>${count.toLocaleString("de-DE")} Buchungen · ${f.rangeFrom ? monthLabel(f.rangeFrom) + " bis " + monthLabel(f.rangeTo) : "Filter wirken auf die gesamte Historie"}</p></div><button class="button small" data-action="export-csv">${icon("download", 14)} CSV</button></div><div class="filter-bar"><label class="search"><span class="sr-only">Buchungen durchsuchen</span>${icon("search", 17)}<input class="input" data-filter="q" id="transaction-search" placeholder="Zahlungspartner, Kategorie oder Betrag suchen …" value="${e(f.q)}" autocomplete="off"></label><label><span class="sr-only">Zeitraum</span><select class="input filter-select" data-filter="tx-month">${monthOptions(c, f.month)}</select></label>${account ? "" : `<label><span class="sr-only">Konto filtern</span><select class="input filter-select" data-filter="account">${option("", "Alle Konten", f.account)}${c.state.accounts.map((a) => option(a.id, accountName(c, a.id), f.account)).join("")}</select></label>`}<label><span class="sr-only">Kategorie filtern</span><select class="input filter-select" data-filter="group">${option("", "Alle Kategorien", f.group)}${Object.keys(
    GROUPS,
  )
    .map((g) => option(g, g, f.group))
    .join(
      "",
    )}</select></label><label><span class="sr-only">Richtung filtern</span><select class="input filter-select" data-filter="direction">${[
    ["", "Alle Zahlungen"],
    ["expense", "Ausgaben"],
    ["income", "Einnahmen"],
    ["transfer", "Umbuchungen"],
  ]
    .map(([v, l]) => option(v, l, f.direction))
    .join(
      "",
    )}</select></label><label><span class="sr-only">Sortierung</span><select class="input filter-select" data-filter="sort">${[
    ["newest", "Neueste zuerst"],
    ["oldest", "Älteste zuerst"],
    ["amount", "Größter Betrag"],
  ]
    .map(([v, l]) => option(v, l, f.sort))
    .join(
      "",
    )}</select></label>${f.recurring || f.q || f.group || f.direction || f.account || f.rangeFrom ? `<button class="link-button" data-action="reset-filters">Filter zurücksetzen</button>` : ""}</div><div class="row between wrap" style="margin:0 0 19px;padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)"><span class="text-small muted">Im gefilterten Zeitraum <span class="subtle">· ohne Umbuchungen und doppelte Aufteilungs-Originale</span></span><div class="row wrap text-small"><span class="positive">${money(flow.income, c.privacy)}</span><span class="muted">Eingänge</span><span>${money(-flow.expenses, c.privacy)}</span><span class="muted">Ausgänge</span></div></div>${txTable(c, shown)}<div class="pagination"><span>${count ? (page - 1) * limit + 1 + "–" + Math.min(page * limit, count) : "0"} von ${count.toLocaleString("de-DE")}</span><div class="row gap-sm"><button class="button small" data-action="tx-prev" ${page <= 1 ? "disabled" : ""}>Zurück</button><span>${page} / ${maxPage}</span><button class="button small" data-action="tx-next" ${page >= maxPage ? "disabled" : ""}>Weiter</button></div></div></section>`;
}
export function transactionsPage(c) {
  return (
    heading(
      c,
      "Jede Buchung. Klar zugeordnet.",
      "Durchsuche deinen gesamten Verlauf und korrigiere Kategorien mit einem Klick.",
      `<button class="button" data-action="import">${icon("upload", 15)} Importieren</button><button class="button primary" data-action="new-transaction">${icon("plus", 15)} Buchung</button>`,
    ) + transactionSection(c)
  );
}
export function loanBalance(loan) {
  if (loan.archived) return 0;
  try {
    return loan.monthlyPayment
      ? loanSchedule(loan).currentBalance
      : loan.balance;
  } catch {
    return loan.balance;
  }
}
export function accountsPage(c) {
  if (c.accountId) return accountPage(c);
  const accounts = c.state.accounts.filter((a) =>
    c.accountView === "all" || c.accountView === "archived"
      ? c.accountView === "all" || !a.includeInNetWorth
      : a.includeInNetWorth,
  );
  const assets = sum(
      c.state.accounts.filter((a) => a.includeInNetWorth).map((a) => a.balance),
    ),
    debt = sum(c.state.loans.map(loanBalance));
  return (
    heading(
      c,
      "Konten & Kredite",
      "Alle Vermögenswerte und Verbindlichkeiten. Mit vollständigem Buchungsverlauf.",
      `<button class="button" data-action="new-account">${icon("plus", 15)} Konto</button><button class="button primary" data-action="new-loan">${icon("plus", 15)} Kredit hinzufügen</button>`,
    ) +
    `<div class="kpi-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${kpi(c, "Kontostände", assets, "Einbezogene Konten · letzter bekannter Stand", "wallet")}${kpi(c, "Kreditrestschulden", debt, "Manuell oder als Modellrechnung erfasst", "contract")}${kpi(c, "Nettovermögen", sum([assets, -debt]), "Kontostände minus Kreditrestschulden", "trend", true)}</div><div class="row between wrap mt" style="margin-bottom:18px"><h2>Deine Konten</h2><div class="segmented">${[
      ["active", "Im Vermögen"],
      ["all", "Alle Konten"],
      ["archived", "Ausgeblendet"],
    ]
      .map(
        ([v, l]) =>
          `<button class="segment ${c.accountView === v ? "active" : ""}" data-action="account-view" data-value="${v}">${l}</button>`,
      )
      .join(
        "",
      )}</div></div><div class="account-grid">${accounts.map((a) => `<a href="#/accounts/${a.id}" class="account-card ${a.includeInNetWorth ? "" : "archived"}"><div class="row between">${bankIcon(a)}${badge(a.syncKey ? "Bankverbindung" : a.includeInNetWorth ? "Import / manuell" : "Ausgeblendet", a.syncKey ? "mint" : "subtle")}</div><div class="account-title">${e(accountName(c, a.id))}</div><div class="account-caption">${e(a.displayType)} · ${c.privacy ? "IBAN ausgeblendet" : e(maskedIdentifier(a.iban))}</div><div class="account-amount">${money(a.balance, c.privacy, a.balance < 0 ? "negative" : "")}</div><div class="account-bottom"><span>${c.txs.filter((t) => t.accountId === a.id).length.toLocaleString("de-DE")} Buchungen</span><span>Buchungen öffnen ${icon("chevron", 11)}</span></div></a>`).join("") || empty("Noch keine Konten.", "Importiere Daten oder lege dein erstes Konto an.")}</div><div class="row between mt" style="margin-bottom:17px"><div><h2>Deine Kredite</h2><p class="muted text-small mt-sm">Auch für Banken ohne automatische Anbindung.</p></div><button class="link-button" data-action="new-loan">Kredit anlegen ${icon("plus", 15)}</button></div><div class="grid-2">${c.state.loans.map((l) => loanCard(c, l)).join("") || `<section class="card" style="grid-column:1/-1">${empty("Kredite vollständig im Blick.", "Erfasse Restschuld, Sollzins und Rate. FinanzFlips berechnet Laufzeit, Zinsen und den Tilgungsplan.", `<button class="button primary" data-action="new-loan">${icon("plus", 15)} Ersten Kredit anlegen</button>`)}</section>`}</div><div class="notice mt">${icon("info", 16)}<p>Exportstände können unterschiedlich alt sein. Ausgeblendete Konten bleiben vollständig erhalten, zählen aber nicht zum Nettovermögen. Klick auf ein Konto, um Kontostand, Namen oder Einbeziehung anzupassen.</p></div>`
  );
}
function loanCard(c, l) {
  let plan;
  try {
    plan = loanSchedule(l);
  } catch {}
  return `<a href="#/loan/${l.id}" class="card loan-card"><div class="row">${bankIcon({ ...l, displayType: "Kredit" }, true)}<div class="grow"><h2>${c.privacy ? "Kreditkonto" : e(l.name)}</h2><p class="muted text-small mt-sm">${e(BANKS.find((b) => b.id === l.bankLogoId)?.name || l.bankName || "Manueller Kredit")} ${l.archived ? badge("Archiviert", "subtle") : ""}</p></div>${icon("chevron", 16)}</div><div><div class="text-small muted">Restschuld · ${l.monthlyPayment ? "Modellrechnung" : "manueller Stand"}</div><div class="amount mt-sm">${money(loanBalance(l), c.privacy)}</div></div><div class="loan-metrics"><div><small>Monatliche Rate</small><strong>${money(l.monthlyPayment || 0, c.privacy)}</strong></div><div><small>Sollzins p. a.</small><strong>${c.privacy ? "•••" : Number(l.annualRate || 0).toLocaleString("de-DE") + " %"}</strong></div><div><small>Voraussichtliches Ende</small><strong>${plan?.endDate ? dateLabel(plan.endDate) : "Noch offen"}</strong></div></div></a>`;
}
function accountPage(c) {
  const a = c.state.accounts.find((a) => a.id === c.accountId);
  if (!a)
    return empty(
      "Konto nicht gefunden.",
      "Dieses Konto ist nicht mehr vorhanden.",
      link("accounts", "Zur Kontenübersicht", "button"),
    );
  const rows = c.txs.filter((t) => t.accountId === a.id),
    flow = cashflow(c.state, c.month, rows);
  return `<a href="#/accounts" class="back-link">${icon("arrow", 14)} Alle Konten</a><div class="account-head">${bankIcon(a, true)}<div class="grow"><div class="eyebrow">${e(a.displayType)}</div><h1>${e(accountName(c, a.id))}</h1><div class="account-meta"><span>${c.privacy ? "IBAN ausgeblendet" : e(maskedIdentifier(a.iban))}</span><span>${rows.length.toLocaleString("de-DE")} Buchungen</span><span>${a.includeInNetWorth ? "Im Nettovermögen enthalten" : "Aus dem Nettovermögen ausgeblendet"}</span></div></div><button class="button" data-action="edit-account" data-id="${a.id}">${icon("edit", 15)} Konto bearbeiten</button></div><section class="card account-hero"><div><span class="text-small muted">Letzter bekannter Kontostand</span><div class="amount">${money(a.balance, c.privacy)}</div><span class="text-small subtle">${a.balanceUpdatedAt ? "Abgeglichen " + dateLabel(a.balanceUpdatedAt) : a.lastActivity ? "Exportstand " + e(a.lastActivity) : "Manuell erfasst"}</span></div><div class="small-stats"><div><div class="stat-label">Einnahmen · ${e(monthLabel(c.month))}</div><div class="stat-value positive">${money(flow.income, c.privacy)}</div></div><div><div class="stat-label">Ausgaben · ${e(monthLabel(c.month))}</div><div class="stat-value">${money(flow.expenses, c.privacy)}</div></div></div></section>${transactionSection(c, { account: true })}`;
}
export function recurringPage(c, direction = "expense") {
  const f = c.recurringFilter,
    items = c.recurring.filter((x) => x.direction === direction),
    active = items.filter((x) => x.status === "active"),
    total = sum(active.map(monthlyEquivalent));
  let shown = items.filter((x) =>
    f === "all" || f === "changes"
      ? f !== "changes" || x.change
      : f === "review"
        ? x.status === "active" && !x.reviewed
        : x.status === f,
  );
  if (c.recurringGroup)
    shown = shown.filter((x) => x.group === c.recurringGroup);
  if (c.recurringQuery)
    shown = shown.filter((x) =>
      (x.name + " " + x.group + " " + x.subcategory)
        .toLocaleLowerCase("de-DE")
        .includes(c.recurringQuery.toLocaleLowerCase("de-DE")),
    );
  const groups = new Map();
  for (const item of shown) {
    const key = direction === "income" ? item.subcategory : item.group;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const income = direction === "income";
  return (
    heading(
      c,
      income
        ? "Einnahmen, auf die du planst."
        : "Deine laufenden Verpflichtungen.",
      income
        ? "Gehalt, Leistungen und weitere regelmäßige Eingänge – jederzeit anpassbar."
        : "Fixkosten und Abos nach Lebensbereichen. Du behältst die Kontrolle.",
      `<button class="button" data-action="recheck">${icon("refresh", 15)} Neu prüfen</button><button class="button primary" data-action="new-recurring" data-direction="${direction}">${icon("plus", 15)} ${income ? "Einnahme" : "Vertrag"} anlegen</button>`,
    ) +
    `<div class="kpi-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${kpi(c, income ? "Regelmäßige Einnahmen" : "Fixkosten pro Monat", total, income ? "Geplante Beträge · vollständige Monate als Basis" : "Jährliche Zahlungen anteilig als Rücklage", income ? "income" : "contract", true)}<div class="kpi"><div class="kpi-label">${income ? "Aktive Einnahmequellen" : "Aktive Verträge & Abos"}${icon("layers", 16)}</div><div class="kpi-value">${active.length}</div><div class="kpi-note">Automatisch erkannt oder von dir angelegt</div></div><div class="kpi"><div class="kpi-label">Noch nicht bestätigt${icon("info", 16)}</div><div class="kpi-value">${active.filter((x) => !x.reviewed).length}</div><div class="kpi-note">Vorschläge prüfen und bei Bedarf korrigieren</div></div></div><div class="notice">${icon("spark", 16)}<p>${income ? "Teilzahlungen eines Arbeitgebers werden je Konto und Monat zusammengeführt. Schwankendes Gehalt wird aus vollständigen Monaten geschätzt. Seit Längerem fehlende Eingänge werden als inaktiv gekennzeichnet." : "Automatisch erkannte Beträge sind Planungswerte. Deine manuellen Änderungen haben immer Vorrang. Änderungen, Pausen und verworfene Vorschläge bleiben nachvollziehbar."}</p></div><section class="card"><div class="filter-bar"><label class="search">${icon("search", 17)}<span class="sr-only">Verträge durchsuchen</span><input class="input" id="recurring-search" data-filter="recurring-q" placeholder="${income ? "Einnahmen" : "Verträge, Anbieter oder Kategorien"} suchen …" value="${e(c.recurringQuery)}"></label><select class="input filter-select" data-filter="recurring-status" aria-label="Vertragsstatus">${[
      ["active", "Aktiv"],
      ["review", "Noch zu prüfen"],
      ["changes", "Preisänderungen"],
      ["paused", "Pausiert"],
      ["inactive", "Nicht mehr erkannt"],
      ["ended", "Beendet"],
      ["all", "Alle Einträge"],
    ]
      .map(([v, l]) => option(v, l, f))
      .join(
        "",
      )}</select>${income ? "" : `<select class="input filter-select" data-filter="recurring-group" aria-label="Lebensbereich">${option("", "Alle Bereiche", c.recurringGroup)}${[...new Set(items.map((x) => x.group))].map((g) => option(g, g, c.recurringGroup)).join("")}</select>`}</div>${
      [...groups]
        .sort(([ga, a], [gb, b]) =>
          income
            ? sum(b.map(monthlyEquivalent)) - sum(a.map(monthlyEquivalent))
            : Object.keys(GROUPS).indexOf(ga) - Object.keys(GROUPS).indexOf(gb),
        )
        .map(
          ([group, rows]) =>
            `<div class="contract-group"><div class="group-head">${categoryIcon(income ? "Einnahmen" : group)}<h3>${e(group)}</h3><span class="muted text-small">${rows.length}</span><div class="group-sum">${money(sum(rows.map(monthlyEquivalent)), c.privacy)}<small>pro Monat</small></div></div>${rows.map((item) => contractRow(c, item)).join("")}</div>`,
        )
        .join("") ||
      empty(
        "Hier ist noch alles frei.",
        f === "active"
          ? "Lege deinen ersten Eintrag an oder sieh dir die automatisch erkannten inaktiven Zahlungen an."
          : "Für diese Auswahl wurden keine Einträge gefunden.",
      )
    }<div class="notice mt" style="margin-bottom:0">${icon("info", 15)}<p>Die Liste ist eine Planung. Tatsächlich gebuchte Beträge findest du unter Buchungen. ${income ? "Gehälter können sich durch Zuschläge, Teilzahlungen oder Einmalzahlungen unterscheiden." : "Ein Händlername allein beweist keinen Vertrag. Korrigiere oder verwerfe unpassende Vorschläge."}</p></div></section>` +
    recurringBalance(c)
  );
}
function recurringBalance(c) {
  const plan = recurringSummary(c.recurring),
    flow = cashflow(c.state, c.month, c.txs);
  return `<section class="card mt"><div class="card-header"><div><h2>Deine Monatsrechnung</h2><p>Gesamter aktiver Plan und tatsächlich gebuchter Monat · unabhängig vom Listenfilter</p></div>${monthPicker(c)}</div><div class="eyebrow">REGELMÄSSIGER MONATSPLAN</div><div class="kpi-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${kpi(c, "Regelmäßige Einnahmen", plan.income, "Gehälter und weitere aktive Eingänge", "income")}${kpi(c, "Alle Fixkosten & Abos", plan.expenses, "Jahres- und Quartalskosten anteilig", "contract")}${kpi(c, "Spielraum nach Fixkosten", plan.available, "Vor variablen Ausgaben und Sparzielen", "wallet", true)}</div><div class="eyebrow mt">TATSÄCHLICH GEBUCHT · ${e(monthLabel(c.month))}</div><div class="kpi-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${kpi(c, "Gebuchte Geldeingänge", flow.income, "Alle passenden Eingänge im gewählten Monat", "income")}${kpi(c, "Alle gebuchten Ausgaben", flow.expenses, "Fixe und variable Ausgaben ohne Umbuchungen", "contract")}${kpi(c, "Monatsbilanz", flow.net, "Geldeingänge minus sämtliche Ausgaben", "chart", false, flow.net < 0 ? "negative" : "positive")}</div><p class="muted text-small">Die Planung enthält geschätzte Wiederholungen. Die Monatsbilanz verwendet ausschließlich vorhandene Buchungen bis zum Importstand und zählt aufgeteilte Umsätze einmal.</p></section>`;
}
function contractRow(c, x) {
  return `<div class="contract-row"><div><div class="contract-title"><button data-action="edit-recurring" data-id="${x.id}">${merchantName(c, x.name)}</button>${x.reviewed ? badge("Bestätigt", "mint") : badge(x.confidence === "hoch" ? "Gut erkannt" : "Bitte prüfen", x.confidence === "hoch" ? "subtle" : "amber")}${x.change ? badge("Betrag geändert", "amber") : ""}</div><div class="contract-sub"><span>${e(x.subcategory)}</span><span>·</span><span>${e(accountName(c, x.accountId))}</span>${x.splitSalary ? badge("Teilzahlungen", "lavender") : ""}${x.status !== "active" ? badge({ inactive: "Nicht mehr erkannt", paused: "Pausiert", ended: "Beendet" }[x.status] || x.status, "subtle") : ""}</div></div><div class="contract-date">${x.status === "active" ? "Nächste Zahlung ca." : "Letzte Zahlung"}<strong>${shortDate(x.status === "active" ? x.nextDate : x.lastDate)}</strong></div><div class="contract-amount">${money(monthlyEquivalent(x), c.privacy)}<small>${x.frequency === "monthly" ? "pro Monat" : currencyLabel(c, x)}</small></div><button class="icon-button" data-action="edit-recurring" data-id="${x.id}" aria-label="${c.privacy ? "Eintrag" : e(x.name)} bearbeiten">${icon("edit", 16)}</button></div>`;
}
function currencyLabel(c, x) {
  return `${c.privacy ? "••••" : currency(x.amount)} · ${FREQUENCIES[x.frequency]?.label.toLocaleLowerCase("de-DE") || "monatlich"}`;
}
export function budgetsPage(c) {
  const flow = cashflow(c.state, c.month, c.txs);
  const budgets = c.state.budgets.map((b) => ({
    ...b,
    group: b.group || b.name,
    actual: flow.groups[b.group || b.name] || 0,
  }));
  const totalLimit = sum(budgets.map((b) => b.limit)),
    totalSpent = sum(budgets.map((b) => b.actual));
  return (
    heading(
      c,
      "Dein Monat. Dein Rahmen.",
      "Budgets starten am 1. neu. Nicht genutzte Beträge werden nicht übertragen.",
      `<button class="button primary" data-action="new-budget">${icon("plus", 15)} Budget anlegen</button>`,
      true,
    ) +
    `<div class="kpi-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${kpi(c, "Geplantes Monatsbudget", totalLimit, "Für alle angelegten Kategorien", "target")}${kpi(c, "Davon ausgegeben", totalSpent, "Gebuchte Ausgaben in Budgetkategorien", "wallet")}${kpi(c, "Budget verbleibend", sum([totalLimit, -totalSpent]), "Ohne Übertrag aus dem Vormonat", "chart", true)}</div><section class="card"><div class="card-header"><div><h2>Deine Kategorien</h2><p>Jedes Budget berechnet sich aus den echten Buchungen des gewählten Monats</p></div></div>${budgets.length ? budgets.map((b) => `<div class="budget-row"><div class="row between"><div class="row">${categoryIcon(b.group)}<div class="budget-title">${e(b.group)}</div></div><div class="row"><span class="budget-number">${money(b.actual, c.privacy)} / ${b.limit ? money(b.limit, c.privacy) : "kein Limit"}</span><button class="icon-button" data-action="edit-budget" data-id="${b.id}" aria-label="Budget ${e(b.group)} bearbeiten">${icon("edit", 15)}</button></div></div><div class="progress mt-sm" style="--progress:${b.limit && b.actual > b.limit ? "var(--red)" : GROUPS[b.group]?.color || "var(--mint)"}"><span style="width:${b.limit ? Math.min(100, (b.actual / b.limit) * 100) : 0}%"></span></div><div class="budget-foot"><span>${b.limit ? `${b.actual > b.limit ? "Überschritten um" : "Verbleibend:"} ${money(Math.abs(b.limit - b.actual), c.privacy)}` : "Lege ein Monatslimit fest, um deinen Fortschritt zu sehen."}</span><button class="link-button" data-action="filter-group" data-group="${e(b.group)}">Buchungen ${icon("chevron", 12)}</button></div></div>`).join("") : empty("Noch keine Budgetlimits.", "Lege für deine wichtigsten Ausgabenkategorien einen Monatsrahmen fest.", `<button class="button primary" data-action="new-budget">Budget anlegen</button>`)}</section>`
  );
}
export function analyticsPage(c) {
  const range = Number(c.analytics.range || 6),
    account = c.analytics.account || "",
    group = c.analytics.group || "",
    chart = c.analytics.chart || "cashflow";
  const rows = c.txs.filter(
    (t) =>
      (!account || t.accountId === account) && (!group || t.group === group),
  );
  const months = Array.from({ length: range }, (_, i) =>
    shiftMonth(c.month, i - range + 1),
  );
  const series = months.map((month) => ({
    month,
    ...cashflow(c.state, month, rows),
  }));
  const inRange = rows.filter(
      (t) =>
        t.bookingDate &&
        t.bookingDate.slice(0, 7) >= months[0] &&
        t.bookingDate.slice(0, 7) <= c.month,
    ),
    flow = cashflow(c.state, null, inRange),
    history = (c.state.balanceHistory || []).filter(
      (p) => p.date >= months[0] + "-01" && p.date <= c.month + "-31",
    );
  const groups = Object.entries(flow.groups).sort((a, b) => b[1] - a[1]),
    maxGroup = Math.max(1, ...groups.map(([, v]) => v));
  const recurring = c.recurring.filter(
      (x) =>
        x.direction === "expense" &&
        x.status === "active" &&
        (!account || x.accountId === account) &&
        (!group || x.group === group),
    ),
    recGroups = {};
  for (const x of recurring)
    recGroups[x.group] = sum([recGroups[x.group] || 0, monthlyEquivalent(x)]);
  return (
    heading(
      c,
      "Muster erkennen. Besser planen.",
      "Wechsle Diagramm, Zeitraum, Konto und Kategorie für deinen persönlichen Blick.",
      `<button class="button" data-action="print">${icon("download", 15)} Drucken / PDF</button>`,
      true,
    ) +
    `<section class="card"><div class="chart-toolbar"><label><span class="sr-only">Diagramm auswählen</span><select class="input" data-filter="analytics-chart">${[
      ["cashflow", "Einnahmen & Ausgaben"],
      ["categories", "Ausgaben nach Kategorie"],
      ["net", "Monatsüberschuss"],
      ["fixed", "Fixkosten-Verteilung"],
      ["networth", "Nettovermögen im Verlauf"],
    ]
      .map(([v, l]) => option(v, l, chart))
      .join(
        "",
      )}</select></label><label><span class="sr-only">Zeitraum auswählen</span><select class="input" data-filter="analytics-range">${[3, 6, 12, 24].map((n) => option(n, n + " Monate", range)).join("")}</select></label><label><span class="sr-only">Konto auswählen</span><select class="input" data-filter="analytics-account">${option("", "Alle Konten", account)}${c.state.accounts.map((a) => option(a.id, accountName(c, a.id), account)).join("")}</select></label><label><span class="sr-only">Kategorie auswählen</span><select class="input" data-filter="analytics-group">${option("", "Alle Kategorien", group)}${Object.keys(
      GROUPS,
    )
      .filter((g) => g !== "Umbuchungen")
      .map((g) => option(g, g, group))
      .join(
        "",
      )}</select></label><button class="link-button" data-action="reset-analytics">Filter zurücksetzen</button></div><div class="card-header"><div><h2>${e({ cashflow: "Einnahmen & Ausgaben", categories: "Ausgaben nach Kategorie", net: "Dein monatliches Ergebnis", fixed: "Monatliche Fixkosten-Verteilung", networth: "Dein tatsächlicher Vermögensverlauf" }[chart])}</h2><p>${chart === "fixed" ? "Aktive Verträge · Beträge auf einen Monat umgerechnet" : e(monthLabel(months[0])) + " bis " + e(monthLabel(c.month))}${chart === "networth" ? " · ausschließlich erfasste Vermögensstände" : ""}</p></div>${badge(account ? accountName(c, account) : "Alle Konten", "subtle")}</div>${
      chart === "cashflow"
        ? sparkBars(series, c.privacy)
        : chart === "categories"
          ? categoryChart(flow.groups, c.privacy)
          : chart === "fixed"
            ? Object.keys(recGroups).length
              ? categoryChart(recGroups, c.privacy)
              : empty(
                  "Noch keine laufenden Fixkosten.",
                  "Lege Verträge an oder prüfe die erkannten Vorschläge.",
                )
            : chart === "networth"
              ? lineChart(
                  history.map((p) => ({ date: p.date, value: p.netWorth })),
                  c.privacy,
                )
              : netChart(c, series)
    }${chart === "networth" ? '<div class="notice mt" style="margin-bottom:0">' + icon("info", 16) + "<p>Der Verlauf entsteht aus bestätigten Kontoständen. Ein Buchungsexport enthält keine verlässlichen historischen Gesamtvermögen. Konto- und Kategoriefilter gelten deshalb nur für Buchungsdiagramme.</p></div>" : ""}</section><div class="kpi-grid mt" style="grid-template-columns:repeat(3,minmax(0,1fr))">${kpi(c, "Einnahmen im Zeitraum", flow.income, range + " Monate · ausgewählte Filter", "income")}${kpi(c, "Ausgaben im Zeitraum", flow.expenses, "Interne Umbuchungen herausgerechnet", "wallet")}${kpi(c, "Ergebnis im Zeitraum", flow.net, "Gebuchte Einnahmen abzüglich Ausgaben", "chart", true)}</div><div class="grid-2"><section class="card"><div class="card-header"><div><h2>Ausgaben im Detail</h2><p>Klicke eine Kategorie für die zugehörigen Buchungen</p></div></div><div class="matrix-chart">${groups.map(([g, v]) => `<div class="matrix-row"><button data-action="filter-group" data-group="${e(g)}">${e(g)}</button><div class="matrix-track" style="--cat-color:${GROUPS[g]?.color}"><span style="width:${(v / maxGroup) * 100}%"></span></div><div class="right">${money(v, c.privacy)}</div></div>`).join("") || empty("Keine Ausgaben.", "Verändere die Filter, um Daten anzuzeigen.")}</div></section><section class="card"><div class="card-header"><h2>Monate im Vergleich</h2></div><div class="table-wrap"><table class="tx-table" style="min-width:350px"><thead><tr><th>Monat</th><th>Einnahmen</th><th>Ausgaben</th><th>Ergebnis</th></tr></thead><tbody>${series
      .toReversed()
      .map(
        (s) =>
          `<tr data-action="chart-month" data-month="${s.month}"><td>${e(monthLabel(s.month))}</td><td>${money(s.income, c.privacy)}</td><td>${money(s.expenses, c.privacy)}</td><td>${money(s.net, c.privacy, s.net >= 0 ? "positive" : "negative")}</td></tr>`,
      )
      .join("")}</tbody></table></div></section></div>`
  );
}
function netChart(c, series) {
  const max = Math.max(1, ...series.map((x) => Math.abs(x.net)));
  return `<div class="bar-chart" style="height:215px" role="img" aria-label="Monatsüberschuss im Verlauf">${series.map((x) => `<button class="bar-month" data-action="chart-month" data-month="${x.month}" aria-label="Monat ${e(monthLabel(x.month))} öffnen"><span class="bar-pair" style="height:170px;max-width:42px;position:relative"><span class="chart-bar" style="width:100%;height:${Math.max(2, (Math.abs(x.net) / max) * 100)}%;background:${x.net < 0 ? "var(--red)" : "var(--mint2)"}" ${c.privacy ? "" : `title="Ergebnis ${currency(x.net)}"`}></span></span><span class="bar-label">${e(monthLabel(x.month).split(" ")[0].slice(0, 3))}</span></button>`).join("")}</div><div class="chart-legend"><span><i class="dot"></i>Überschuss</span><span><i class="dot" style="--dot:var(--red)"></i>Fehlbetrag</span></div>`;
}
export function loanPage(c) {
  const l = c.state.loans.find((l) => l.id === c.loanId);
  if (!l)
    return empty(
      "Kredit nicht gefunden.",
      "Öffne deine Kontenübersicht.",
      link("accounts", "Zu den Konten", "button"),
    );
  let p, error;
  try {
    p = loanSchedule(l);
  } catch (err) {
    error = err.message;
  }
  const rows = p?.rows || [],
    future = rows.filter((r) => r.date >= today()),
    shown = (c.loanAll ? rows : future).slice(0, c.loanAll ? 1200 : 24),
    points = rows
      .filter(
        (r, i) =>
          i === 0 ||
          i % Math.max(1, Math.ceil(rows.length / 30)) === 0 ||
          i === rows.length - 1,
      )
      .map((r) => ({ date: r.date, value: r.balance }));
  return `<a href="#/accounts" class="back-link">${icon("arrow", 14)} Konten & Kredite</a><div class="account-head">${bankIcon({ ...l, displayType: "Kredit" }, true)}<div class="grow"><div class="eyebrow">KREDIT · MANUELL ERFASST</div><h1>${c.privacy ? "Kreditkonto" : e(l.name)}</h1><p>${e(BANKS.find((b) => b.id === l.bankLogoId)?.name || l.bankName || "Kredit ohne Bankanbindung")}</p></div><button class="button" data-action="edit-loan" data-id="${l.id}">${icon("edit", 15)} Kredit bearbeiten</button></div>${error ? `<div class="notice error">${icon("alert", 18)}${e(error)}</div>` : ""}${p?.notAmortizing ? `<div class="notice warn">${icon("alert", 18)}<p>Die monatliche Rate reicht für diese Modellrechnung nicht zur vollständigen Tilgung. Prüfe Rate, Sollzins und Restschuld. Ein Schlussdatum lässt sich so nicht berechnen.</p></div>` : ""}<div class="kpi-grid">${kpi(c, "Modell-Restschuld", loanBalance(l), "Ausgehend vom abgeglichenen Stand", "wallet", true)}${kpi(c, "Monatliche Rate", l.monthlyPayment || 0, "Reguläre Rate ohne Sondertilgungen", "contract")}${kpi(c, "Zinsen ab Basisdatum", p?.interest || 0, "Voraussichtliche Zinsen bis zur Tilgung", "chart")}<div class="kpi"><div class="kpi-label">Voraussichtlich schuldenfrei${icon("calendar", 16)}</div><div class="kpi-value" style="font-size:23px">${p?.endDate ? dateLabel(p.endDate) : "Noch offen"}</div><div class="kpi-note">${p?.months ? p.months + " Raten ab Basisdatum" : "Bitte vollständige Kreditdaten eintragen"}</div></div></div><div class="notice">${icon("info", 16)}<p>Modellrechnung mit monatlichem Sollzins (${c.privacy ? "•••" : Number(l.annualRate || 0).toLocaleString("de-DE")} % p. a. / 12), Cent-Rundung und gleichbleibender Rate. Der tatsächliche Bankplan kann durch taggenaue Zinsen, Gebühren oder Buchungstage abweichen. Sondertilgungen werden mit der nächsten Rate berücksichtigt.</p></div><div class="grid-main"><section class="card"><div class="card-header"><div><h2>So sinkt deine Restschuld</h2><p>Geplanter Verlauf ab ${dateLabel(l.balanceDate || today())}</p></div>${badge("Modellrechnung", "amber")}</div>${lineChart([{ date: l.balanceDate || today(), value: l.balance }, ...points], c.privacy, "Berechneter Tilgungsverlauf")}</section><section class="card"><div class="card-header"><h2>Deine Kreditdaten</h2></div><dl class="detail-list"><div><dt>Abgeglichene Restschuld</dt><dd>${money(l.balance, c.privacy)}</dd></div><div><dt>Stand der Restschuld</dt><dd>${dateLabel(l.balanceDate || today())}</dd></div><div><dt>Sollzins pro Jahr</dt><dd>${c.privacy ? "•••" : Number(l.annualRate || 0).toLocaleString("de-DE") + " %"}</dd></div><div><dt>Nächste Rate ab Basisdatum</dt><dd>${dateLabel(l.nextDueDate)}</dd></div><div><dt>Ratenkonto</dt><dd>${e(accountName(c, l.accountId))}</dd></div><div><dt>Voraussichtliche Zahlungen gesamt</dt><dd>${money(p?.total || 0, c.privacy)}</dd></div></dl><div class="row wrap mt"><button class="button small" data-action="edit-loan" data-id="${l.id}">Restschuld abgleichen</button><button class="button small" data-action="extra-payment" data-id="${l.id}">${icon("plus", 13)} Sondertilgung</button></div></section></div><section class="card mt"><div class="card-header"><div><h2>Tilgungsplan</h2><p>${c.loanAll ? "Alle" : "Nächste bis zu 24"} Raten · ${rows.length} berechnete Raten</p></div><div class="row gap-sm"><button class="button small" data-action="loan-all">${c.loanAll ? "Kommende Raten" : "Alle Raten"}</button><button class="button small" data-action="export-loan" data-id="${l.id}">${icon("download", 14)} CSV</button></div></div><div class="table-wrap"><table class="tx-table" style="min-width:650px"><thead><tr><th>Rate</th><th>Datum</th><th>Zahlung</th><th>Zinsen</th><th>Tilgung</th><th>Sondertilgung</th><th>Restschuld</th></tr></thead><tbody>${shown.map((r) => `<tr><td>${r.number}</td><td class="nowrap">${dateLabel(r.date)}</td><td>${money(r.payment, c.privacy)}</td><td class="muted">${money(r.interest, c.privacy)}</td><td>${money(r.principal, c.privacy)}</td><td>${money(r.extra, c.privacy)}</td><td>${money(r.balance, c.privacy)}</td></tr>`).join("")}</tbody></table></div>${!shown.length ? empty("Noch kein Tilgungsplan.", "Ergänze Restschuld, Sollzins und monatliche Rate.") : ""}</section>${l.extraPayments?.length ? `<section class="card mt"><div class="card-header"><h2>Erfasste Sondertilgungen</h2></div>${l.extraPayments.map((x) => `<div class="setting-row"><div>${dateLabel(x.date)}<p>${c.privacy ? "Notiz ausgeblendet" : e(x.note || "Sondertilgung im Modellplan")}</p></div><div class="row">${money(x.amount, c.privacy)}<button class="icon-button" data-action="remove-extra" data-id="${l.id}" data-extra="${x.id}" aria-label="Sondertilgung entfernen">${icon("close", 15)}</button></div></div>`).join("")}</section>` : ""}`;
}
export function settingsPage(c) {
  const audit = (c.state.auditLog || []).toReversed().slice(0, 15);
  return (
    heading(
      c,
      "Dein persönlicher Finanzraum.",
      "Einstellungen, lokale Sicherungen und nachvollziehbare Änderungen.",
    ) +
    `<div class="settings-grid"><section class="card"><div class="card-header"><div><h2>Deine Daten</h2><p>Gemeinsam für alle Browser auf diesem Mac</p></div>${icon("lock", 20)}</div><div class="setting-row"><div><h3>Lokaler Datenbestand</h3><p>${c.txs.length.toLocaleString("de-DE")} Buchungen · ${c.state.accounts.length} Konten · ${c.state.loans.length} Kredite. Vollständige IBANs bleiben erhalten.</p></div>${badge(c.syncStatus === "error" ? "Prüfen" : "Gespeichert", c.syncStatus === "error" ? "amber" : "mint")}</div><div class="setting-row"><div><h3>Sicherung herunterladen</h3><p>Eine vollständige lokale JSON-Datei mit Konten, Buchungen, Verträgen und Änderungen.</p></div><button class="button small" data-action="export-backup">${icon("download", 14)} Sichern</button></div><div class="setting-row"><div><h3>Sicherung wiederherstellen</h3><p>Vor dem Ersetzen wird der aktuelle Stand gesichert. Die Datei wird vorab geprüft.</p></div><button class="button small" data-action="restore">${icon("upload", 14)} Öffnen</button></div><div class="setting-row"><div><h3>Buchungen importieren</h3><p>Excel (.xlsx) und CSV mit Vorschau, Datumsprüfung und Schutz vor doppelten Importen.</p></div><button class="button small" data-action="import">Importieren</button></div><div class="setting-row"><div><h3>Privatmodus</h3><p>Beträge, Namen und IBANs vor neugierigen Blicken oder Screenshots ausblenden.</p></div><button class="button small" data-action="privacy">${icon(c.privacy ? "eyeoff" : "eye", 14)} ${c.privacy ? "Eingeschaltet" : "Ausgeschaltet"}</button></div></section><section class="card"><div class="card-header"><div><h2>OpenAI Finanzagent</h2><p>Persönliche Fragen mit deinem Datenkontext</p></div>${icon("spark", 20)}</div><div class="notice ${c.aiStatus?.configured ? "" : "warn"}">${icon(c.aiStatus?.configured ? "check" : "info", 16)}<p>${c.aiStatus?.configured ? "API-Schlüssel lokal hinterlegt · " + e(c.aiStatus.model) : "Noch kein API-Schlüssel hinterlegt."}<br>App-Kostenschätzung im Monat: ${c.privacy ? "••••" : "$" + Number(c.aiStatus?.usd || 0).toFixed(4)} von $${c.aiStatus?.limitUsd || 5}.</p></div><form data-form="ai-settings"><div class="field"><label for="openai-key">Neuen API-Schlüssel lokal speichern</label><input class="input" id="openai-key" name="key" type="password" autocomplete="new-password" placeholder="API-Schlüssel hier einfügen" minlength="20" required><div class="help">Der Schlüssel wird ausschließlich auf diesem Mac gespeichert.</div></div><div class="row wrap mt"><button class="button primary" type="submit">Schlüssel speichern</button><button class="button" type="button" data-action="ai-test">Verbindung prüfen</button>${c.aiStatus?.configured ? '<button class="button secondary" type="button" data-action="remove-key">Schlüssel entfernen</button>' : ""}</div><div class="form-error mt-sm" data-form-error hidden></div></form><p class="muted text-small mt">Bei einer Frage werden eine kompakte Finanzübersicht und ausgewählte Buchungen an OpenAI gesendet. IBANs und API-Schlüssel werden nicht als Finanzkontext übertragen. Die konservative App-Schätzung pausiert weitere Anfragen am $5-Limit im Kalendermonat. Maßgeblich bleibt die OpenAI-Abrechnung.</p></section><section class="card" style="grid-column:1/-1"><div class="card-header"><div><h2>Änderungsverlauf</h2><p>Manuelle Anpassungen bleiben nachvollziehbar</p></div><button class="button small" data-action="undo" ${audit.some((x) => x.undo && !x.undoneAt) ? "" : "disabled"}>${icon("undo", 14)} Letzte Änderung rückgängig</button></div>${audit.map((x) => `<div class="audit-row">${icon(x.undoneAt ? "undo" : "edit", 16)}<div class="grow"><div>${e(c.privacy ? "Manuelle Änderung" : x.label)}</div><p>${new Date(x.at).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}</p></div>${badge(x.undoneAt ? "Rückgängig" : "Gespeichert", x.undoneAt ? "subtle" : "mint")}</div>`).join("") || empty("Noch keine manuellen Änderungen.", "Sobald du Einträge anpasst, erscheint hier ein nachvollziehbarer Verlauf.")}</section></div>`
  );
}
export function agentPage(c) {
  const prompts = [
    "Wie setzt sich mein monatlicher Spielraum zusammen?",
    "Welche Verträge oder Preisänderungen sollte ich prüfen?",
    "Wie haben sich meine Ausgaben zuletzt verändert?",
    "Welche Daten fehlen noch für einen vollständigen Überblick?",
  ];
  return (
    heading(
      c,
      "Ein klarer Blick auf deine Finanzen.",
      "Dein Finanzagent beantwortet Fragen anhand deines aktuellen Datenbestands.",
    ) +
    `<section class="card" style="margin-bottom:24px"><div class="card-header"><div><h2>${icon("spark", 18)} KI-Zuordnungen</h2><p>Bis zu 40 Buchungen je Prüfung. Sichere Korrekturen erscheinen im Änderungsverlauf und sind rückgängig machbar.</p></div><button class="button" data-action="ai-review" ${c.aiReviewBusy || c.aiBusy || !c.aiStatus?.configured || c.aiStatus?.paused ? "disabled" : ""}>${c.aiReviewBusy ? "Prüfung läuft …" : "Zuordnungen prüfen"}</button></div><label class="checkbox"><input type="checkbox" data-setting="ai-automation" ${c.state.aiAutomationEnabled !== false ? "checked" : ""}><span>Neue Buchungen nach Import oder Bankabruf automatisch prüfen, solange die App geöffnet und das KI-Budget verfügbar ist.</span></label><p class="muted text-small mt-sm">Manuelle Korrekturen und eigene Regeln haben Vorrang. Die KI verändert nur Kategorien, keine Beträge oder Bankdaten.</p>${c.state.aiReview ? `<div class="notice mt" style="margin-bottom:0">${icon("check", 16)}<p>Letzte Prüfung: ${dateLabel(c.state.aiReview.at)} · ${c.state.aiReview.checked} Buchungen · ${c.state.aiReview.applied} Zuordnungen übernommen.${c.privacy ? "" : (c.state.aiReview.notes || []).map((n) => `<br>${e(n)}`).join("")}</p></div>` : ""}</section><div class="chat-layout"><section class="card chat-main"><div class="card-header"><div class="row"><span class="category-icon large">${icon("spark", 23)}</span><div><h2>Dein Finanzagent</h2><p>${c.aiStatus?.configured ? "OpenAI verbunden · Kostenlimit $5 pro Monat" : "API-Schlüssel in den Einstellungen hinterlegen"}</p></div></div>${badge(c.aiStatus?.paused ? "Pausiert" : "Persönlicher Assistent", c.aiStatus?.paused ? "amber" : "mint")}</div><div class="chat-messages" id="chat-messages">${c.chat.length ? c.chat.map((m) => `<div class="chat-bubble ${m.role}">${c.privacy ? "Gespräch im Privatmodus ausgeblendet" : e(m.text)}</div>`).join("") : `<div class="chat-bubble assistant">Hallo. Ich helfe dir, deine Ausgaben, Verträge und Einnahmen einzuordnen. Ich kann dir zeigen, welche Beträge gebucht sind, wie sich Kosten verändern und welche Angaben noch fehlen.\n\nWas möchtest du dir ansehen?</div>`}${c.aiBusy ? '<div class="chat-bubble assistant"><div class="row"><span class="spinner"></span> Dein Finanzblick wird analysiert …</div></div>' : ""}</div><form class="chat-composer" data-form="chat"><label for="chat-input" class="sr-only">Deine Frage</label><textarea id="chat-input" class="input" name="message" rows="2" maxlength="2000" placeholder="Frag zum Beispiel nach deinen Fixkosten …" required ${c.aiBusy ? "disabled" : ""}></textarea><button class="button primary" type="submit" ${c.aiBusy ? "disabled" : ""} aria-label="Frage senden">${icon("arrow", 18)}</button></form><div class="text-small subtle mt-sm">Nur bei einer Anfrage wird Finanzkontext an OpenAI übertragen. Antworten können unvollständig sein.</div></section><aside class="stack"><section class="card"><div class="card-header"><h2>Gute Fragen für den Anfang</h2></div>${prompts.map((p) => `<button class="chat-suggestion" data-action="chat-prompt" data-prompt="${e(p)}">${e(p)} ${icon("arrow", 13)}</button>`).join("")}</section><section class="card"><div class="eyebrow">DEIN KONTEXT</div><h3>${c.txs.length.toLocaleString("de-DE")} Buchungen</h3><p class="muted text-small mt-sm">${c.state.accounts.length} Konten · ${c.recurring.filter((x) => x.status === "active").length} aktive wiederkehrende Zahlungen.</p><hr><p class="text-small muted">Der Assistent trifft keine Bank- oder Anlageentscheidungen. Änderungen an deinen Verträgen bestätigst du in der App.</p>${link("settings", "KI-Einstellungen", "link-button mt")}</section></aside></div>`
  );
}
export const bankPage = bankPageView;
export function renderPage(c) {
  switch (c.route) {
    case "savings": return `<savings-panel ${c.privacy ? "private" : ""}></savings-panel>`;
    case "fints":
      return fintsPage(c);
    case "dashboard":
      return dashboard(c);
    case "transactions":
      return transactionsPage(c);
    case "accounts":
      return accountsPage(c);
    case "recurring":
      return recurringPage(c);
    case "income":
      return recurringPage(c, "income");
    case "analytics":
      return analyticsPage(c);
    case "budgets":
      return budgetsPage(c);
    case "loan":
      return loanPage(c);
    case "settings":
      return settingsPage(c);
    case "agent":
      return agentPage(c);
    case "bank":
      return bankPage(c);
    default:
      return empty(
        "Diese Seite wurde nicht gefunden.",
        "Zurück zu deiner Finanzübersicht.",
        link("dashboard", "Zur Übersicht", "button"),
      );
  }
}
