import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stateMajor, assertStateWritable, isProtocolCompatible,
  IncompatibleStateError, STATE_SCHEMA_VERSION, PROTOCOL_VERSION,
} from "../src/model/version.js";
import { migrateConfig } from "../src/state/migrateConfig.js";

test("stateMajor defaults to 1 for empty/legacy state", () => {
  assert.equal(stateMajor(undefined), 1);
  assert.equal(stateMajor({}), 1);
  assert.equal(stateMajor({ version: 3 }), 3);
});

test("assertStateWritable allows current/older, throws on newer major", () => {
  assert.equal(assertStateWritable({ version: STATE_SCHEMA_VERSION }), STATE_SCHEMA_VERSION);
  assert.throws(() => assertStateWritable({ version: STATE_SCHEMA_VERSION + 1 }), IncompatibleStateError);
});

test("isProtocolCompatible matches major and tolerates unknown", () => {
  assert.equal(isProtocolCompatible(PROTOCOL_VERSION), true);
  assert.equal(isProtocolCompatible(PROTOCOL_VERSION + 1), false);
  assert.equal(isProtocolCompatible(undefined), true); // legacy agent: don't block
});

test("migrateConfig is a no-op at the current version and stamps schemaVersion", () => {
  const out = migrateConfig({ a: 1 }, 1, {});
  assert.equal(out.schemaVersion, 1);
  assert.equal(out.a, 1);
});

test("migrateConfig applies ordered steps", () => {
  const migs = { 2: (c) => ({ ...c, b: 1 }), 3: (c) => ({ ...c, d: 2 }) };
  const out = migrateConfig({ schemaVersion: 1, a: 0 }, 3, migs);
  assert.deepEqual(out, { schemaVersion: 3, a: 0, b: 1, d: 2 });
});
