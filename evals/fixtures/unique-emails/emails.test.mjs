import assert from "node:assert/strict";
import test from "node:test";

import { uniqueEmails } from "./emails.mjs";

test("normalizes, validates, and preserves first-seen order", () => {
  assert.deepEqual(
    uniqueEmails([" Lars@Example.com ", "lars@example.com", "bad", "IDA@example.com"]),
    ["lars@example.com", "ida@example.com"]
  );
});

test("handles non-arrays and ignores non-strings", () => {
  assert.deepEqual(uniqueEmails(null), []);
  assert.deepEqual(uniqueEmails([42, "a@b.no", undefined]), ["a@b.no"]);
});

test("does not mutate input", () => {
  const values = Object.freeze([" A@B.no ", "a@b.no"]);
  assert.deepEqual(uniqueEmails(values), ["a@b.no"]);
});
