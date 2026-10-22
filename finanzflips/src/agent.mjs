import { GROUPS, allTransactions, isTransfer, hash, norm } from "./model.mjs";
export const reviewFingerprint = (t) =>
  hash(
    [t.id, t.merchant, t.bookingDate, t.amount, t.group, t.subcategory].join(
      "|",
    ),
  );
export function reviewCandidates(state, limit = 40) {
  return allTransactions(state)
    .filter(
      (t) =>
        !t.editedAt &&
        !t.splitExcluded &&
        !isTransfer(t, state) &&
        t.aiCheckedFingerprint !== reviewFingerprint(t) &&
        !(state.categoryRules || []).some(
          (r) => r.accountId === t.accountId && r.merchant === norm(t.merchant),
        ),
    )
    .toSorted(
      (a, b) =>
        Number(b.group === "Sonstiges") - Number(a.group === "Sonstiges") ||
        b.bookingDate.localeCompare(a.bookingDate),
    )
    .slice(0, limit);
}
export function validReviewChanges(state, candidates, suggestions) {
  const current = new Map(allTransactions(state).map((t) => [t.id, t]));
  const offered = new Map(candidates.map((t) => [t.id, t]));
  const seen = new Set();
  const result = [];
  for (const s of (Array.isArray(suggestions) ? suggestions : []).slice(
    0,
    12,
  )) {
    const t = current.get(s.id),
      before = offered.get(s.id);
    if (
      !t ||
      !before ||
      seen.has(t.id) ||
      t.editedAt ||
      t.splitExcluded ||
      isTransfer(t, state) ||
      reviewFingerprint(t) !== reviewFingerprint(before)
    )
      continue;
    if (
      !Number.isFinite(s.confidence) ||
      s.confidence < 0.95 ||
      s.confidence > 1 ||
      !GROUPS[s.group]?.sub.includes(s.subcategory) ||
      s.group === "Umbuchungen"
    )
      continue;
    if (t.amount < 0 && s.group === "Einnahmen") continue;
    if (t.amount > 0 && s.group !== "Einnahmen") continue;
    if (t.group === s.group && t.subcategory === s.subcategory) continue;
    seen.add(t.id);
    result.push({
      id: t.id,
      group: s.group,
      subcategory: s.subcategory,
      reason: String(s.reason || "").slice(0, 240),
    });
  }
  return result;
}
export const scrubReviewText = (value) =>
  String(value || "")
    .replace(/\b[A-Z]{2}\s?\d{2}(?:[\sA-Z0-9]){10,32}\b/g, "[Kontokennung]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[E-Mail]")
    .slice(0, 160);
