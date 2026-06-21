import { test } from "node:test";
import assert from "node:assert/strict";
import { hostMatchesAny, makeUrlFilter, parseDomainList } from "../src/model/filters.js";
import { runSyncCycle } from "../src/sync/engine.js";
import { createMemoryAdapter } from "../src/transport/memoryAdapter.js";
import { makeId } from "../src/model/records.js";

test("hostMatchesAny matches domain and subdomains only", () => {
  assert.equal(hostMatchesAny("https://bank.example/login", ["bank.example"]), true);
  assert.equal(hostMatchesAny("https://secure.bank.example/x", ["bank.example"]), true);
  assert.equal(hostMatchesAny("https://notbank.example/x", ["bank.example"]), false);
  assert.equal(hostMatchesAny("https://example.com", []), false);
});

test("makeUrlFilter keeps non-excluded urls", () => {
  const f = makeUrlFilter({ excludeDomains: ["bank.example"] });
  assert.equal(f("https://bank.example/a"), false);
  assert.equal(f("https://ok.example/a"), true);
});

test("parseDomainList splits on whitespace/commas", () => {
  assert.deepEqual(parseDomainList("a.com, b.com\n c.com"), ["a.com", "b.com", "c.com"]);
});

test("excluded baseline items are not tombstoned or imported", async () => {
  const excluded = "https://bank.example/acct";
  const id = await makeId("bookmark", { url: excluded, parentPath: ["bar"] });
  const record = {
    id, type: "bookmark", deviceId: "B", lamport: 1, updatedAt: 1, deleted: false,
    payload: { url: excluded, title: "Bank", parentPath: ["bar"], index: 0 },
  };
  const t = createMemoryAdapter({ version: 1, records: { [id]: record }, updatedAt: 1 });

  let applied = 0;
  const keep = (rec) => rec.payload.url !== excluded; // exclude the bank url
  await runSyncCycle({
    transport: t,
    collect: async () => [],                  // excluded url isn't collected
    apply: async (recs) => { applied += recs.length; },
    store: {
      getDeviceId: async () => "A", getLamport: async () => 1, setLamport: async () => {},
      getBaseline: async () => ({ [id]: record }), setBaseline: async () => {},
    },
    type: "bookmark",
    keep,
  });

  assert.equal(applied, 0); // not imported locally
  const live = Object.values(t.snapshot().records).filter((r) => !r.deleted);
  assert.equal(live.length, 1); // NOT tombstoned — still present in shared state
});
