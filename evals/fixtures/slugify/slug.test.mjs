import assert from "node:assert/strict";
import test from "node:test";

import { slugify } from "./slug.mjs";

test("trims and collapses separators", () => {
  assert.equal(slugify("  Hei   Verden  "), "hei-verden");
  assert.equal(slugify("Hei___Verden---igjen"), "hei-verden-igjen");
});

test("transliterates common Norwegian letters", () => {
  assert.equal(slugify("Blåbær og Økonomi"), "blabaer-og-okonomi");
});

test("removes punctuation and handles invalid input", () => {
  assert.equal(slugify("Dette, er bra!"), "dette-er-bra");
  assert.equal(slugify(null), "");
});
