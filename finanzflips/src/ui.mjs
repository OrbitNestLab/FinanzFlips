import { GROUPS, sum, isoDate } from "./model.mjs";
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const currency = (n) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    Number(n) || 0,
  );
export const dateLabel = (value) =>
  isoDate(value)
    ? new Intl.DateTimeFormat("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(isoDate(value) + "T12:00:00Z"))
    : "Noch offen";
export const shortDate = (value) =>
  isoDate(value)
    ? new Intl.DateTimeFormat("de-DE", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(new Date(isoDate(value) + "T12:00:00Z"))
    : "–";
export const monthLabel = (month) =>
  new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month + "-15T12:00:00Z"));
const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  wallet:
    "M20 8V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6m18 7h-5v4h5",
  contract: "M7 3h10l4 4v14H3V3h4m10 0v5h4M7 12h10M7 16h7",
  income: "M12 20V4m-6 6 6-6 6 6M4 20h16",
  chart: "M3 3v18h18M7 15v-4m5 4V7m5 8v-7",
  target: "M12 8a4 4 0 1 0 4 4m-4-9a9 9 0 1 0 9 9M12 12l8-8m-5 0h5v5",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m-8 4-1-2 2-3 2 .2L9 4h6l2 3.2L19 7l2 3-1 2 1 2-2 3-2-.2L15 20H9l-2-3.2L5 17l-2-3 1-2",
  bank: "m3 8 9-5 9 5H3m2 3v7m7-7v7m7-7v7M3 21h18",
  home: "m3 10 9-7 9 7v11h-6v-7H9v7H3V10",
  car: "m5 7 2-4h10l2 4 2 3v8H3v-8l2-3Zm0 0h14M6 13h2m8 0h2M5 18v3m14-3v3",
  shield: "m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3Zm-4 9 3 3 5-6",
  layers: "m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8",
  basket: "M3 9h18l-2 12H5L3 9ZM7 9l5-7 5 7M9 13v4m6-4v4",
  coffee: "M3 4h13v13H3V4Zm13 2h3a3 3 0 0 1 0 6h-3M2 21h16",
  train: "M6 3h12v15H6V3Zm0 9h12M9 6h6M8 21l2-3m4 0 2 3M9 15h.01M15 15h.01",
  plus: "M12 5v14M5 12h14",
  paw: "M8 13c-2 2-3 7 1 7l3-1 3 1c4 0 3-5 1-7-2-3-6-3-8 0ZM5 9c-2 0-3-4-1-5s4 4 1 5Zm5-3c-2 1-4-4-2-5s4 4 2 5Zm4 0c-2-1 0-6 2-5s0 6-2 5Zm5 3c-3-1-1-6 1-5s1 5-1 5Z",
  trend: "m3 17 6-6 4 4 8-10m-6 0h6v6",
  transfer: "M3 7h17m-5-5 5 5-5 5M21 17H4m5-5-5 5 5 5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  close: "m6 6 12 12M6 18 18 6",
  search: "M21 21l-5-5m2-6a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  eyeoff:
    "m3 3 18 18M9 5c6-2 13 7 13 7s-2 4-6 6M6 6c-3 2-4 6-4 6s4 7 10 7c1 0 2 0 3-.5",
  lock: "M5 10h14v11H5V10Zm3 0V6a4 4 0 0 1 8 0v4M12 14v3",
  check: "m5 12 4 4L19 6",
  refresh:
    "M21 3v6h-6M3 21v-6h6M4 9a8 8 0 0 1 13-5l4 5M3 15l4 5a8 8 0 0 0 13-5",
  edit: "m15 4 5 5M3 21l5-1L21 7l-5-5L3 15v6",
  undo: "M3 4v6h6M3 10a9 9 0 1 1 1 8",
  info: "M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  upload: "M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6",
  download: "M12 3v13m-5-5 5 5 5-5M3 16v5h18v-5",
  calendar: "M4 5h16v16H4V5Zm3-3v6m10-6v6M4 10h16",
  logout: "M10 3H3v18h7m4-14 5 5-5 5M8 12h13",
  menu: "M3 6h18M3 12h18M3 18h18",
  alert: "m12 3 10 18H2L12 3Zm0 6v5m0 3h.01",
  clock: "M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  file: "M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 13h8m-8 4h5",
};
export const icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.wallet}"/></svg>`;
export function money(n, privacy = false, cls = "") {
  return privacy
    ? `<span class="redacted ${cls}" aria-label="Betrag ausgeblendet">••••••</span>`
    : `<span class="money ${cls}">${escape(currency(n))}</span>`;
}
export const badge = (text, kind = "") =>
  `<span class="badge ${kind}">${escape(text)}</span>`;
export const empty = (title, description, action = "") =>
  `<div class="empty-state"><div class="empty-icon">${icon("search", 28)}</div><h3>${escape(title)}</h3><p>${escape(description)}</p>${action}</div>`;
export const option = (value, label, selected) =>
  `<option value="${escape(value)}" ${String(selected) === String(value) ? "selected" : ""}>${escape(label)}</option>`;
export function sparkBars(series, privacy = false) {
  const max = Math.max(1, ...series.flatMap((x) => [x.income, x.expenses]));
  return `<div class="bar-chart" role="img" aria-label="Einnahmen und Ausgaben im Monatsvergleich">${series.map((x) => `<button class="bar-month" data-action="chart-month" data-month="${x.month}" aria-label="${escape(monthLabel(x.month))}"><span class="bar-pair"><span class="chart-bar income-bar" style="height:${Math.max(2, (x.income / max) * 100)}%" ${privacy ? "" : `title="Einnahmen ${currency(x.income)}"`}></span><span class="chart-bar expense-bar" style="height:${Math.max(2, (x.expenses / max) * 100)}%" ${privacy ? "" : `title="Ausgaben ${currency(x.expenses)}"`}></span></span><span class="bar-label">${escape(monthLabel(x.month).split(" ")[0].slice(0, 3))}</span></button>`).join("")}</div><div class="chart-legend"><span><i class="dot" style="--dot:var(--mint)"></i>Einnahmen</span><span><i class="dot" style="--dot:var(--lavender)"></i>Ausgaben</span></div>`;
}
export function categoryChart(groups, privacy = false) {
  const rows = Object.entries(groups).sort((a, b) => b[1] - a[1]),
    total = sum(rows.map(([, v]) => v));
  let offset = 0;
  const circles = rows
    .map(([group, value]) => {
      const length = total ? (value / total) * 100 : 0,
        s = `<circle cx="66" cy="66" r="50" fill="none" stroke="${GROUPS[group]?.color || "#89958d"}" stroke-width="17" pathLength="100" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 66 66)"/>`;
      offset += length;
      return s;
    })
    .join("");
  return `<div class="category-visual"><div class="donut"><svg viewBox="0 0 132 132" role="img" aria-label="Verteilung der Ausgaben nach Kategorien"><circle cx="66" cy="66" r="50" fill="none" stroke="var(--line)" stroke-width="17"/>${circles}</svg><div class="donut-label"><span>Ausgaben</span>${money(total, privacy)}</div></div><div class="category-legend">${rows
    .slice(0, 6)
    .map(
      ([group, value]) =>
        `<button class="category-key" data-action="filter-group" data-group="${escape(group)}"><i class="dot" style="--dot:${GROUPS[group]?.color || "#89958d"}"></i><span>${escape(group)}</span>${money(value, privacy)}</button>`,
    )
    .join(
      "",
    )}${rows.length > 6 ? `<div class="muted text-small">+ ${rows.length - 6} weitere Kategorien in der Auswertung</div>` : ""}</div></div>`;
}
export function lineChart(
  points,
  privacy = false,
  label = "Verlauf bestätigter Vermögensstände",
) {
  if (points.length < 2)
    return empty(
      "Dein Verlauf wächst mit.",
      "Sobald zwei bestätigte Vermögensstände vorliegen, erscheint hier dein tatsächlicher Verlauf.",
    );
  const values = points.map((x) => x.value),
    min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1;
  const coords = points.map((p, i) => [
    20 + (i / (points.length - 1)) * 760,
    165 - ((p.value - min) / range) * 135,
  ]);
  return `<svg class="line-chart" viewBox="0 0 800 210" role="img" aria-label="${escape(label)}"><defs><linearGradient id="line-area" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#a8e6bc" stop-opacity=".22"/><stop offset="1" stop-color="#a8e6bc" stop-opacity="0"/></linearGradient></defs><path d="M${coords.map((x) => x.join(",")).join(" L")} L780,180 L20,180Z" fill="url(#line-area)"/><path d="M${coords.map((x) => x.join(",")).join(" L")}" fill="none" stroke="var(--mint)" stroke-width="2.5"/>${coords.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4" fill="var(--mint)">${privacy ? "" : `<title>${dateLabel(points[i].date)} · ${currency(points[i].value)}</title>`}</circle>`).join("")}<text x="20" y="205" fill="#89978e" font-size="13">${shortDate(points[0].date)}</text><text x="780" y="205" text-anchor="end" fill="#89978e" font-size="13">${shortDate(points.at(-1).date)}</text></svg>`;
}
