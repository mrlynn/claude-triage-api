import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { canSeal, looksLikeApiKey, pkceChallenge, redactSecrets, safeEqual, seal, unseal } from "./secrets";

const KEY = "sk-ant-api03-" + "a".repeat(40);

function withMaster<T>(current: string | undefined, previous: string | undefined, fn: () => T): T {
  const saved = [process.env.BYOK_ENCRYPTION_KEY, process.env.BYOK_ENCRYPTION_KEY_PREVIOUS];
  const set = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  set("BYOK_ENCRYPTION_KEY", current);
  set("BYOK_ENCRYPTION_KEY_PREVIOUS", previous);
  try {
    return fn();
  } finally {
    set("BYOK_ENCRYPTION_KEY", saved[0]);
    set("BYOK_ENCRYPTION_KEY_PREVIOUS", saved[1]);
  }
}

const master = () => randomBytes(32).toString("base64");

test("a sealed key opens in the session it was sealed to", () => {
  withMaster(master(), undefined, () => {
    const sealed = seal(KEY, "session-a");
    assert.ok(!sealed.ct.includes("sk-ant"));
    assert.equal(unseal(sealed, "session-a"), KEY);
  });
});

test("a sealed key does not open in any other session", () => {
  withMaster(master(), undefined, () => {
    assert.equal(unseal(seal(KEY, "session-a"), "session-b"), null);
  });
});

test("a single flipped byte is a refusal, not a garbled key", () => {
  withMaster(master(), undefined, () => {
    const sealed = seal(KEY, "s");
    const ct = Buffer.from(sealed.ct, "base64");
    ct[0] = ct[0]! ^ 1;
    assert.equal(unseal({ ...sealed, ct: ct.toString("base64") }, "s"), null);
    const tag = Buffer.from(sealed.tag, "base64");
    tag[0] = tag[0]! ^ 1;
    assert.equal(unseal({ ...sealed, tag: tag.toString("base64") }, "s"), null);
  });
});

test("rotation: the previous master still opens old keys, and an unknown one opens nothing", () => {
  const oldMaster = master();
  const sealed = withMaster(oldMaster, undefined, () => seal(KEY, "s"));
  withMaster(master(), oldMaster, () => assert.equal(unseal(sealed, "s"), KEY));
  withMaster(master(), undefined, () => assert.equal(unseal(sealed, "s"), null));
});

test("no master key means nothing can be sealed, and a malformed one is loud", () => {
  withMaster(undefined, undefined, () => {
    assert.equal(canSeal(), false);
    assert.throws(() => seal(KEY, "s"));
  });
  withMaster(Buffer.from("too short").toString("base64"), undefined, () => {
    assert.throws(() => canSeal(), /32 bytes/);
  });
});

test("redactSecrets removes keys from strings, objects and errors", () => {
  assert.equal(redactSecrets(`bad key ${KEY} here`), "bad key sk-ant-… here");
  assert.ok(!redactSecrets({ headers: { "x-api-key": KEY } }).includes(KEY));
  const error = new Error(`401 for ${KEY}`);
  assert.ok(!redactSecrets(error).includes(KEY));
  assert.ok(redactSecrets(error).includes("401 for sk-ant-…"));
});

test("looksLikeApiKey accepts the shape and rejects everything else", () => {
  assert.ok(looksLikeApiKey(KEY));
  assert.ok(!looksLikeApiKey("sk-ant-short"));
  assert.ok(!looksLikeApiKey(`${KEY} `));
  assert.ok(!looksLikeApiKey("sk-proj-" + "a".repeat(40)));
  assert.ok(!looksLikeApiKey(`sk-ant-${"a".repeat(30)}<script>`));
});

test("PKCE challenge is the RFC 7636 S256 transform", () => {
  // Appendix B of RFC 7636.
  assert.equal(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("safeEqual compares whole strings", () => {
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(!safeEqual("abc", "abd"));
  assert.ok(!safeEqual("abc", "abcd"));
});
