import { accountForecast } from "./forecast.mjs";
import { escape as e, icon, money, dateLabel, option } from "./ui.mjs";
const accountLabel = (c, a) =>
  c.privacy ? "Konto " + (c.state.accounts.indexOf(a) + 1) : a.name;
const thousandStatus = (value, privacy) => {
  if (value == null) return "";
  const difference = Math.round((value - 1000) * 100) / 100;
  if (Math.abs(difference) < 0.01) return "Zielwert 1.000 € genau erreicht";
  return difference < 0
    ? `Noch ${money(-difference, privacy)} bis 1.000 €`
    : `${money(difference, privacy)} über 1.000 €`;
};
const frame = (title, body) => ({
  wide: true,
  html: `<div class="modal-head"><div><div class="eyebrow">DEIN FINANZBLICK</div><h2 id="modal-title">${title}</h2></div><button class="icon-button" data-action="close-modal" aria-label="Schließen">${icon("close")}</button></div><div class="modal-body">${body}</div>`,
});
export function forecastTile(c) {
  const f = accountForecast(c.state, { items: c.recurring });
  return `<button class="kpi forecast-kpi" data-action="forecast-detail"><span class="kpi-label">Kontostand am nächsten 10.${icon("calendar", 16)}</span><span class="kpi-value ${f.projected < 0 ? "negative" : ""}">${f.projected == null ? "Noch offen" : money(f.projected, c.privacy)}</span><span class="kpi-note">${dateLabel(f.target)} · Kontostand nach geplanten Bewegungen</span>${f.projected == null ? "" : `<span class="kpi-note"><strong>${thousandStatus(f.projected, c.privacy)}</strong></span>`}<span class="link-button mt-sm">Berechnung & Konto ${icon("chevron", 13)}</span></button>`;
}
export function forecastDialog(c) {
  const f = accountForecast(c.state, { items: c.recurring }),
    a = c.state.accounts.find((a) => a.id === f.accountId);
  return frame(
    "Kontostand am " + dateLabel(f.target),
    `<p class="muted">${a ? e(accountLabel(c, a)) : "Gehaltskonto auswählen"} · Prognose zum Tagesende des nächsten 10.</p>
    <div class="kpi featured mt"><div class="kpi-label">Voraussichtlich verbleibend</div><div class="kpi-value">${f.projected == null ? "Noch offen" : money(f.projected, c.privacy)}</div>${f.projected == null ? "" : `<p><strong>${thousandStatus(f.projected, c.privacy)}</strong></p>`}<p class="muted text-small">Planwert aus deinen bestätigten Einnahmen und Fixkosten.</p></div>
    ${f.projected == null ? "" : `<div class="table-wrap mt"><table class="tx-table" style="min-width:280px"><tbody><tr><td>Gebuchter Kontostand · ${dateLabel(f.balanceDate)}</td><td>${money(f.balance, c.privacy)}</td></tr><tr><td>Erwartete Eingänge</td><td>${money(f.income, c.privacy)}</td></tr><tr><td>Erwartete Abbuchungen & Überträge</td><td>${money(-f.expenses, c.privacy)}</td></tr></tbody></table></div>`}
    <form data-form="forecast-settings" class="mt"><div class="form-grid"><div class="field full"><label for="forecast-account">Gehaltskonto</label><select class="input" id="forecast-account" name="accountId">${option("", "Konto auswählen", f.accountId)}${c.state.accounts.map((a) => option(a.id, accountLabel(c, a), f.accountId)).join("")}</select><div class="help">Die Berechnung verwendet ausschließlich den gebuchten Kontostand und erwartete Buchungen bis zum nächsten 10. Es werden keine Durchschnittswerte oder vermuteten Ausgaben angesetzt.</div></div></div><div class="form-error mt" data-form-error hidden></div><button class="button primary mt" type="submit">Gehaltskonto speichern</button></form>
    <details class="mt" open><summary>Geplante Bewegungen (${f.events.length})</summary><div class="table-wrap mt"><table class="tx-table" style="min-width:320px"><thead><tr><th>Datum</th><th>Zahlung</th><th>Betrag</th></tr></thead><tbody>${f.events.map((x) => `<tr><td>${dateLabel(x.date)}${x.overdue ? " · überfällig" : ""}</td><td>${c.privacy ? "Geplante Zahlung" : e(x.name)}<div class="caption">${x.kind === "transfer" ? "Interner Übertrag" : x.reviewed ? "Bestätigter Plan" : "Erkannte Zahlung"}</div></td><td>${money(x.amount, c.privacy)}</td></tr>`).join("") || '<tr><td colspan="3">Noch keine passenden Zahlungstermine erfasst.</td></tr>'}</tbody></table></div></details>
    <div class="notice mt"><div><p><strong>Automatisch aktuell:</strong> Änderungen an Fixkosten, Einnahmen und Kontoständen werden sofort beziehungsweise bei Änderungen auf einem anderen Gerät innerhalb von 30 Sekunden neu berechnet.</p>${f.warnings.map((w) => `<p>${e(w)}</p>`).join("")}<p>Nur bestätigte Bewegungen auf diesem Konto zählen. Datum und Betrag werden unverändert aus Einnahmen und Fixkosten übernommen.</p></div></div>`,
  );
}
export function duplicateDialog(c, page = 0) {
  const all = [...c.state.extraTransactions, ...c.state.transactions],
    rows = all.filter((t) => t.bankDuplicateOf),
    size = 20;
  const start = Math.max(0, page) * size;
  return frame(
    "Bankabgleich nachvollziehen",
    `<p class="muted">${rows.length} Bankkopien sind ihren vorhandenen Importbuchungen zugeordnet. Alle Originaldaten bleiben gespeichert. Nur die vorhandene Buchung zählt in Auswertungen und Verträgen.</p><div class="table-wrap mt"><table class="tx-table"><thead><tr><th>Datum</th><th>Bank → Import</th><th>Betrag</th><th></th></tr></thead><tbody>${rows
      .slice(start, start + size)
      .map((t) => {
        const original = all.find((x) => x.id === t.bankDuplicateOf);
        return `<tr><td>${dateLabel(t.bookingDate)}</td><td>${c.privacy ? "Zahlungspartner ausgeblendet" : e(t.merchant)}<div class="caption">${c.privacy ? "Vorhandene Importbuchung" : e(original?.merchant || "Original")}</div></td><td>${money(t.amount, c.privacy)}</td><td><button class="button small" data-action="restore-bank-duplicate" data-id="${e(t.id)}">Separat zählen</button></td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><p class="text-small muted mt">„Separat zählen“ hebt nur diese Zuordnung auf. Verwende es, wenn es tatsächlich zwei verschiedene Zahlungen sind.</p><div class="row between mt"><button class="button" data-action="bank-duplicates" data-page="${page - 1}" ${page <= 0 ? "disabled" : ""}>Zurück</button><span>${page + 1} / ${Math.max(1, Math.ceil(rows.length / size))}</span><button class="button" data-action="bank-duplicates" data-page="${page + 1}" ${start + size >= rows.length ? "disabled" : ""}>Weiter</button></div>`,
  );
}
