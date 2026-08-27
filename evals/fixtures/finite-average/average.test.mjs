import assert from "node:assert/strict";
import test from "node:test";

import { average } from "./average.mjs";

test("averages finite numbers", () => {
  assert.equal(average([2, 4, 6]), 4);
});

test("ignores non-finite and non-number values", () => {
  assert.equal(average([2, Infinity, "4", Number.NaN, 6]), 4);
});

test("returns null when no finite numbers remain", () => {
  assert.equal(average([]), null);
  assert.equal(average([Infinity, Number.NaN]), null);
  assert.equal(average("2,4"), null);
});

test("does not mutate the input", () => {
  const values = Object.freeze([2, Infinity, 6]);
  assert.equal(average(values), 4);
});
