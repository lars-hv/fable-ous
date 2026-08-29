import assert from "node:assert/strict";
import test from "node:test";

import { totalPaid } from "./invoices.mjs";

test("totals only paid invoices with finite non-negative amounts", () => {
  assert.equal(totalPaid([
    { status: "paid", amount: 10.1 },
    { status: "draft", amount: 99 },
    { status: "paid", amount: Number.NaN },
    { status: "paid", amount: -5 },
    { status: "paid", amount: 2.2 }
  ]), 12.3);
});

test("returns zero for missing or unusable input", () => {
  assert.equal(totalPaid(), 0);
  assert.equal(totalPaid("paid"), 0);
  assert.equal(totalPaid([{ status: "paid", amount: Infinity }]), 0);
});

test("does not mutate invoices", () => {
  const invoices = Object.freeze([Object.freeze({ status: "paid", amount: 4 })]);
  assert.equal(totalPaid(invoices), 4);
});
