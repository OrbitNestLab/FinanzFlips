// Pure money, bank identity and scheduling rules shared by manual and timed runs.
export const FIRST_SAVINGS_DATE = "2026-11-10";
export const DEFAULT_SAVINGS = {
  enabled: false,
  sourceId: "",
  recipient: "",
  targetIban: "",
  targetName: "ING Extra-Konto",
  bufferCents: 100000,
  day: 10,
  time: "15:00",
  timeZone: "Europe/Berlin",
  pushEnabled: true,
};
export function savingsError(message, status = 400, code = "INVALID") {
  return Object.assign(new Error(message), { status, code });
}
export function cents(value) {
  if (typeof value !== "string" || !/^-?\d{1,10}(?:\.\d{1,2})?$/.test(value))
    throw savingsError(
      "Ungültiger Bankbetrag. Erwartet wird ein genauer Eurobetrag.",
    );
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const n = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (n > 99999999999n)
    throw savingsError("Der Betrag überschreitet den unterstützten Bereich.");
  return Number(value.startsWith("-") ? -n : n);
}
export function decimal(n) {
  if (!Number.isSafeInteger(n)) throw savingsError("Ungültiger Centbetrag.");
  return `${n < 0 ? "-" : ""}${Math.floor(Math.abs(n) / 100)}.${String(Math.abs(n) % 100).padStart(2, "0")}`;
}
export function calculateSavingsAmount(balance, buffer = 100000) {
  if (
    !Number.isSafeInteger(balance) ||
    !Number.isSafeInteger(buffer) ||
    buffer < 0
  )
    throw savingsError("Ungültige Berechnungswerte.");
  return Math.max(0, balance - buffer);
}
export function cleanIban(value) {
  return String(value || "")
    .replace(/\s/g, "")
    .toUpperCase();
}
export function validIngIban(value) {
  const iban = cleanIban(value);
  if (!/^DE\d{20}$/.test(iban) || iban.slice(4, 12) !== "50010517")
    return false;
  let rest = 0;
  for (const c of (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55),
  ))
    rest = (rest * 10 + Number(c)) % 97;
  return rest === 1;
}
export function berlinParts(date = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
}
export function berlinMonth(date = new Date()) {
  const p = berlinParts(date);
  return `${p.year}-${p.month}`;
}
export function savingsSlot(date, settings) {
  const p = berlinParts(date),
    day = String(settings.day).padStart(2, "0"),
    now = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`,
    slot = `${p.year}-${p.month}-${day}T${settings.time}`;
  return slot.slice(0, 10) >= FIRST_SAVINGS_DATE && now >= slot ? slot : null;
}
export function nextSavingsRun(date, settings) {
  const p = berlinParts(date);
  let month = Number(p.month),
    year = Number(p.year);
  let slot = `${year}-${String(month).padStart(2, "0")}-${String(settings.day).padStart(2, "0")}T${settings.time}`;
  const now = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  while (slot <= now || slot.slice(0, 10) < FIRST_SAVINGS_DATE) {
    if (++month > 12) {
      month = 1;
      year++;
    }
    slot = `${year}-${String(month).padStart(2, "0")}-${String(settings.day).padStart(2, "0")}T${settings.time}`;
  }
  return slot;
}
export function bookedSnapshot(
  response,
  { requestedAt, receivedAt, now = Date.now() },
) {
  if (
    !Number.isFinite(Date.parse(requestedAt)) ||
    !Number.isFinite(Date.parse(receivedAt)) ||
    now - Date.parse(receivedAt) > 60000 ||
    Date.parse(receivedAt) > now + 1000 ||
    Date.parse(receivedAt) < Date.parse(requestedAt)
  )
    throw savingsError(
      "Der Bankabruf ist nicht aktuell. Bitte erneut abrufen.",
    );
  const balances = response?.balances || [];
  const chosen =
    balances.find((b) => b.balance_type === "ITBD") ||
    balances.find((b) => b.balance_type === "CLBD");
  if (!chosen || chosen.balance_amount?.currency !== "EUR")
    throw savingsError(
      "Kein gebuchter EUR-Saldo geliefert. Ein verfügbarer Betrag inklusive Dispo wird nicht verwendet.",
    );
  const referenceDate =
    chosen.reference_date || chosen.last_change_date_time || null;
  if (
    referenceDate &&
    (!Number.isFinite(Date.parse(referenceDate)) ||
      now - Date.parse(referenceDate) > 7 * 86400000 ||
      Date.parse(referenceDate) > now + 86400000)
  )
    throw savingsError(
      "Der von der Bank datierte Saldo ist veraltet oder ungültig.",
    );
  // Expected closing balance is not a pending-transactions total.
  const pending = null;
  return {
    balanceCents: cents(chosen.balance_amount.amount),
    balanceType: chosen.balance_type,
    bankDate: referenceDate,
    fetchedAt: receivedAt,
    pendingCents:
      pending?.balance_amount?.currency === "EUR"
        ? cents(pending.balance_amount.amount)
        : null,
    pendingKnown: !!pending,
  };
}
export function epcPayload({ recipient, targetIban, amountCents, purpose }) {
  if (!validIngIban(targetIban))
    throw savingsError("Bitte eine gültige ING-Ziel-IBAN prüfen.");
  if (
    !recipient?.trim() ||
    [...recipient].length > 70 ||
    /[\r\n\x00-\x1f]/.test(recipient) ||
    !purpose ||
    [...purpose].length > 140 ||
    /[\r\n\x00-\x1f]/.test(purpose)
  )
    throw savingsError("Empfänger oder Verwendungszweck ist ungültig.");
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1 ||
    amountCents > 99999999999
  )
    throw savingsError("Kein gültiger positiver Sparbetrag.");
  const payload = [
    "BCD",
    "002",
    "1",
    "SCT",
    "",
    recipient.trim(),
    cleanIban(targetIban),
    "EUR" + decimal(amountCents),
    "",
    "",
    purpose,
  ].join("\n");
  if (new TextEncoder().encode(payload).length > 331)
    throw savingsError("Die Zahlungsdaten sind zu lang für einen GiroCode.");
  return payload;
}
