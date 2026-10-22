import { escape as e, icon, option, badge, dateLabel } from "./ui.mjs";
import { bankSearch } from "./bank-sync.mjs";
const stamp = (v) =>
  v
    ? new Date(v).toLocaleString("de-DE", {
        timeZone: "Europe/Berlin",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Noch kein Abruf";
export function bankPageView(c) {
  const b = c.bankStatus || {},
    checks = b.checks || {},
    report = b.lastResult,
    matches = bankSearch(c.banks || [], c.bankQuery || "");
  const duplicates = [
    ...c.state.extraTransactions,
    ...c.state.transactions,
  ].filter((t) => t.bankDuplicateOf).length;
  return `<div class="page-heading"><div><div class="eyebrow">BANKEN & DATENQUELLEN</div><h1>Deine Konten. Verbunden.</h1><p>Freigaben, Aktualisierungen und fehlende Konten an einem Ort.</p></div><button class="button" data-action="bank-refresh">${icon("refresh", 15)} Status prüfen</button></div>
 <div class="bank-health-grid">${(b.sessions || []).map((s) => `<section class="card"><div class="card-header"><h2>${e(s.bank)}</h2>${badge(s.expired ? "Freigabe abgelaufen" : s.accountCount ? "Konten freigegeben" : "Keine Konten geliefert", s.expired || !s.accountCount ? "amber" : "mint")}</div><p>${s.accountCount ?? "–"} Konten · ${e(s.country)}</p><p class="muted text-small mt-sm">${s.validUntil ? "Freigabe bis " + dateLabel(s.validUntil) : "Freigabedatum prüfen"}</p>${!s.accountCount ? '<div class="notice warn mt"><p>Der Anbieter hat eine Freigabe, aber keine Konten zurückgegeben. Im Enable-Banking-Kontrollbereich zuerst die eigenen Konten verknüpfen, danach hier erneut verbinden.</p></div>' : ""}<button class="button small mt" data-action="connect-bank" data-bank="${e(s.bank)}" data-country="${e(s.country)}">Freigabe erneuern</button></section>`).join("") || '<section class="card"><h2>Noch keine Bankfreigabe</h2><p class="muted mt">Richte den Anbieter ein und wähle deine Bank.</p></section>'}</div>
 <div class="grid-2 mt"><section class="card"><div class="card-header"><div><h2>Automatisch aktuell</h2><p>Feste Zeiten · Europe/Berlin</p></div>${icon("refresh", 18)}</div><form data-form="bank-schedule"><label for="bank-schedule">Abrufe pro Tag</label><select class="input mt-sm" name="mode" id="bank-schedule">${[
   ["twice", "2 × täglich · 08:00 und 18:00"],
   ["four", "4 × täglich · 08:00, 12:00, 16:00 und 20:00"],
   ["off", "Nur manuell"],
 ]
   .map(([v, l]) => option(v, l, b.schedule?.mode || "twice"))
   .join(
     "",
   )}</select><div class="form-error mt" data-form-error hidden></div><button class="button mt" type="submit">Abrufplan speichern</button></form><p class="text-small muted mt">Läuft im lokalen Dienst auch bei geschlossenem Browser. Der Mac muss eingeschaltet und wach sein. Nach dem Aufwachen wird der letzte verpasste Abruf nachgeholt. Banklimits und abgelaufene Freigaben werden berücksichtigt.</p></section>
 <section class="card"><div class="card-header"><div><h2>Letzter Datenabruf</h2><p>${e(stamp(b.lastAttemptAt || b.lastSyncAt))}</p></div>${badge(b.syncing || c.bankSyncBusy ? "Abruf läuft" : report?.errors?.length ? "Hinweise prüfen" : b.lastSyncAt ? "Aktualisiert" : "Ausstehend", report?.errors?.length ? "amber" : "mint")}</div>${report ? `<p>${report.accounts || 0} Konten aktualisiert · ${report.added || 0} neue Buchungen</p>` : ""}<p class="muted text-small mt">${e(c.bankSyncResult || "Kontostände und gebuchte Umsätze werden mit deinem vorhandenen Verlauf abgeglichen.")}</p>${(report?.errors || []).map((x) => `<div class="notice warn mt"><p><strong>${e(x.bank)}:</strong> ${e(x.message)}</p></div>`).join("")}<button class="button primary mt" data-action="sync-bank" ${!b.sessions?.some((s) => s.accountCount) || b.syncing || c.bankSyncBusy ? "disabled" : ""}>${icon("refresh", 15)} Jetzt aktualisieren</button>${duplicates ? `<button class="button mt" data-action="bank-duplicates">${duplicates} Dubletten-Zuordnungen prüfen</button>` : ""}</section></div>
 <section class="card mt"><div class="card-header"><div><h2>Zusätzliche Konten & Kreditkarten</h2><p>Jeder Kontotyp benötigt einen tatsächlich verfügbaren Datenzugang.</p></div></div><div class="bank-health-grid">
 <div><h3>ING Extra-Konten</h3>${badge("Separater FinTS-Zugang", "amber")}<p class="text-small muted mt">Über die aktuelle ING-Freigabe wurden nur Girokonten geliefert. ING unterstützt den lesenden Abruf der Extra-Konten über FinTS. Dafür werden eine eigene FinTS-Produktregistrierung und deine persönliche ING-Anmeldung benötigt.</p><a class="link-button mt" href="#/fints">Extra-Konten einrichten ${icon("arrow", 13)}</a></div>
 <div><h3>ING-Kreditkonto</h3>${badge("Kreditplan verwenden", "subtle")}<p class="text-small muted mt">Dieses Konto wurde von ING nicht mitgeliefert. Restschuld, Sollzins, Rate und Schlussdatum kannst du im Kreditplan abbilden und mit Auszügen abgleichen.</p><button class="button small mt" data-action="new-loan">ING-Kredit erfassen</button></div>
 <div><h3>easybank Deutschland</h3>${badge("Bei Enable Banking nicht gelistet", "amber")}<p class="text-small muted mt">Prüfung am 21.10.2026: Weder easybank Deutschland noch der frühere Name Barclays sind in der deutschen Anbieterliste enthalten. easybank Österreich gehört zu einem anderen Bankzugang.</p><button class="button small mt" data-action="import">Buchungen importieren</button><a class="link-button mt" href="https://www.easybank.de/easybank-de/psd2" target="_blank" rel="noopener noreferrer">Hinweise der Bank</a></div>
 <div><h3>Advanzia / Gebührenfrei</h3>${badge("Bei Enable Banking nicht gelistet", "amber")}<p class="text-small muted mt">Prüfung am 21.10.2026: Kein passender Zugang in Deutschland oder Luxemburg. Das vorhandene Kartenkonto bleibt nutzbar; Umsätze können per Datei und der Kontostand manuell aktualisiert werden.</p><button class="button small mt" data-action="import">Buchungen importieren</button><a href="#/accounts" class="link-button mt">Kartenkonten öffnen</a></div>
 </div></section>
 <section class="card mt"><div class="card-header"><div><h2>Weitere Bank verbinden</h2><p>Die Liste kommt direkt vom Anbieter. Du bestätigst die Freigabe bei deiner Bank.</p></div></div><div class="row gap-sm"><select class="input" data-filter="bank-country" aria-label="Land der Bank">${[
   ["DE", "Deutschland"],
   ["LU", "Luxemburg · z. B. PayPal"],
   ["AT", "Österreich"],
   ["NL", "Niederlande"],
 ]
   .map(([v, l]) => option(v, l, c.bankCountry))
   .join(
     "",
   )}</select><button class="button" data-action="load-banks" ${b.configured ? "" : "disabled"}>Verfügbarkeit prüfen</button></div><label class="search mt" style="display:block"><span class="sr-only">Bank suchen</span><input class="input" id="bank-search" data-filter="bank-search" value="${e(c.bankQuery || "")}" placeholder="Bankname eingeben …"></label><div class="bank-list">${
   matches
     .slice(0, 40)
     .map(
       (x) =>
         `<button class="bank-result" data-action="connect-bank" data-bank="${e(x.name)}" data-country="${e(x.country)}"><span class="bank-icon">${icon("bank", 18)}</span><span class="grow"><strong>${e(x.name)}</strong><small class="muted" style="display:block">${e(x.country)} · Privatkonto</small></span>${icon("chevron", 15)}</button>`,
     )
     .join("") ||
   `<p class="muted text-small">${c.banks?.length ? "Kein passender Privatkundenzugang gefunden." : "Wähle ein Land und prüfe die Verfügbarkeit."}</p>`
 }</div>${matches.length > 40 ? `<p class="muted text-small mt">${matches.length} Treffer. Bitte den Banknamen genauer eingeben. Exakte Treffer stehen zuerst.</p>` : ""}</section>
 <details class="card mt" ${b.configured ? "" : "open"}><summary>Anbietereinrichtung & technische Angaben</summary><div class="notice mt"><p>Nur Kontoinformationen. FinanzFlips löst keine Zahlungen aus. Der private Schlüssel bleibt auf deinem Mac.</p></div><a class="link-button" href="https://enablebanking.com/cp/applications" target="_blank" rel="noopener noreferrer">Enable-Banking-Kontrollbereich öffnen</a><form data-form="bank-settings" class="mt"><div class="form-grid"><div class="field full"><label for="bank-app-id">Enable-Banking-App-ID</label><input class="input" id="bank-app-id" name="appId" value="${e(b.appId || "")}" required></div><div class="field full"><label for="bank-base-url">Basisadresse für die Bank-Rückleitung</label><input class="input" id="bank-base-url" name="baseUrl" type="url" value="${e(b.baseUrl || "http://finanzflips.localhost:8787")}" required><div class="help">Rückrufadresse: Basisadresse + /callback</div></div><div class="field full"><label for="bank-key">Privater Schlüssel ${checks.privateKey ? "· bereits vorhanden" : ""}</label><input class="input" id="bank-key" name="privateKey" type="file" accept=".pem,.key,text/plain"></div><div class="form-error" data-form-error hidden></div></div><div class="row wrap mt"><button class="button" type="submit">Einrichtung speichern</button><button class="button" type="button" data-action="bank-test">Anbieter prüfen</button>${checks.publicCertificate ? '<a class="link-button" href="./api/enable/certificate" download>Öffentliches Zertifikat</a>' : ""}</div></form><p class="muted mt">${e(c.bankTestResult || "")}</p></details>`;
}
