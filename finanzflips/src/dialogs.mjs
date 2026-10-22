import {
  GROUPS,
  FREQUENCIES,
  maskedIdentifier,
  today,
  monthlyEquivalent,
  loanSchedule,
  addMonths,
  isoDate,
  sum,
} from "./model.mjs";
import {
  escape as e,
  icon,
  option,
  money,
  badge,
  dateLabel,
  currency,
  shortDate,
} from "./ui.mjs";
import { BANKS } from "./bank-catalog.mjs";
import { accountName, merchantName, txTable, bankIcon } from "./views.mjs";
const field = (name, label, input, help = "", full = false) =>
  `<div class="field ${full ? "full" : ""}"><label for="f-${name}">${label}</label>${input}${help ? `<div class="help">${help}</div>` : ""}</div>`;
const input = (name, value, type = "text", attrs = "") =>
  `<input class="input" id="f-${name}" name="${name}" type="${type}" value="${e(value ?? "")}" ${attrs}>`;
const select = (name, options, attrs = "") =>
  `<select class="input" id="f-${name}" name="${name}" ${attrs}>${options}</select>`;
const accounts = (c, value, optional = true) =>
  (optional ? option("", "Noch nicht zugeordnet", value) : "") +
  c.state.accounts
    .map((a) => option(a.id, accountName(c, a.id), value))
    .join("");
const groups = (value, income = false) =>
  (income
    ? ["Einnahmen"]
    : Object.keys(GROUPS).filter(
        (g) => !["Einnahmen", "Umbuchungen"].includes(g),
      )
  )
    .map((g) => option(g, g, value))
    .join("");
export const subOptions = (group, value) => {
  const values = [
    ...new Set([...(GROUPS[group]?.sub || []), value].filter(Boolean)),
  ];
  return values.map((g) => option(g, g, value)).join("");
};
const footer = (save = "Speichern", extra = "") =>
  `<div class="modal-foot">${extra}<button class="button secondary" type="button" data-action="close-modal">Abbrechen</button><button class="button primary" type="submit">${e(save)}</button></div>`;
function frame(title, sub, html, wide = false) {
  return {
    wide,
    html: `<div class="modal-head"><div>${sub ? `<div class="eyebrow">${e(sub)}</div>` : ""}<h2 id="modal-title">${e(title)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="Dialog schließen">${icon("close", 21)}</button></div>${html}`,
  };
}
export function recurringDialog(c, item = {}, direction = "expense") {
  const x = {
    direction,
    status: "active",
    frequency: "monthly",
    group: direction === "income" ? "Einnahmen" : "Wohnen",
    subcategory: direction === "income" ? "Gehalt" : "Miete",
    ...item,
  };
  const income = x.direction === "income";
  return frame(
    item.id
      ? "Eintrag prüfen & bearbeiten"
      : income
        ? "Einnahme anlegen"
        : "Vertrag anlegen",
    income ? "REGELMÄSSIGE EINNAHME" : "FIXKOSTEN & ABOS",
    `<form data-form="recurring" data-id="${e(item.id || "")}"><div class="modal-body"><div class="form-grid">${item.reason ? `<div class="field full"><div class="contract-detail-note">${icon("spark", 15)} ${e(item.reason)}${item.change ? `<br><span class="amber">Mögliche Änderung: ${money(item.change.previous, c.privacy)} → ${money(item.change.current, c.privacy)} pro Monat.</span>` : ""}</div></div>` : ""}${field("name", income ? "Bezeichnung / Arbeitgeber" : "Anbieter / Bezeichnung", input("name", x.name, "text", 'required maxlength="140" data-sensitive'), "", true)}<input type="hidden" name="direction" value="${x.direction}">${field("amount", x.frequency === "monthly" ? "Planbetrag pro Monat" : "Betrag pro Zahlung", input("amount", x.amount ?? "", "number", 'required min="0.01" max="100000000" step="0.01" data-sensitive'), income && x.splitSalary ? "Ein monatlicher Gesamtbetrag für alle Teilzahlungen dieses Arbeitgebers." : "Positive Beträge eingeben. Einnahme oder Ausgabe ergibt sich aus der Art des Eintrags.")}${field(
      "frequency",
      "Zahlungsrhythmus",
      select(
        "frequency",
        Object.entries(FREQUENCIES)
          .map(([k, v]) => option(k, v.label, x.frequency))
          .join(""),
      ),
    )}${field("group", "Lebensbereich", select("group", groups(x.group, income), 'data-dialog-filter="group"'))}${field("subcategory", income ? "Art der Einnahme" : "Unterkategorie", select("subcategory", subOptions(x.group, x.subcategory)))}${field("customSubcategory", "Eigene Unterkategorie (optional)", input("customSubcategory", "", "text", 'maxlength="100" placeholder="Zum Beispiel Versicherung Zweitwagen"'), "Ersetzt die ausgewählte Unterkategorie nur für diesen Eintrag.", true)}${field("accountId", income ? "Eingangskonto" : "Zahlungskonto", select("accountId", accounts(c, x.accountId)), "", true)}${field("nextDate", "Nächste Zahlung voraussichtlich", input("nextDate", x.nextDate || addMonths(today(), 1), "date"))}${field(
      "status",
      "Status",
      select(
        "status",
        [
          ["active", "Aktiv"],
          ["paused", "Pausiert"],
          ["inactive", "Nicht mehr erkannt"],
          ["ended", "Beendet"],
        ]
          .map(([v, l]) => option(v, l, x.status))
          .join(""),
      ),
    )}${field("matchMerchant", "Buchungen zuordnen über Anbietertext", input("matchMerchant", x.matchMerchant || x.merchant || x.name || "", "text", 'maxlength="140" data-sensitive'), "Optional: Dieser Text wird für zugehörige Buchungen verwendet.", true)}<div class="form-label">VERTRAGSDETAILS · OPTIONAL</div>${field("endDate", "Bekanntes Vertragsende", input("endDate", x.endDate, "date"))}${field("noticeDays", "Kündigungsfrist in Tagen", input("noticeDays", x.noticeDays ?? "", "number", 'min="0" max="3650" step="1"'))}${field("notes", "Deine Notizen", `<textarea class="input" id="f-notes" name="notes" maxlength="2000" rows="3" placeholder="Zum Beispiel Vertragsnummer oder Hinweise …" data-sensitive>${e(x.notes || "")}</textarea>`, "Notizen bleiben lokal gespeichert.", true)}<div class="form-preview field full" id="recurring-preview">${money(monthlyEquivalent(x), c.privacy)} pro Monat in deiner Planung</div><div class="form-error" data-form-error hidden></div></div>${item.id ? `<div class="row wrap mt"><button class="button small" type="button" data-action="contract-transactions" data-id="${x.id}">${icon("list", 14)} Zugehörige Buchungen ${x.evidenceIds?.length ? "(" + x.evidenceIds.length + ")" : ""}</button>${x.source === "detected" && !x.reviewed ? badge("Änderungen bestätigen den Eintrag", "mint") : ""}</div>` : ""}</div>${footer("Speichern & bestätigen", item.id ? `<button class="button danger small" style="margin-right:auto" type="button" data-action="reject-recurring" data-id="${x.id}">${x.source === "manual" ? "Eintrag entfernen" : "Vorschlag verwerfen"}</button>` : "")}</form>`,
  );
}
export function accountDialog(c, a = {}) {
  return frame(
    a.id ? "Konto bearbeiten" : "Konto anlegen",
    "KONTODATEN",
    `<form data-form="account" data-id="${e(a.id || "")}"><div class="modal-body"><div class="form-grid">${field("name", "Kontoname", input("name", a.name, "text", 'required maxlength="120" data-sensitive'), "", true)}${field("displayType", "Kontoart", select("displayType", ["Girokonto", "Tagesgeld", "Sparkonto", "Depot", "Verrechnungskonto", "Kreditkarte", "PayPal", "Wallet", "Bargeld", "Sonstiges"].map((t) => option(t, t, a.displayType || "Girokonto")).join("")))}${field("balance", "Letzter bekannter Kontostand", input("balance", a.balance ?? 0, "number", 'required step="0.01" data-sensitive'), "Ein negativer Kontostand ist möglich.")}${field("iban", "IBAN / Kontokennung", input("iban", a.iban, "text", 'maxlength="100" autocomplete="off" spellcheck="false" data-sensitive'), "Wird vollständig lokal gespeichert und in der Übersicht maskiert.", true)}${field("balanceUpdatedAt", "Stand des Kontostands", input("balanceUpdatedAt", a.balanceUpdatedAt || isoDate(a.lastActivity) || today(), "date", "required"))}<div class="field"><label>Vermögensübersicht</label><label class="checkbox"><input type="checkbox" name="includeInNetWorth" ${a.includeInNetWorth !== false ? "checked" : ""}><span>Dieses Konto zum Nettovermögen zählen</span></label></div>${field("notes", "Notizen", `<textarea class="input" name="notes" id="f-notes" maxlength="2000" rows="3" data-sensitive>${e(a.notes || "")}</textarea>`, "", true)}<div class="form-error" data-form-error hidden></div></div><div class="notice mt" style="margin-bottom:0">${icon("info", 15)}<p>Die Buchungen bleiben über eine feste Kontokennung zugeordnet, auch wenn du den Namen änderst. Die Banklogo-Auswahl ist für manuelle Kreditkonten vorgesehen.</p></div></div>${footer()}</form>`,
  );
}
export function transactionDialog(c, t = {}) {
  return frame(
    t.id ? "Buchung im Detail" : "Buchung hinzufügen",
    "BUCHUNGEN",
    `<form data-form="transaction" data-id="${e(t.id || "")}"><div class="modal-body"><div class="form-grid">${field("merchant", "Zahlungspartner / Beschreibung", input("merchant", t.merchant, "text", 'required maxlength="250" data-sensitive'), "", true)}${field("date", "Buchungsdatum", input("date", t.bookingDate || isoDate(t.date) || today(), "date", "required"))}${field("amount", "Gebuchter Betrag", input("amount", t.amount ?? "", "number", 'required step="0.01" data-sensitive'), "Ausgaben negativ, Einnahmen positiv.")}${field("accountId", "Konto", select("accountId", accounts(c, t.accountId, false)), "", true)}${field(
      "group",
      "Lebensbereich",
      select(
        "group",
        Object.keys(GROUPS)
          .map((g) => option(g, g, t.group || "Sonstiges"))
          .join(""),
        'data-dialog-filter="group"',
      ),
    )}${field("subcategory", "Unterkategorie", select("subcategory", subOptions(t.group || "Sonstiges", t.subcategory || "Nicht zugeordnet")))}${field("customSubcategory", "Eigene Unterkategorie (optional)", input("customSubcategory", "", "text", 'maxlength="100"'), "Ersetzt die Auswahl, wenn ausgefüllt.", true)}${field(
      "transferOverride",
      "Behandlung in Auswertungen",
      select(
        "transferOverride",
        [
          ["auto", "Automatisch erkennen"],
          ["include", "Als Einnahme / Ausgabe zählen"],
          ["transfer", "Als interne Umbuchung ausschließen"],
        ]
          .map(([v, l]) => option(v, l, t.transferOverride || "auto"))
          .join(""),
      ),
      "Interne Umbuchungen verändern dein Gesamtvermögen nicht.",
      true,
    )}${field("description", "Verwendungszweck / Notiz", `<textarea class="input" id="f-description" name="description" maxlength="2000" rows="3" data-sensitive>${e(t.description || "")}</textarea>`, "", true)}${t.id ? `<div class="field full"><label class="checkbox"><input type="checkbox" name="applySimilar"><span>Kategorie auch für ähnliche Buchungen dieses Zahlungspartners auf demselben Konto und mit gleicher Zahlungsrichtung übernehmen.</span></label></div>` : ""}<div class="form-error" data-form-error hidden></div></div>${t.referenceIban || t.counterpartyIban ? `<details class="mt"><summary class="details-summary">Gespeicherte Kontokennungen anzeigen</summary><dl class="detail-list">${t.referenceIban ? `<div class="full"><dt>Eigenes Konto · Originalimport</dt><dd class="identifier">${c.privacy ? "Ausgeblendet" : e(t.referenceIban)}</dd></div>` : ""}${t.counterpartyIban ? `<div class="full"><dt>Gegenkonto</dt><dd class="identifier">${c.privacy ? "Ausgeblendet" : e(t.counterpartyIban)}</dd></div>` : ""}</dl></details>` : ""}</div>${footer("Buchung speichern", t.id ? '<button type="button" class="button small" style="margin-right:auto" data-action="recurring-from-transaction" data-id="' + t.id + '">' + icon("contract", 14) + " Als regelmäßig anlegen</button>" : "")}</form>`,
  );
}
export function loanDialog(c, loan = {}) {
  const l = {
      annualRate: 0,
      balanceDate: today(),
      nextDueDate: addMonths(today(), 1, 1),
      ...loan,
    },
    bank = BANKS.find((b) => b.id === l.bankLogoId);
  const possible = c.recurring.filter(
    (x) =>
      x.direction === "expense" &&
      x.subcategory === "Kreditrate" &&
      x.status === "active",
  );
  return frame(
    loan.id ? "Kredit bearbeiten" : "Kredit ohne Bankanbindung anlegen",
    "MANUELLER KREDIT",
    `<form data-form="loan" data-id="${e(loan.id || "")}"><div class="modal-body"><div class="notice">${icon("contract", 17)}<p>Du gibst den letzten bestätigten Stand vor. FinanzFlips berechnet die weitere Tilgung als Modell. Berechnete Raten erzeugen keine Buchungen.</p></div><div class="form-grid"><div class="form-label">BANK & BEZEICHNUNG</div><details class="field full bank-picker-details" ${l.bankLogoId ? "" : "open"}><summary class="details-summary"><span id="bank-picker-summary">${bank ? e(bank.name) : "Banklogo auswählen"}</span> · ${BANKS.length} Banken ${icon("down", 14)}</summary><label for="bank-logo-search" class="sr-only">Banklogo suchen</label><label class="search" style="display:block">${icon("search", 17)}<input class="input" id="bank-logo-search" placeholder="Zum Beispiel Santander oder DSL …" data-dialog-filter="bank-logo-search" autocomplete="off"></label><input type="hidden" name="bankLogoId" value="${e(l.bankLogoId || "")}"><div class="help" id="bank-logo-selected">${bank ? "Ausgewählt: " + e(bank.name) : "Optional: Wähle das Logo deiner Bank. Das stellt keine Live-Verbindung her."}</div><div class="logo-picker mt-sm" id="bank-logo-options">${BANKS.map((b) => `<button type="button" class="logo-choice ${b.id === l.bankLogoId ? "selected" : ""}" data-action="select-bank-logo" data-id="${b.id}" data-bank-name="${e(b.name.toLocaleLowerCase("de-DE"))}" aria-label="${e(b.name)} auswählen" aria-pressed="${b.id === l.bankLogoId}"><span class="bank-icon">${b.logo ? `<img src="${e(b.logo)}" alt="" loading="lazy">` : icon("bank", 19)}</span><span>${e(b.name)}</span></button>`).join("")}</div></details>${field("name", "Kreditname", input("name", l.name, "text", 'required maxlength="140" placeholder="Zum Beispiel DSL Immobilienkredit" data-sensitive'), "", true)}${field("bankName", "Bank / Kreditgeber", input("bankName", l.bankName || bank?.name, "text", 'maxlength="140" placeholder="Auch ein eigener Anbietername ist möglich"'), "", true)}<div class="form-label">RESTSCHULD & ZINSEN</div>${field("balance", "Bestätigte Restschuld", input("balance", l.balance ?? "", "number", 'min="0" max="1000000000" step="0.01" required data-sensitive'))}${field("balanceDate", "Restschuld gilt zum", input("balanceDate", l.balanceDate, "date", "required"))}${field("annualRate", "Sollzins pro Jahr (%)", input("annualRate", l.annualRate ?? "", "number", 'min="0" max="100" step="0.001" required data-sensitive'), "Nominaler Sollzins, nicht der effektive Jahreszins.")}${field("originalAmount", "Ursprüngliche Kreditsumme (optional)", input("originalAmount", l.originalAmount ?? "", "number", 'min="0" max="1000000000" step="0.01" data-sensitive'))}<div class="form-label">RATE & LAUFZEIT</div>${field(
      "mode",
      "Was möchtest du vorgeben?",
      select(
        "mode",
        [
          ["rate", "Monatliche Rate ist bekannt"],
          ["term", "Gewünschte Restlaufzeit"],
          ["enddate", "Gewünschtes Schlussdatum"],
        ]
          .map(([v, l]) => option(v, l, "rate"))
          .join(""),
        'data-dialog-filter="loan-mode"',
      ),
      "",
      true,
    )}<div class="field" data-loan-mode="rate"><label for="f-monthlyPayment">Monatliche Rate (€)</label>${input("monthlyPayment", l.monthlyPayment ?? "", "number", 'min="0.01" step="0.01" data-sensitive')}</div><div class="field hidden" data-loan-mode="term"><label for="f-termMonths">Gewünschte Restlaufzeit (Monate)</label>${input("termMonths", l.termMonths || "", "number", 'min="1" max="1200" step="1"')}</div><div class="field hidden" data-loan-mode="enddate"><label for="f-targetEndDate">Gewünschtes Schlussdatum</label>${input("targetEndDate", l.targetEndDate || "", "date")}</div>${field("nextDueDate", "Erste Rate nach dem Restschuldstand", input("nextDueDate", l.nextDueDate, "date", "required"), "Muss nach dem Datum der Restschuld liegen.")}${field("accountId", "Von welchem Konto geht die Rate ab?", select("accountId", accounts(c, l.accountId)), "", true)}${field("linkRecurringId", "Kreditrate im Fixkostenplan", select("linkRecurringId", option("", "Neue Rate automatisch im Plan anlegen", l.linkRecurringId) + possible.map((x) => option(x.id, (c.privacy ? "Erkannte Kreditrate" : x.name) + " · " + x.subcategory, l.linkRecurringId)).join("")), "Wähle eine bereits erkannte Rate, damit sie nicht doppelt geplant wird.", true)}<div class="field full"><label class="checkbox"><input type="checkbox" name="archived" ${l.archived ? "checked" : ""}><span>Kredit archivieren: im Verlauf behalten, aus dem aktuellen Nettovermögen und dem laufenden Fixkostenplan herausnehmen.</span></label></div>${field("notes", "Notizen / Kreditnummer", `<textarea class="input" name="notes" id="f-notes" maxlength="2000" rows="3" data-sensitive>${e(l.notes || "")}</textarea>`, "", true)}<div class="form-preview field full" id="loan-preview">Ergänze Restschuld, Sollzins und Rate für eine Vorschau.</div><div class="form-error" data-form-error hidden></div></div></div>${footer(loan.id ? "Kredit speichern" : "Kredit anlegen")}</form>`,
    true,
  );
}
export function extraPaymentDialog(c, l) {
  return frame(
    "Sondertilgung erfassen",
    "KREDITPLAN",
    `<form data-form="extra-payment" data-id="${l.id}"><div class="modal-body"><div class="form-grid">${field("amount", "Sondertilgung (€)", input("amount", "", "number", 'required min="0.01" max="1000000000" step="0.01" data-sensitive'))}${field("date", "Zahlungsdatum", input("date", today(), "date", "required"))}${field("note", "Notiz", input("note", "", "text", 'maxlength="250"'), "", true)}<div class="field full"><p class="muted text-small">Die Sondertilgung wird mit der nächsten regulären Rate im Modell verrechnet. Sie erzeugt keine Bankbuchung. Bei einem späteren Restschuldabgleich muss sie nicht erneut berücksichtigt werden.</p></div><div class="form-error" data-form-error hidden></div></div></div>${footer("Zum Plan hinzufügen")}</form>`,
  );
}
export function budgetDialog(c, b = {}) {
  const value = b.group || b.name || "Lebensmittel & Alltag";
  return frame(
    b.id ? "Budget bearbeiten" : "Monatsbudget anlegen",
    "KATEGORIEBUDGET",
    `<form data-form="budget" data-id="${e(b.id || "")}"><div class="modal-body"><div class="form-grid">${field(
      "group",
      "Kategorie",
      select(
        "group",
        Object.keys(GROUPS)
          .filter((g) => !["Einnahmen", "Umbuchungen"].includes(g))
          .map((g) => option(g, g, value))
          .join(""),
      ),
      "",
      true,
    )}${field("limit", "Monatslimit (€)", input("limit", b.limit || "", "number", 'min="0" step="0.01" required data-sensitive'), "Startet jeden Kalendermonat neu. 0 bedeutet kein Limit.", true)}<div class="form-error" data-form-error hidden></div></div></div>${footer("Budget speichern", b.id ? `<button type="button" class="button danger small" style="margin-right:auto" data-action="remove-budget" data-id="${b.id}">Entfernen</button>` : "")}</form>`,
  );
}
export function importDialog(c, preview) {
  return frame(
    "Buchungsimport prüfen",
    "EXCEL & CSV",
    `<form data-form="import-confirm"><div class="modal-body"><div class="notice">${icon("file", 16)}<p>${e(preview.filename)} · ${preview.rows.length.toLocaleString("de-DE")} gültige Buchungen. ${preview.errors.length ? preview.errors.length + " fehlerhafte Zeilen werden übersprungen (Zeilen " + preview.errors.slice(0, 10).join(", ") + ")." : "Alle Zeilen konnten gelesen werden."}</p></div><div class="field"><label for="f-accountId">Konto für nicht zugeordnete Zeilen</label>${select("accountId", accounts(c, preview.defaultAccountId, false))}<div class="help">Bereits anhand von IBAN oder Kontoname erkannte Konten werden beibehalten. Duplikate werden beim Import abgeglichen.</div></div><div class="table-wrap mt"><table class="tx-table" style="min-width:450px"><thead><tr><th>Datum</th><th>Zahlungspartner</th><th>Kategorie</th><th>Betrag</th></tr></thead><tbody>${preview.rows
      .slice(0, 8)
      .map(
        (t) =>
          `<tr><td>${shortDate(t.bookingDate)}</td><td>${merchantName(c, t.merchant)}</td><td>${e(t.category)}</td><td>${money(t.amount, c.privacy)}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table></div><div class="form-error mt" data-form-error hidden></div></div>${footer("Buchungen importieren")}</form>`,
    true,
  );
}
export function restoreDialog(c, preview) {
  return frame(
    "Sicherung wiederherstellen",
    "DATEN WIEDERHERSTELLEN",
    `<form data-form="restore-confirm"><div class="modal-body"><div class="notice warn">${icon("alert", 17)}<p>Die Sicherung ersetzt deinen aktuellen Datenstand. Vorher wird eine vollständige lokale Serversicherung angelegt. Lade bei Bedarf zusätzlich deine aktuelle Sicherung herunter.</p></div><dl class="detail-list"><div><dt>Datei</dt><dd>${e(preview.filename)}</dd></div><div><dt>Buchungen</dt><dd>${preview.state.extraTransactions.length + preview.state.transactions.length}</dd></div><div><dt>Konten</dt><dd>${preview.state.accounts.length}</dd></div><div><dt>Kredite</dt><dd>${preview.state.loans.length}</dd></div></dl><div class="form-error mt" data-form-error hidden></div></div>${footer("Sicherung wiederherstellen", `<button type="button" class="button small" style="margin-right:auto" data-action="export-backup">Aktuellen Stand sichern</button>`)}</form>`,
  );
}
export function confirmDialog(title, description, action, id) {
  return frame(
    title,
    "ÄNDERUNG BESTÄTIGEN",
    `<div class="modal-body"><p class="muted">${e(description)}</p></div><div class="modal-foot"><button class="button" data-action="close-modal">Abbrechen</button><button class="button danger" data-action="${action}" data-id="${e(id)}">Bestätigen</button></div>`,
  );
}
