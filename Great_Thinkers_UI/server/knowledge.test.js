import { test } from "node:test";
import assert from "node:assert/strict";
import { packs, sourceFor, identityService } from "./knowledge.js";
import { openStore } from "./store.js";
import { evidenceFor } from "./research.js";

test("primary editions exclude front matter and retain locators, attribution and complete body tails", () => {
  for (const pack of packs) {
    const source = sourceFor(pack.id);
    assert.ok(source.passages.length > 100);
    assert.equal(
      new Set(source.passages.map((p) => p.id)).size,
      source.passages.length,
    );
    assert.ok(source.passages.every((p) => p.locator && p.text.length <= 1200));
    assert.doesNotMatch(
      source.text,
      /FULL PROJECT GUTENBERG|CONTENTS|INTRODUCTION|APPENDIX/,
    );
    assert.equal(source.sha256.length, 64);
  }
  assert.match(
    sourceFor(packs[2].id).text,
    /WORKING MEN OF ALL COUNTRIES, UNITE!/,
  );
  assert.match(packs[2].content, /Friedrich Engels/);
  const evidence = evidenceFor(
    { sources: [sourceFor(packs[1].id)] },
    "labor property possessions",
  );
  assert.match(evidence[0].text, /CHAPTER\./);
  assert.equal(evidence[0].passageIds.length, 3);
  assert.equal(evidence[0].passages, undefined);
});

test("reviewed revisions preserve old identities, detect stale reviews, and retain participant pins", () => {
  const store = openStore(":memory:");
  try {
    store.put("people", {
      id: "a",
      name: "John Locke",
      content: "ORIGINAL PROFILE",
      sources: [],
    });
    const service = identityService(store);
    const old = service.person("a");
    const room = service.pin({ peopleIds: ["a"], messages: [] });
    const revised = service.accept("a", packs[1].id, old.identityVersion);
    assert.notEqual(revised.identityVersion, old.identityVersion);
    assert.equal(
      service.person("a", room.identityPins.a).content,
      "ORIGINAL PROFILE",
    );
    assert.equal(service.person("a", room.identityPins.a).sources.length, 0);
    assert.equal(service.person("a").sources[0].primary, true);
    room.peopleIds = [];
    service.pin(room);
    room.peopleIds = ["a"];
    service.pin(room);
    assert.equal(room.identityPins.a, old.identityVersion);
    assert.throws(
      () => service.accept("a", packs[1].id, old.identityVersion),
      /changed/,
    );
    assert.throws(() => service.person("a", "missing"), /missing/);
    assert.equal(store.all("identityReviews").length, 1);
    assert.equal(store.all("identityVersions").length, 2);
  } finally {
    store.close();
  }
});
