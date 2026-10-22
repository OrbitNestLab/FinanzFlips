import test from "node:test";
import assert from "node:assert/strict";
import { migrateState } from "../model.mjs";
import {
  reviewCandidates,
  validReviewChanges,
  reviewFingerprint,
  scrubReviewText,
} from "../agent.mjs";
const fixture = () =>
  migrateState({
    accounts: [{ name: "Giro", iban: "DE111", balance: 0 }],
    extraTransactions: [
      {
        merchant: "Streamingdienst",
        amount: -20,
        date: "2026-10-01",
        account: "Giro",
        category: "Sonstige Ausgaben",
      },
      {
        merchant: "Arbeitgeber",
        amount: 2500,
        date: "2026-10-01",
        account: "Giro",
        category: "Lohn / Gehalt",
      },
    ],
  });
test("review never touches manual edits, internal transfers or already checked rows", () => {
  const s = fixture();
  s.extraTransactions[0].editedAt = "2026-10-01";
  s.extraTransactions[1].aiCheckedFingerprint = reviewFingerprint(
    s.extraTransactions[1],
  );
  assert.equal(reviewCandidates(s).length, 0);
});
test("only unchanged offered rows and highly confident valid categories may change", () => {
  const s = fixture(),
    c = structuredClone(reviewCandidates(s)),
    t = c.find((x) => x.amount < 0),
    v = {
      id: t.id,
      group: "Abos & Digitales",
      subcategory: "Streaming",
      confidence: 0.98,
      reason: "Streaminganbieter",
    };
  assert.equal(validReviewChanges(s, c, [v, v]).length, 1);
  assert.equal(validReviewChanges(s, c, [{ ...v, id: "invented" }]).length, 0);
  assert.equal(validReviewChanges(s, c, [{ ...v, confidence: 0.7 }]).length, 0);
  assert.equal(
    validReviewChanges(s, c, [{ ...v, subcategory: "invented" }]).length,
    0,
  );
  assert.equal(
    validReviewChanges(s, c, [
      { ...v, group: "Einnahmen", subcategory: "Gehalt" },
    ]).length,
    0,
  );
  s.extraTransactions.find((x) => x.id === t.id).amount = -21;
  assert.equal(validReviewChanges(s, c, [v]).length, 0);
});
test("review strips account identifiers and email addresses from provider labels", () => {
  assert.ok(
    !scrubReviewText("Konto DE89370400440532013000").includes("DE8937"),
  );
  assert.ok(!scrubReviewText("name@example.com").includes("@"));
});
