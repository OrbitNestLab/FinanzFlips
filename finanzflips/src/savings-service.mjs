import crypto from "node:crypto";
import {
  DEFAULT_SAVINGS,
  berlinMonth,
  nextSavingsRun,
  savingsSlot,
  calculateSavingsAmount,
  validIngIban,
  cleanIban,
  savingsError,
  epcPayload,
} from "./savings-core.mjs";
const OPEN = new Set(["fetching", "calculated", "prepared", "awaiting_bank"]);
export class SavingsService {
  constructor({
    read,
    write,
    fetchBalance,
    sourceAccounts,
    notify = async () => ({ sent: 0 }),
    now = () => new Date(),
  }) {
    Object.assign(this, {
      read,
      write,
      fetchBalance,
      sourceAccounts,
      notify,
      now,
    });
    this.flight = null;
    const d = this.data();
    let changed = false;
    for (const op of d.operations)
      if (op.status === "fetching") {
        op.status = "error";
        op.error =
          "Abruf durch Neustart unterbrochen. Es wurde keine Zahlung ausgelöst.";
        changed = true;
      }
    if (changed) this.write(d);
  }
  data() {
    const d = this.read();
    return {
      settings: { ...DEFAULT_SAVINGS, ...d.settings },
      operations: d.operations || [],
      jobs: d.jobs || {},
      requests: d.requests || {},
      settingsVersion: d.settingsVersion || 0,
    };
  }
  status() {
    const d = this.data();
    return {
      ...d,
      busy: !!this.flight,
      requests: undefined,
      jobs: undefined,
      sourceAccounts: this.sourceAccounts(),
      nextRun: nextSavingsRun(this.now(), d.settings),
      ready:
        !!d.settings.sourceId &&
        validIngIban(d.settings.targetIban) &&
        !!d.settings.recipient,
    };
  }
  stamp(op, status) {
    op.status = status;
    op.updatedAt = this.now().toISOString();
    op.events.push({ status, at: op.updatedAt });
  }
  settings(input) {
    if (this.flight)
      throw savingsError("Bitte den laufenden Abruf abwarten.", 409);
    const d = this.data(),
      old = d.settings;
    const s = {
      ...old,
      sourceId: String(input.sourceId || ""),
      recipient: String(input.recipient || "").trim(),
      targetIban: cleanIban(input.targetIban),
      targetName: String(input.targetName || "ING Extra-Konto")
        .trim()
        .slice(0, 70),
      day: Number(input.day || 10),
      time: String(input.time || "15:00"),
      pushEnabled: input.pushEnabled !== false,
    };
    if (input.enabled !== undefined && input.enabled !== old.enabled)
      throw savingsError(
        "Die Automatik wird separat ausdrücklich freigegeben.",
      );
    if (!this.sourceAccounts().some((a) => a.id === s.sourceId))
      throw savingsError(
        "Bitte ein eindeutig verbundenes ING-Girokonto wählen.",
      );
    if (
      !validIngIban(s.targetIban) ||
      s.targetIban ===
        cleanIban(this.sourceAccounts().find((a) => a.id === s.sourceId).iban)
    )
      throw savingsError("Ziel muss eine andere, gültige ING-IBAN sein.");
    if (
      !s.recipient ||
      [...s.recipient].length > 70 ||
      /[\r\n\x00-\x1f]/.test(s.recipient)
    )
      throw savingsError("Kontoinhaber prüfen.");
    if (
      !Number.isInteger(s.day) ||
      s.day < 1 ||
      s.day > 28 ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)
    )
      throw savingsError("Tag (1–28) und Uhrzeit prüfen.");
    if (
      s.targetIban !== old.targetIban ||
      s.recipient !== old.recipient ||
      s.sourceId !== old.sourceId
    ) {
      if (input.confirmTarget !== true)
        throw savingsError(
          "Bitte Quellkonto, Ziel-IBAN und Kontoinhaber ausdrücklich bestätigen.",
        );
      if (d.operations.some((o) => OPEN.has(o.status) && o.amountCents > 0))
        throw savingsError(
          "Vor einem Kontowechsel den offenen Sparvorgang abschließen oder bewusst abbrechen.",
          409,
        );
    }
    d.settings = s;
    d.settingsVersion++;
    this.write(d);
    return this.status();
  }
  activate(input) {
    const d = this.data();
    if (input.confirm !== true)
      throw savingsError("Ausdrückliche Freigabe fehlt.");
    if (
      input.enabled &&
      (!d.settings.sourceId || !validIngIban(d.settings.targetIban))
    )
      throw savingsError("Zuerst die Konten einrichten.");
    if (input.enabled && input.acceptHostRequirement !== true)
      throw savingsError(
        "Bitte bestätigen, dass der Dienst dauerhaft laufen muss.",
      );
    d.settings.enabled = !!input.enabled;
    this.write(d);
    return this.status();
  }
  run({
    trigger = "manual",
    requestId,
    confirmNew = false,
    previousId,
    slot,
  } = {}) {
    if (this.flight) return this.flight;
    this.flight = this.execute({
      trigger,
      requestId,
      confirmNew,
      previousId,
      slot,
    }).finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  async execute({ trigger, requestId, confirmNew, previousId, slot }) {
    let d = this.data();
    if (!d.settings.sourceId || !d.settings.targetIban)
      throw savingsError("Bitte zuerst Quell- und Zielkonto einrichten.");
    if (trigger === "automatic" && !d.settings.enabled)
      throw savingsError("Die Automatik ist deaktiviert.");
    if (trigger === "manual" && !/^[a-zA-Z0-9-]{16,80}$/.test(requestId || ""))
      throw savingsError("Die Vorgangskennung fehlt.");
    if (requestId && d.requests[requestId])
      return d.operations.find((o) => o.id === d.requests[requestId]);
    const unresolved = d.operations.find((o) =>
      ["prepared", "awaiting_bank"].includes(o.status),
    );
    if (unresolved) return { ...unresolved, reused: true };
    const month = berlinMonth(this.now()),
      completed = d.operations.find(
        (o) => o.month === month && o.status === "confirmed",
      );
    if (completed && !(confirmNew === true && previousId === completed.id)) {
      if (trigger === "automatic") return { ...completed, reused: true };
      throw savingsError(
        "Diesen Monat wurde bereits eine Überweisung als erledigt bestätigt. Einen zusätzlichen Vorgang bitte ausdrücklich bestätigen.",
        409,
        "NEW_CONFIRMATION",
      );
    }
    let op = d.operations.find(
      (o) => o.status === "calculated" && o.amountCents > 0,
    );
    if (op && op.month !== month) return { ...op, reused: true };
    if (!op) {
      op = {
        id: crypto.randomUUID(),
        month,
        trigger,
        slot,
        createdAt: this.now().toISOString(),
        status: "planned",
        events: [],
      };
      d.operations.unshift(op);
    }
    const source = this.sourceAccounts().find(
      (a) => a.id === d.settings.sourceId,
    );
    if (!source)
      throw savingsError("Das Quellkonto ist nicht mehr eindeutig verbunden.");
    Object.assign(op, {
      sourceId: source.id,
      sourceIban: source.iban,
      recipient: d.settings.recipient,
      targetIban: d.settings.targetIban,
      targetName: d.settings.targetName,
      bufferCents: d.settings.bufferCents,
      settingsVersion: d.settingsVersion,
      purpose: `Finanzflips Sparen ${month.slice(5)}/${month.slice(0, 4)}`,
      amountCents: null,
      error: null,
      quote: crypto.randomUUID(),
    });
    if (requestId) d.requests[requestId] = op.id;
    this.stamp(op, "fetching");
    this.write(d);
    try {
      const snapshot = await this.fetchBalance(op.sourceId);
      d = this.data();
      op = d.operations.find((o) => o.id === op.id);
      if (op.settingsVersion !== d.settingsVersion)
        throw savingsError("Die Kontoeinstellungen haben sich geändert.");
      Object.assign(op, snapshot, {
        amountCents: calculateSavingsAmount(
          snapshot.balanceCents,
          op.bufferCents,
        ),
      });
      this.stamp(op, "calculated");
      this.write(d);
    } catch (error) {
      d = this.data();
      op = d.operations.find((o) => o.id === op.id);
      op.error = error.status
        ? error.message
        : "Bankabruf fehlgeschlagen. Es wird kein alter Kontostand verwendet.";
      op.amountCents = null;
      this.stamp(op, "error");
      this.write(d);
      return op;
    }
    if (trigger === "automatic" && d.settings.pushEnabled) {
      const notification = await this.notify(op).catch(() => ({
        sent: 0,
        error: "Push konnte nicht gesendet werden.",
      }));
      d = this.data();
      d.operations.find((o) => o.id === op.id).notification = notification;
      this.write(d);
    }
    return op;
  }
  prepare(id, input) {
    if (this.flight) throw savingsError("Ein Kontoabruf läuft bereits.", 409);
    this.flight = this.prepareInternal(id, input).finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  async prepareInternal(id, { confirm, quote }) {
    let d = this.data(),
      op = d.operations.find((o) => o.id === id);
    if (!op || op.status !== "calculated" || !(op.amountCents > 0))
      throw savingsError("Dieser Vorgang kann nicht vorbereitet werden.", 409);
    if (confirm !== true || quote !== op.quote)
      throw savingsError(
        "Bitte den angezeigten Betrag ausdrücklich bestätigen.",
        409,
      );
    const priorAmount = op.amountCents;
    this.stamp(op, "fetching");
    this.write(d);
    let snapshot;
    try {
      snapshot = await this.fetchBalance(op.sourceId);
    } catch {
      d = this.data();
      op = d.operations.find((o) => o.id === id);
      op.error =
        "Erneuter Bankabruf fehlgeschlagen. Keine Zahlungsdaten freigegeben.";
      op.amountCents = null;
      this.stamp(op, "error");
      this.write(d);
      throw savingsError(op.error, 502);
    }
    d = this.data();
    op = d.operations.find((o) => o.id === id);
    Object.assign(op, snapshot, {
      amountCents: calculateSavingsAmount(
        snapshot.balanceCents,
        op.bufferCents,
      ),
      quote: crypto.randomUUID(),
    });
    if (op.amountCents !== priorAmount) {
      this.stamp(op, "calculated");
      this.write(d);
      return { ...op, changed: true };
    }
    epcPayload(op);
    op.preparedAt = this.now().toISOString();
    this.stamp(op, "prepared");
    this.write(d);
    return op;
  }
  payment(id) {
    const op = this.data().operations.find((o) => o.id === id);
    if (!op || !["prepared", "awaiting_bank"].includes(op.status))
      throw savingsError("Zahlungsdaten wurden noch nicht freigegeben.", 409);
    if (this.now() - new Date(op.preparedAt) > 5 * 60000)
      throw savingsError(
        "Die Zahlungsdaten sind älter als fünf Minuten. Falls noch nichts in ING freigegeben wurde: Vorgang bewusst abbrechen und neu berechnen.",
        409,
      );
    return op;
  }
  update(id, input) {
    if (this.flight)
      throw savingsError("Bitte den laufenden Abruf abwarten.", 409);
    const d = this.data(),
      op = d.operations.find((o) => o.id === id);
    if (!op) throw savingsError("Vorgang nicht gefunden.", 404);
    if (input.action === "waiting" && op.status === "prepared") {
      this.payment(id);
      this.stamp(op, "awaiting_bank");
    } else if (
      input.action === "confirm" &&
      ["prepared", "awaiting_bank"].includes(op.status) &&
      input.confirm === true
    ) {
      op.confirmation = "manual";
      op.confirmedAt = this.now().toISOString();
      this.stamp(op, "confirmed");
    } else if (
      input.action === "cancel" &&
      ["calculated", "prepared", "awaiting_bank", "error"].includes(
        op.status,
      ) &&
      input.confirm === true
    ) {
      op.cancelAcknowledged = true;
      this.stamp(op, "cancelled");
    } else
      throw savingsError(
        "Statusänderung nicht zulässig oder Bestätigung fehlt.",
        409,
      );
    this.write(d);
    return op;
  }
  async tick() {
    if (this.flight) return;
    let d = this.data();
    if (!d.settings.enabled) return;
    const due = savingsSlot(this.now(), d.settings);
    if (!due) return;
    const slot = due.slice(0, 7);
    const job = d.jobs[slot] || { attempts: 0 };
    if (
      job.done ||
      job.attempts >= 3 ||
      (job.retryAt && Date.parse(job.retryAt) > this.now())
    )
      return;
    job.attempts++;
    job.at = this.now().toISOString();
    job.retryAt = new Date(
      +this.now() + [5, 30, 60][job.attempts - 1] * 60000,
    ).toISOString();
    d.jobs[slot] = job;
    this.write(d);
    let result;
    try {
      result = await this.run({ trigger: "automatic", slot });
    } catch {
      result = { status: "error" };
    }
    d = this.data();
    d.jobs[slot].done = result.status !== "error";
    d.jobs[slot].operationId = result.id || null;
    this.write(d);
  }
}
