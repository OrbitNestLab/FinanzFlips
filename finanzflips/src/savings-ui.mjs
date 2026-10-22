const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const labels = {
  planned: "Berechnung geplant",
  fetching: "Bankabruf läuft",
  calculated: "Betrag berechnet",
  prepared: "Überweisung vorbereitet",
  awaiting_bank: "Auf Bankfreigabe wartend",
  confirmed: "Von dir als erledigt bestätigt",
  cancelled: "Abgebrochen",
  error: "Fehler beim Abruf",
};
const euro = (n) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    n / 100,
  );
const date = (v) =>
  v ? new Date(v).toLocaleString("de-DE") : "Noch nicht vorhanden";
class SavingsPanel extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: "open" });
    this.busy = false;
    this.selected = new URLSearchParams(location.hash.split("?")[1] || "").get(
      "operation",
    );
    this.load();
    this.shadowRoot.addEventListener("click", (e) => this.click(e));
    this.shadowRoot.addEventListener("submit", (e) => this.save(e));
  }
  async api(endpoint, data) {
    const r = await fetch("./api/savings/" + endpoint, {
      method: data ? "POST" : "GET",
      cache: "no-store",
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
    const d = await r.json();
    if (!r.ok)
      throw Object.assign(Error(d.error || "Anfrage fehlgeschlagen."), {
        code: d.code,
      });
    return d;
  }
  async load() {
    try {
      this.data = await this.api("status");
      this.render();
    } catch (e) {
      this.error = e.message;
      this.render();
    }
  }
  amount(n) {
    return this.hasAttribute("private")
      ? "•••"
      : Number.isInteger(n)
        ? euro(n)
        : "–";
  }
  text(v) {
    return this.hasAttribute("private") ? "•••" : escape(v);
  }
  async work(fn) {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    this.note = "";
    this.render();
    try {
      await fn();
    } catch (e) {
      this.error = e.message;
    } finally {
      this.busy = false;
      await this.load();
    }
  }
  render() {
    const d = this.data,
      s = d?.settings || {},
      op =
        d?.operations.find((o) => o.id === this.selected) || d?.operations[0],
      privateMode = this.hasAttribute("private");
    this.shadowRoot.innerHTML = `<style>
 :host{display:block;color:#edf3ed;font:15px/1.55 system-ui}*{box-sizing:border-box}h1,h2,h3,p{margin:0 0 12px}h1{font-size:30px;letter-spacing:-1px}h2{font-size:20px}small,.muted{color:#9aab9f}header{margin-bottom:24px}.eyebrow{color:#a2e8b6;text-transform:uppercase;letter-spacing:2px;font-size:11px;font-weight:700}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.card{background:#17201a;border:1px solid #2c3b30;border-radius:20px;padding:24px;margin-bottom:18px}.value{font-size:30px;letter-spacing:-1px;margin:10px 0}.green{color:#a2e8b6}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}button,.button{display:inline-block;border:1px solid #425748;background:#253a2c;border-radius:12px;padding:12px 16px;color:#b5efc5;font:inherit;text-decoration:none;cursor:pointer}button.primary{background:#b6f1c7;color:#122418;font-weight:700}button:disabled{opacity:.5;cursor:wait}.notice{padding:14px 18px;border-radius:12px;background:#253429;margin:12px 0}.error{background:#482b2b;color:#ffcece}.fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}label{display:block;font-size:13px;color:#c5d5c9}input:not([type=checkbox]),select{display:block;width:100%;padding:12px;margin:5px 0;background:#101812;border:1px solid #405146;border-radius:9px;color:#edf3ed;font:inherit}input[type=checkbox]{margin-right:10px;accent-color:#a2e8b6}.check{margin:16px 0}.full{grid-column:1/-1}summary{cursor:pointer;font-weight:600}dl{display:grid;grid-template-columns:1fr 2fr;gap:10px}dt{color:#9aab9f}dd{margin:0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:12px 6px;border-bottom:1px solid #304135}.table{overflow:auto}.qr{width:min(100%,300px);border-radius:12px;margin:16px 0}a{color:#b5efc5}.status{border:1px solid #435a48;border-radius:30px;padding:4px 12px;font-size:12px}.spinner{display:inline-block;width:14px;height:14px;border:2px solid #30543b;border-top-color:#b5efc5;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:700px){.grid,.fields{grid-template-columns:1fr}.card{padding:18px}h1{font-size:26px}.value{font-size:27px}dl{grid-template-columns:1fr}dd{margin-bottom:10px}}
 </style><header><div class="eyebrow">Dein Geld. Dein Puffer.</div><h1>Automatisches Sparen</h1><p class="muted">Frisch abgerufener ING-Kontostand minus 1.000 € – den Überschuss bereitstellen und selbst bei ING freigeben.</p></header>
 ${this.error ? `<div class="notice error" role="alert">${escape(this.error)}</div>` : ""}${this.note ? `<div class="notice" role="status">${escape(this.note)}</div>` : ""}
 ${
   !d
     ? '<p role="status">Sparbereich wird geladen …</p>'
     : `
 <div class="grid"><div class="card"><small>Gebuchter ING-Kontostand</small><div class="value">${this.amount(op?.balanceCents)}</div><small>${op?.fetchedAt ? "Abgerufen " + date(op.fetchedAt) : "Jetzt frisch abrufen"}</small></div><div class="card"><small>Rechnerischer Puffer</small><div class="value">${this.amount(100000)}</div><small>Keine zusätzlichen Abzüge</small></div><div class="card"><small>Möglicher Sparbetrag</small><div class="value green">${this.amount(op?.amountCents)}</div><small>${op?.status === "error" ? "Neuer Abruf erforderlich" : labels[op?.status] || "Noch nicht berechnet"}</small></div></div>
 <section class="card"><div class="row"><h2>Deine nächste Sparüberweisung</h2><span class="status">${s.enabled ? "Automatik aktiv" : "Automatik ausgeschaltet"}</span></div><p class="muted">${s.enabled ? "Nächster Termin" : "Vorgesehener nächster Termin"}: ${escape(d.nextRun.replace("T", " um "))} · Europe/Berlin. Erster regulärer Lauf frühestens am 10.11.2026.</p><p>Ein späterer Umsatz kann deinen Kontostand verändern. Der Puffer gilt nur zum Abrufzeitpunkt. Vorgemerkte Umsätze werden nicht zusätzlich abgezogen; ein gesonderter Vormerksaldo ist nicht verlässlich verfügbar.</p>
 <button class="primary" data-do="run" ${this.busy || !d.ready ? "disabled" : ""}>${this.busy ? '<span class="spinner"></span> ING-Kontostand wird geprüft …' : "Jetzt Sparbetrag berechnen"}</button>
 ${!d.ready ? '<p class="muted">Bitte unten zuerst Quellkonto und Zielkonto prüfen und speichern.</p>' : ""}
 ${
   op
     ? `<hr><h3>${labels[op.status]}</h3>${op.error ? `<p class="error notice">${escape(op.error)}</p>` : ""}<dl><dt>Zielkonto</dt><dd>${this.text(op.targetName)} · ${this.text(op.recipient)}</dd><dt>Ziel-IBAN</dt><dd>${this.text(op.targetIban)}</dd><dt>Betrag</dt><dd>${this.amount(op.amountCents)}</dd><dt>Verwendungszweck</dt><dd>${escape(op.purpose)}</dd><dt>Bank-Saldodatum</dt><dd>${op.bankDate ? escape(op.bankDate) : "Von der Bank nicht separat angegeben"} · ${escape(op.balanceType || "–")}</dd></dl>
 ${op.status === "calculated" && op.amountCents === 0 ? '<p class="notice">Aktuell kein Betrag zum Sparen verfügbar.</p>' : ""}
 ${op.status === "calculated" && op.amountCents > 0 && !privateMode ? `<label class="check"><input type="checkbox" id="confirm-prepare">Ich habe Zielkonto, Empfänger und ${this.amount(op.amountCents)} geprüft. Zahlungsdaten vorbereiten.</label><button class="primary" data-do="prepare" ${this.busy ? "disabled" : ""}>Jetzt aufs Extra-Konto überweisen</button><p class="muted">Der Kontostand wird vorher nochmals geprüft. Die Freigabe erfolgt anschließend ausschließlich bei ING.</p>` : ""}
 ${["prepared", "awaiting_bank"].includes(op.status) && !privateMode ? `<div class="notice"><strong>In ING selbst umbuchen</strong><p>Öffne deine ING-App, wähle das oben festgelegte Girokonto und die Überweisung auf dein Extra-Konto. Prüfe dort Empfänger und Betrag vor deiner Freigabe.</p><div class="row"><button data-do="copy-amount">Betrag kopieren</button><button data-do="copy-iban">IBAN kopieren</button><button data-do="copy-purpose">Zweck kopieren</button></div><p class="muted">Keine automatische App-Übergabe: Ein offizieller passender ING-Link ist nicht bestätigt.</p></div><details><summary>GiroCode als Alternative</summary><p>Der Code wird hier lokal erstellt. Der Import aus der Fotogalerie und die Annahme für das eigene Extra-Konto müssen noch in deiner iPhone-App geprüft werden.</p><button data-do="qr">GiroCode anzeigen</button>${this.qr === op.id ? `<br><img class="qr" alt="SEPA-Zahlungsdaten als GiroCode" src="./api/savings/qr/${encodeURIComponent(op.id)}"><div class="row"><a class="button" download="Finanzflips-GiroCode.png" href="./api/savings/qr/${encodeURIComponent(op.id)}">Bild speichern</a><button data-do="share">Bild teilen</button></div>` : ""}</details><div class="row" style="margin-top:16px"><button data-do="waiting">Auf meine ING-Freigabe wartend</button><button data-do="confirm">In ING erledigt – manuell bestätigen</button></div><p class="muted">Finanzflips erhält keine Zahlungsbestätigung von ING. „Erledigt“ dokumentiert deine eigene Bestätigung.</p>` : ""}
 ${["calculated", "prepared", "awaiting_bank", "error"].includes(op.status) ? '<button data-do="cancel" style="margin-top:12px">Vorgang abbrechen</button>' : ""}
 ${op.notification?.error ? `<div class="notice error">${escape(op.notification.error)}</div>` : ""}`
     : ""
 }
 </section>
 <details class="card" ${!d.ready ? "open" : ""}><summary>Konten & Zeitplan einrichten</summary>${privateMode ? "<p>Zum Bearbeiten den Privatmodus ausschalten.</p>" : `<form><div class="fields"><label>Quellkonto (ING Giro)<select name="sourceId" required><option value="">Bitte ausdrücklich wählen</option>${d.sourceAccounts.map((a) => `<option value="${escape(a.id)}" ${a.id === s.sourceId ? "selected" : ""}>${escape(a.name)} · …${escape(a.iban.slice(-4))}</option>`).join("")}</select></label><label>Zielkontoname<input name="targetName" value="${escape(s.targetName || "Notfallkonto")}" required maxlength="70"></label><label>Kontoinhaber<input name="recipient" value="${escape(s.recipient)}" required maxlength="70"></label><label>Ziel-IBAN (ING Extra)<input name="targetIban" value="${escape(s.targetIban)}" required autocomplete="off" spellcheck="false"></label><label>Tag im Monat<input name="day" type="number" min="1" max="28" value="${s.day}"></label><label>Uhrzeit in Berlin<input name="time" type="time" value="${s.time}" required></label></div><label class="check"><input name="pushEnabled" type="checkbox" ${s.pushEnabled ? "checked" : ""}>Bei automatischer Berechnung benachrichtigen</label><label class="check"><input name="confirmTarget" type="checkbox" required>Quellkonto, Ziel-IBAN und Kontoinhaber stimmen. Die IBAN gehört zu meinem ING Extra-Konto.</label><button type="submit" ${this.busy ? "disabled" : ""}>Einstellungen speichern</button></form>`}<hr><p>Die Automatik berechnet und benachrichtigt. Sie führt keine Zahlung aus. Der Server muss zum Termin laufen; nach einem Neustart wird ein fälliger Lauf des aktuellen Monats nachgeholt.</p><button data-do="toggle" ${!d.ready || this.busy ? "disabled" : ""}>${s.enabled ? "Automatik ausschalten" : "Automatik ausdrücklich einschalten"}</button><p class="muted">${d.push.ha ? (d.push.configured ? "Benachrichtigungen über deine Home-Assistant-App." : "Bitte in der HA-App-Konfiguration das iPhone auswählen.") : "Web-Push benötigt HTTPS und auf dem iPhone eine zum Home-Bildschirm hinzugefügte App."}</p>${!d.push.ha ? '<button data-do="push">Dieses Gerät für Push anmelden</button>' : ""}</details>
 <section class="card"><h2>Bisherige Sparvorgänge</h2><p class="muted">Letzte bestätigte Überweisung: ${date(d.operations.find((o) => o.status === "confirmed")?.confirmedAt)}</p><div class="table"><table><thead><tr><th>Datum</th><th>Betrag</th><th>Status</th><th></th></tr></thead><tbody>${
   d.operations
     .slice(0, 30)
     .map(
       (o) =>
         `<tr><td>${date(o.createdAt)}</td><td>${this.amount(o.amountCents)}</td><td>${labels[o.status]}</td><td><button data-id="${o.id}" data-do="select">Ansehen</button></td></tr>`,
     )
     .join("") || '<tr><td colspan="4">Noch keine Sparvorgänge.</td></tr>'
 }</tbody></table></div></section>`
 }`;
  }
  async save(event) {
    event.preventDefault();
    event.stopPropagation();
    const values = Object.fromEntries(new FormData(event.target));
    values.confirmTarget = !!values.confirmTarget;
    values.pushEnabled = !!values.pushEnabled;
    await this.work(async () => {
      await this.api("settings", values);
      this.note =
        "Konten und Zeitplan gespeichert. Der Aktivierungsstatus bleibt unverändert.";
    });
  }
  async click(event) {
    const b = event.target.closest("[data-do]");
    if (!b) return;
    event.stopPropagation();
    const action = b.dataset.do,
      d = this.data,
      op = d.operations.find((o) => o.id === this.selected) || d.operations[0];
    if (action === "select") {
      this.selected = b.dataset.id;
      this.qr = null;
      this.render();
      return;
    }
    if (
      action === "prepare" &&
      !this.shadowRoot.querySelector("#confirm-prepare")?.checked
    ) {
      this.error = "Bitte zuerst die angezeigten Zahlungsdaten bestätigen.";
      this.render();
      return;
    }
    if (
      action === "confirm" &&
      !confirm(
        "Hast du diese Überweisung in ING tatsächlich freigegeben? Finanzflips speichert nur deine manuelle Bestätigung.",
      )
    )
      return;
    if (
      action === "cancel" &&
      !confirm(
        "Nur abbrechen, wenn du diese Zahlung NICHT in ING freigegeben hast. Das bricht keine bereits ausgeführte Banküberweisung ab. Bestätigst du das?",
      )
    )
      return;
    if (
      action === "toggle" &&
      !confirm(
        d.settings.enabled
          ? "Sparautomatik ausschalten?"
          : "Monatliche Berechnung und Push aktivieren? Der Server muss laufen. Eine Überweisung benötigt immer deine ING-Freigabe.",
      )
    )
      return;
    await this.work(async () => {
      if (action === "run") {
        try {
          const result = await this.api("run", {
            requestId: crypto.randomUUID(),
          });
          this.selected = result.id;
        } catch (e) {
          if (e.code !== "NEW_CONFIRMATION") throw e;
          if (
            confirm(
              "Diesen Monat wurde bereits eine Überweisung bestätigt. Möchtest du ausdrücklich eine zusätzliche neue Sparüberweisung berechnen?",
            )
          ) {
            const previous = d.operations.find((o) => o.status === "confirmed");
            const result = await this.api("run", {
              requestId: crypto.randomUUID(),
              confirmNew: true,
              previousId: previous.id,
            });
            this.selected = result.id;
          }
        }
      }
      if (action === "prepare") {
        const r = await this.api("prepare", {
          id: op.id,
          quote: op.quote,
          confirm: true,
        });
        if (r.changed)
          this.note =
            "Der Bankbetrag hat sich geändert. Bitte prüfe und bestätige den neuen Betrag.";
      }
      if (["waiting", "confirm", "cancel"].includes(action))
        await this.api("status", { id: op.id, action, confirm: true });
      if (action === "toggle")
        await this.api("activate", {
          enabled: !d.settings.enabled,
          confirm: true,
          acceptHostRequirement: true,
        });
      if (action.startsWith("copy-")) {
        const p = await this.api("payment", { id: op.id });
        const val =
          action === "copy-amount"
            ? (p.amountCents / 100).toFixed(2).replace(".", ",")
            : action === "copy-iban"
              ? p.targetIban
              : p.purpose;
        try {
          await navigator.clipboard.writeText(val);
          this.note = "Kopiert.";
        } catch {
          prompt("Zum Kopieren gedrückt halten:", val);
        }
      }
      if (action === "qr") {
        await this.api("payment", { id: op.id });
        this.qr = op.id;
      }
      if (action === "share") {
        const r = await fetch("./api/savings/qr/" + encodeURIComponent(op.id), {
          cache: "no-store",
        });
        if (!r.ok) throw Error((await r.json()).error);
        const file = new File([await r.blob()], "Finanzflips-GiroCode.png", {
          type: "image/png",
        });
        if (!navigator.canShare?.({ files: [file] }))
          throw Error(
            "Teilen wird hier nicht unterstützt. Bitte „Bild speichern“ verwenden.",
          );
        await navigator.share({ files: [file], title: "Finanzflips GiroCode" });
      }
      if (action === "push") {
        if (!("PushManager" in window) || !window.isSecureContext)
          throw Error(
            "Push benötigt eine sichere Verbindung und auf iOS die Home-Bildschirm-App.",
          );
        if ((await Notification.requestPermission()) !== "granted")
          throw Error("Benachrichtigungen wurden nicht erlaubt.");
        const r = await navigator.serviceWorker.ready;
        const { publicKey } = await this.api("push-key");
        const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
        const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        const subscription =
          (await r.pushManager.getSubscription()) ||
          (await r.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          }));
        await this.api("push-subscribe", {
          subscription: subscription.toJSON(),
        });
        this.note = "Dieses Gerät ist für Push angemeldet.";
      }
    });
  }
}
customElements.define("savings-panel", SavingsPanel);
