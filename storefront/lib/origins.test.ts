import assert from "node:assert/strict";
import test from "node:test";
import { cookieDomainFor, isTrustedOrigin, safeReturnTo } from "./origins";

const SELF = "https://northwind.mlynn.dev";
const HOME = `${SELF}/`;

test("returnTo keeps allowlisted and same-origin destinations", () => {
  assert.equal(safeReturnTo("https://triage.mlynn.dev/tutor?x=1", SELF), "https://triage.mlynn.dev/tutor?x=1");
  assert.equal(safeReturnTo("/support", SELF), `${SELF}/support`);
  assert.equal(safeReturnTo("http://localhost:3001/tutor", SELF), "http://localhost:3001/tutor");
  const preview = "https://storefront-abc.vercel.app";
  assert.equal(safeReturnTo(`${preview}/support`, preview), `${preview}/support`);
});

test("returnTo refuses everything that only looks allowlisted", () => {
  for (const hostile of [
    "https://evil.com/",
    "//evil.com/path",
    "https://triage.mlynn.dev.evil.com/",
    "https://triage.mlynn.dev@evil.com/",
    "https://evil.com/?https://triage.mlynn.dev",
    "javascript:alert(1)",
    "data:text/html,hi",
    "http://triage.mlynn.dev/",
    "https://localhost:3001/",
  ]) {
    assert.equal(safeReturnTo(hostile, SELF), HOME, hostile);
  }
  assert.equal(safeReturnTo(null, SELF), HOME);
});

test("trusted origins are exact matches", () => {
  assert.ok(isTrustedOrigin("https://triage.mlynn.dev", SELF));
  assert.ok(isTrustedOrigin(SELF, SELF));
  assert.ok(!isTrustedOrigin("https://triage.mlynn.dev/", SELF));
  assert.ok(!isTrustedOrigin(null, SELF));
  assert.ok(!isTrustedOrigin("null", SELF));
});

test("the cookie is shared across mlynn.dev and host-only elsewhere", () => {
  assert.equal(cookieDomainFor("northwind.mlynn.dev"), ".mlynn.dev");
  assert.equal(cookieDomainFor("northwind.mlynn.dev:443"), ".mlynn.dev");
  assert.equal(cookieDomainFor("localhost:3002"), undefined);
  assert.equal(cookieDomainFor("storefront-abc.vercel.app"), undefined);
  assert.equal(cookieDomainFor("evilmlynn.dev"), undefined);
  assert.equal(cookieDomainFor(null), undefined);
});
