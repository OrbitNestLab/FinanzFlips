import test from "node:test";
import assert from "node:assert/strict";
import { browserUUID } from "../browser-crypto.mjs";

test("uses native randomUUID when available", () => {
  assert.equal(
    browserUUID({ randomUUID: () => "native-id" }),
    "native-id",
  );
});

test("creates a valid UUID v4 for older WebKit", () => {
  const cryptoSource = {
    getRandomValues(bytes) {
      bytes.set(Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    },
  };
  const id = browserUUID(cryptoSource);
  assert.match(
    id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(id, "00010203-0405-4607-8809-0a0b0c0d0e0f");
});
