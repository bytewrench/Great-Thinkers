import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { openStore } from "./store.js";
import { createApp } from "./app.js";
import { evidenceFor, searchPeople, researchPage } from "./research.js";
import { parseBrief } from "./brief.js";
import { parseAssessment } from "./discussion.js";
import { buildReply, wantsDetailedAnswer } from "./conversation.js";
import { packs } from "./knowledge.js";
import { prepareSource } from "./dataset.js";

test("deleting one saved idea preserves other ideas and the original chat and permits saving again", async (t) => {
  const f = await fixture(t);
  const r = await (await f.call("/rooms", "POST", { peopleIds: ["a"] })).json();
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "An idea to save",
    })
  ).text();
  const original = f.store.get("rooms", r.id);
  const body = { roomId: r.id, messageId: original.messages.at(-1).id };
  const saved = await (await f.call("/insights", "POST", body)).json();
  f.store.put("insights", {
    ...saved,
    id: "another-idea",
    messageId: "another-message",
  });
  assert.equal((await f.call(`/insights/${saved.id}`, "DELETE")).status, 200);
  assert.equal(f.store.get("insights", saved.id), null);
  assert.deepEqual(f.store.get("rooms", r.id), original);
  assert.deepEqual(
    (await (await f.call("/state")).json()).insights.map((i) => i.id),
    ["another-idea"],
  );
  assert.equal((await f.call(`/insights/${saved.id}`, "DELETE")).status, 404);
  const resaved = await (await f.call("/insights", "POST", body)).json();
  assert.notEqual(resaved.id, saved.id);
  assert.equal(resaved.content, saved.content);
});

test("web datasets quarantine sources and drafts, preserve old chats, and export without private data", async (t) => {
  const f = await fixture(t);
  const p = await (await f.call("/research", "POST", { pageId: 5 })).json();
  const oldRoom = await (
    await f.call("/rooms", "POST", { peopleIds: [p.id] })
  ).json();
  const text =
    "A source excerpt describing this person's documented work and historical interests. ".repeat(
      4,
    );
  const body = {
    title: "Collected writings",
    text,
    attribution: "Author, public edition",
    sourceType: "primary",
    url: "https://example.org/book",
  };
  assert.equal(
    (
      await f.call(`/people/${p.id}/sources`, "POST", {
        ...body,
        url: "javascript:alert(1)",
      })
    ).status,
    400,
  );
  const withSource = await (
    await f.call(`/people/${p.id}/sources`, "POST", body)
  ).json();
  const source = withSource.datasetSources[0];
  assert.equal(source.text, undefined);
  assert.ok(!withSource.sources.some((s) => s.id === source.id));
  assert.equal(
    (await f.call(`/people/${p.id}/sources`, "POST", body)).status,
    409,
  );
  assert.equal((await f.call(`/people/a/sources/${source.id}`)).status, 404);
  const drafted = await (
    await f.call(`/people/${p.id}/profile-draft`, "POST", {
      sourceIds: ["wiki-5", source.id],
      scope: "Documented life",
    })
  ).json();
  assert.ok(drafted.profileDraft?.grounded.length);
  assert.equal(drafted.identityVersion, p.identityVersion);
  const accepted = await (
    await f.call(`/people/${p.id}/profile-review`, "POST", {
      draftId: drafted.profileDraft.id,
      decision: "accept",
      scope: drafted.profileDraft.scope,
      content: drafted.profileDraft.content,
    })
  ).json();
  assert.notEqual(accepted.identityVersion, p.identityVersion);
  assert.ok(accepted.sources.some((s) => s.id === source.id));
  assert.equal(accepted.profileDraft, undefined);
  await (
    await f.call(`/rooms/${oldRoom.id}/messages`, "POST", {
      content: "Who are you?",
    })
  ).text();
  assert.equal(
    f.store.get("rooms", oldRoom.id).messages.at(-1).identities[0].version,
    p.identityVersion,
  );
  assert.ok(
    !f.store
      .get("rooms", oldRoom.id)
      .messages.at(-1)
      .sources.some((s) => s.id === source.id),
  );
  await f.call(`/people/${p.id}`, "PATCH", { notes: "PRIVATE_NOTE_TOKEN" });
  const exported = await (await f.call(`/people/${p.id}/dataset`)).json();
  assert.equal(exported.format, "great-thinkers-dataset");
  assert.equal(exported.datasetSources[0].text, text.trim());
  assert.equal(exported.identityVersions.length, 2);
  assert.doesNotMatch(
    JSON.stringify(exported),
    /PRIVATE_NOTE_TOKEN|Who are you/,
  );
  assert.equal(
    (
      await f.call(`/people/${p.id}/profile-review`, "POST", {
        draftId: drafted.profileDraft.id,
        decision: "accept",
      })
    ).status,
    409,
  );
});

test("dataset source input has bounded text and immutable provenance", () => {
  const body = {
    title: "Text",
    text: "x".repeat(100),
    attribution: "Author, 1600",
    sourceType: "secondary",
  };
  assert.equal(prepareSource(body, "a").sha256.length, 64);
  assert.throws(() => prepareSource({ ...body, text: "short" }, "a"), /100/);
  assert.throws(
    () => prepareSource({ ...body, text: "x".repeat(200001) }, "a"),
    /200/,
  );
  assert.throws(
    () =>
      prepareSource({ ...body, url: "https://secret:pass@example.org" }, "a"),
    /credentials/,
  );
});

test("edition review changes new chats only and research cannot remove the pinned primary work", async (t) => {
  const f = await fixture(t);
  f.store.put("people", { ...f.store.get("people", "a"), name: "John Locke" });
  const oldRoom = await (
    await f.call("/rooms", "POST", { peopleIds: ["a"] })
  ).json();
  await f.call(`/rooms/${oldRoom.id}`, "DELETE");
  const body = {
    decision: "accept",
    packId: packs[1].id,
    baseVersion: oldRoom.identityPins.a,
  };
  const accepted = await (
    await f.call("/people/a/identity-review", "POST", body)
  ).json();
  assert.ok(accepted.identityPeriod);
  assert.equal(accepted.sources[0].text, undefined);
  assert.equal(accepted.sources[0].passages, undefined);
  assert.equal(
    (await f.call("/people/a/identity-review", "POST", body)).status,
    409,
  );
  await f.call(`/rooms/${oldRoom.id}/restore`, "POST", {});
  await (
    await f.call(`/rooms/${oldRoom.id}/messages`, "POST", {
      content: "What is property?",
    })
  ).text();
  assert.equal(
    f.store.get("rooms", oldRoom.id).messages.at(-1).identities[0].version,
    oldRoom.identityPins.a,
  );
  assert.doesNotMatch(
    f.requests.at(-1).messages[0].content,
    /Second Treatise edition/,
  );
  const research = await (
    await f.call("/research", "POST", { personId: "a", pageId: 5 })
  ).json();
  await f.call("/people/a/research-review", "POST", {
    proposalId: research.pendingResearch.id,
    decision: "accept",
  });
  await f.call("/people/a", "PATCH", { favorite: true });
  assert.ok(f.store.get("people", "a").sources.every((s) => !s.primary));
  const newRoom = await (
    await f.call("/rooms", "POST", { peopleIds: ["a"] })
  ).json();
  await (
    await f.call(`/rooms/${newRoom.id}/messages`, "POST", {
      content: "What is property?",
    })
  ).text();
  const answer = f.store.get("rooms", newRoom.id).messages.at(-1);
  assert.equal(answer.identities[0].version, accepted.identityVersion);
  assert.ok(answer.sources.some((s) => s.primary && s.passageIds.length));
  assert.match(
    f.requests.at(-1).messages[0].content,
    /Second Treatise edition/,
  );
});

const person = (id) => ({
  id,
  name: `Thinker ${id}`,
  content: "A thoughtful person. Simulated monologues are fiction.",
  biography: "A biography.",
  notes: "",
  sources: [],
  favorite: false,
});
async function fixture(t) {
  const store = openStore(":memory:");
  ["a", "b", "c", "d"].forEach((id) => store.put("people", person(id)));
  const requests = [];
  let mode = "ok";
  const ollama = createServer(async (req, res) => {
    if (req.url === "/api/tags") {
      res.end(
        JSON.stringify({
          models: [
            {
              name: "llama3.1:8b",
              size: 4700000000,
              digest:
                mode === "changed" ? "different-version" : "fixture-version",
            },
          ],
        }),
      );
      return;
    }
    let body = "";
    for await (const c of req) body += c;
    requests.push(JSON.parse(body));
    if (req.url === "/api/show") {
      requests.pop();
      res.end(
        JSON.stringify(
          mode === "cloud"
            ? { remote_host: "https://ollama.com" }
            : { model_info: { "general.architecture": "llama" } },
        ),
      );
      return;
    }
    if (
      JSON.parse(body).format === "json" &&
      JSON.parse(body).messages[0].content.includes("Create a research brief")
    ) {
      res.end(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              grounded: [
                {
                  claim: "A documented biography",
                  sourceId: "wiki-5",
                  quote: "A documented life.",
                },
              ],
              context: [
                { topic: "Further ideas", summary: "UNVERIFIED_BRIEF_CONTEXT" },
              ],
              questions: ["Which original writings support this?"],
            }),
          },
        }),
      );
      return;
    }
    if (JSON.parse(body).format === "json") {
      if (mode === "wait-assessment") return;
      const transcript = JSON.parse(JSON.parse(body).messages.at(-1).content);
      const evidence = [
        ...new Map(transcript.map((m) => [m.personId, m])).values(),
      ].map((m) => ({ messageId: m.id, quote: m.text.slice(0, 30) }));
      res.end(
        JSON.stringify({
          message: {
            content:
              mode === "bad-assessment"
                ? "not JSON"
                : JSON.stringify({
                    state: "conflict",
                    reason: "Contrasting priorities remain.",
                    evidence,
                  }),
          },
        }),
      );
      return;
    }
    if (mode === "fail") {
      res.writeHead(404);
      res.end("{}");
      return;
    }
    res.setHeader("Content-Type", "application/x-ndjson");
    const line =
      JSON.stringify({ message: { content: "A café perspective. " } }) + "\n";
    const bytes = Buffer.from(line);
    const accent = bytes.indexOf(Buffer.from("é"));
    res.write(bytes.subarray(0, accent + 1));
    res.write(bytes.subarray(accent + 1));
    if (mode === "wait") return;
    res.end(
      JSON.stringify({
        message: { content: "Consider another angle." },
        done: true,
      }),
    );
  }).listen(0, "127.0.0.1");
  await once(ollama, "listening");
  const app = createApp({
    store,
    ollamaUrl: `http://127.0.0.1:${ollama.address().port}`,
    wikiRequest: async () => ({
      query: {
        pages: [
          {
            pageid: 5,
            title: "New Mind",
            extract: "A documented life.\n\nImportant work.",
            pageprops: { wikibase_item: "Q1" },
            lastrevid: 123,
          },
        ],
      },
    }),
    verifyHuman: async () => new Set(["Q1"]),
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
    ollama.closeAllConnections();
    ollama.close();
    store.close();
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = (path, method = "GET", body, headers = {}) =>
    fetch(url + "/api" + path, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return {
    store,
    requests,
    mode: (m) => {
      mode = m;
    },
    call,
  };
}

test("roundtable streams Unicode, persists ordered speakers, and shares earlier replies", async (t) => {
  const f = await fixture(t);
  const r = await (
    await f.call("/rooms", "POST", { peopleIds: ["a", "b"] })
  ).json();
  await f.call(`/rooms/${r.id}`, "PATCH", {
    responseMode: "individual",
    voice: "plain",
  });
  const response = await f.call(`/rooms/${r.id}/messages`, "POST", {
    content: "What is wisdom?",
  });
  const events = (await response.text()).trim().split("\n").map(JSON.parse);
  assert.equal(events.at(-1).type, "done");
  const saved = f.store.get("rooms", r.id);
  assert.deepEqual(
    saved.messages.map((m) => m.name || m.role),
    ["user", "Thinker a", "Thinker b"],
  );
  assert.ok(
    saved.messages
      .slice(1)
      .every((m) => m.status === "complete" && m.content.includes("café")),
  );
  assert.match(
    f.requests[1].messages.map((m) => m.content).join("\n"),
    /Thinker a, said:\]\nA café perspective/,
  );
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "Just your view.",
      target: "b",
    })
  ).text();
  assert.equal(f.requests.length, 3);
  assert.equal(f.store.get("rooms", r.id).messages.at(-1).personId, "b");
});

test("offline/model errors can be retried without duplicating the visitor message", async (t) => {
  const f = await fixture(t);
  f.mode("fail");
  const r = await (await f.call("/rooms", "POST", { peopleIds: ["a"] })).json();
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", { content: "Hello" })
  ).text();
  assert.equal(f.store.get("rooms", r.id).messages.at(-1).status, "error");
  f.mode("ok");
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", { retry: true })
  ).text();
  const messages = f.store.get("rooms", r.id).messages;
  assert.equal(messages.length, 2);
  assert.equal(messages[1].status, "complete");
});

test("stop preserves partial output and blocks conflicting conversation edits", async (t) => {
  const f = await fixture(t);
  f.mode("wait");
  const r = await (
    await f.call("/rooms", "POST", { peopleIds: ["a", "b"] })
  ).json();
  const stream = await f.call(`/rooms/${r.id}/messages`, "POST", {
    content: "Hello",
  });
  const reader = stream.body.getReader();
  let seen = "";
  while (!seen.includes("token")) {
    const { value } = await reader.read();
    seen += new TextDecoder().decode(value);
  }
  assert.equal((await f.call(`/rooms/${r.id}`, "DELETE")).status, 409);
  assert.equal(
    (await f.call(`/rooms/${r.id}/messages`, "POST", { content: "Concurrent" }))
      .status,
    409,
  );
  await f.call(`/rooms/${r.id}/stop`, "POST", {});
  while (!(await reader.read()).done) {
    /* Drain the interrupted stream. */
  }
  const messages = f.store.get("rooms", r.id).messages;
  assert.equal(messages.length, 2);
  assert.equal(messages[1].status, "interrupted");
  assert.match(messages[1].content, /café/);
  f.mode("ok");
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", { retry: true })
  ).text();
  assert.equal(f.store.get("rooms", r.id).messages.at(-1).status, "complete");
});

test("API validates membership, input limits, and untrusted origins", async (t) => {
  const f = await fixture(t);
  for (const ids of [[], ["a", "a"], ["a", "b", "c", "d"], ["missing"]])
    assert.equal(
      (await f.call("/rooms", "POST", { peopleIds: ids })).status,
      400,
    );
  assert.equal(
    (
      await f.call(
        "/rooms",
        "POST",
        { peopleIds: ["a"] },
        { Origin: "https://untrusted.example" },
      )
    ).status,
    403,
  );
  const r = await (await f.call("/rooms", "POST", { peopleIds: ["a"] })).json();
  assert.equal(
    (
      await f.call(`/rooms/${r.id}/messages`, "POST", {
        content: "x".repeat(4001),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(`/rooms/${r.id}/messages`, "POST", {
        content: "Hi",
        target: "b",
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.call(`/rooms/${r.id}/messages`, "POST", { retry: true })).status,
    400,
  );
  assert.equal(f.store.get("rooms", r.id).messages.length, 0);
});

test("research saves provenance, avoids duplicate people, and keeps full sources off the state payload", async (t) => {
  const f = await fixture(t);
  const first = await (await f.call("/research", "POST", { pageId: 5 })).json();
  const second = await (
    await f.call("/research", "POST", { pageId: 5 })
  ).json();
  assert.equal(first.id, second.id);
  assert.equal(first.sources[0].revision, 123);
  assert.equal(first.sources[0].text, undefined);
  assert.match(
    f.store.get("people", first.id).sources[0].text,
    /Important work/,
  );
  assert.equal(f.store.all("people").length, 5);
});

test("research filters books and ambiguous pages; direct nonperson additions fail", async () => {
  const request = async () => ({
    query: {
      pages: [
        {
          pageid: 1,
          title: "Writer",
          pageprops: { wikibase_item: "Q1" },
          extract: "A writer.",
          index: 1,
        },
        {
          pageid: 2,
          title: "Book",
          pageprops: { wikibase_item: "Q2" },
          extract: "A book.",
          index: 2,
        },
        {
          pageid: 3,
          title: "Names",
          pageprops: { wikibase_item: "Q3", disambiguation: "" },
          extract: "Names.",
          index: 3,
        },
      ],
    },
  });
  const verify = async () => new Set(["Q1", "Q3"]);
  assert.deepEqual(
    (await searchPeople("Writer", request, verify)).map((p) => p.name),
    ["Writer"],
  );
  await assert.rejects(
    researchPage(
      2,
      async () => ({ query: { pages: [(await request()).query.pages[1]] } }),
      verify,
    ),
    /biographical page/,
  );
});

test("retrieval preserves long paragraphs and selects relevant evidence; prompt history is bounded", () => {
  const p = person("a");
  p.sources = [
    {
      id: "s",
      title: "Source",
      text:
        "First biography.\n\n" +
        "ordinary ".repeat(1000) +
        "\n\nquasars relativity light scientific theory",
      publisher: "Wikipedia",
    },
  ];
  const evidence = evidenceFor(p, "quasars relativity");
  assert.match(evidence[0].text, /First biography/);
  assert.match(evidence[0].text, /quasars relativity/);
  assert.ok(evidence[0].text.length <= 4500);
  const room = {
    messages: Array.from({ length: 50 }, (_, i) => ({
      role: "user",
      content: `${i} ${"history ".repeat(150)}`,
    })),
  };
  const { messages: prompt } = buildReply(
    { kind: "individual", personId: p.id, personIds: [p.id], voice: "plain" },
    room,
    () => p,
  );
  const context = prompt
    .slice(1, -1)
    .map((m) => m.content)
    .join("\n");
  assert.match(context, /49 history/);
  assert.doesNotMatch(context, /^0 history/);
  assert.ok(context.length < 11000);
});

test("new and existing rooms default to one plain synthesis without rewriting history", async (t) => {
  const f = await fixture(t);
  f.store.put("rooms", {
    id: "old",
    peopleIds: ["a", "b"],
    messages: [
      {
        role: "assistant",
        name: "Thinker a",
        content: "An old reply",
        status: "complete",
      },
    ],
    updatedAt: "2020",
  });
  const state = await (await f.call("/state")).json();
  assert.equal(state.rooms[0].responseMode, "synthesis");
  assert.equal(state.rooms[0].voice, "plain");
  const r = await (
    await f.call("/rooms", "POST", { peopleIds: ["a", "b"] })
  ).json();
  assert.equal(r.responseMode, "synthesis");
  assert.equal(r.voice, "plain");
  await (
    await f.call("/rooms/old/messages", "POST", {
      content: "What is useful here?",
    })
  ).text();
  const saved = f.store.get("rooms", "old");
  assert.equal(saved.messages[0].content, "An old reply");
  assert.equal(saved.messages.length, 3);
  assert.equal(saved.messages.at(-1).kind, "synthesis");
  assert.deepEqual(saved.messages.at(-1).personIds, ["a", "b"]);
  assert.equal(f.requests.length, 1);
});

test("synthesis considers differing profiles and assigns distinct source numbers; followups retain the answer", async (t) => {
  const f = await fixture(t);
  for (const [id, view] of [
    ["a", "Supports central authority"],
    ["b", "Rejects central authority"],
  ]) {
    const p = person(id);
    p.content = view;
    p.sources = [
      {
        id: "source-" + id,
        title: "Biography " + id,
        text: view,
        url: "https://example.org/" + id,
      },
    ];
    f.store.put("people", p);
  }
  const r = await (
    await f.call("/rooms", "POST", { peopleIds: ["a", "b"] })
  ).json();
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "Should authority be centralized?",
    })
  ).text();
  const last = f.store.get("rooms", r.id).messages.at(-1);
  assert.equal(last.name, "Combined answer");
  assert.equal(last.sources.length, 2);
  const prompt = f.requests[0].messages[0].content;
  assert.match(prompt, /Supports central authority/);
  assert.match(prompt, /Rejects central authority/);
  assert.match(prompt, /\[1\] Biography a/);
  assert.match(prompt, /\[2\] Biography b/);
  assert.match(prompt, /do not manufacture consensus/);
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "Explain that in more detail, with examples.",
    })
  ).text();
  assert.match(
    f.requests[1].messages.map((m) => m.content).join("\n"),
    /Earlier combined answer.*\nA café perspective/s,
  );
  assert.ok(
    f.requests[1].options.num_predict > f.requests[0].options.num_predict,
  );
});

test("answer preferences persist, historical voice is opt-in, and a targeted question produces one individual reply", async (t) => {
  const f = await fixture(t);
  const r = await (
    await f.call("/rooms", "POST", { peopleIds: ["a", "b"] })
  ).json();
  assert.equal(
    (await f.call(`/rooms/${r.id}`, "PATCH", { responseMode: "invalid" }))
      .status,
    400,
  );
  assert.equal(
    (await f.call(`/rooms/${r.id}`, "PATCH", { voice: "invalid" })).status,
    400,
  );
  await f.call(`/rooms/${r.id}`, "PATCH", {
    responseMode: "individual",
    voice: "historical",
  });
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "Hello",
      target: "a",
    })
  ).text();
  assert.match(
    f.requests[0].messages[0].content,
    /characteristic voice and period vocabulary/,
  );
  await f.call(`/rooms/${r.id}`, "PATCH", { responseMode: "synthesis" });
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "Just you, please",
      target: "b",
    })
  ).text();
  const last = f.store.get("rooms", r.id).messages.at(-1);
  assert.equal(last.kind, "individual");
  assert.equal(last.personId, "b");
  assert.equal(last.voice, "plain");
  assert.match(f.requests[1].messages[0].content, /everyday modern language/);
  const state = await (await f.call("/state")).json();
  assert.equal(state.rooms[0].responseMode, "synthesis");
});

test("retry preserves a stopped synthesis even after changing answer format", async (t) => {
  const f = await fixture(t);
  f.mode("wait");
  const r = await (
    await f.call("/rooms", "POST", { peopleIds: ["a", "b"] })
  ).json();
  const stream = await f.call(`/rooms/${r.id}/messages`, "POST", {
    content: "Help me decide.",
  });
  const reader = stream.body.getReader();
  let seen = "";
  while (!seen.includes("token")) {
    const { value } = await reader.read();
    seen += new TextDecoder().decode(value);
  }
  await f.call(`/rooms/${r.id}/stop`, "POST", {});
  while (!(await reader.read()).done) {
    /* Wait for persistence. */
  }
  await f.call(`/rooms/${r.id}`, "PATCH", {
    responseMode: "individual",
    voice: "historical",
  });
  f.mode("ok");
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", { retry: true })
  ).text();
  const messages = f.store.get("rooms", r.id).messages;
  assert.equal(messages.length, 2);
  assert.equal(messages[1].kind, "synthesis");
  assert.equal(messages[1].voice, "plain");
  assert.equal(messages[1].status, "complete");
  assert.equal(f.requests.length, 2);
});

test("SQLite data survives a close and reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "great-thinkers-test-"));
  try {
    let store = openStore(join(directory, "test.sqlite"));
    store.put("people", person("persisted"));
    store.close();
    store = openStore(join(directory, "test.sqlite"));
    assert.equal(store.get("people", "persisted").name, "Thinker persisted");
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cloud aliases are rejected before conversation data leaves the app", async (t) => {
  const f = await fixture(t);
  f.mode("cloud");
  const room = await (
    await f.call("/rooms", "POST", { peopleIds: ["a"] })
  ).json();
  const result = await f.call(`/rooms/${room.id}/messages`, "POST", {
    content: "Private thoughts",
  });
  assert.equal(result.status, 400);
  assert.equal(f.requests.length, 0);
  assert.equal(f.store.get("rooms", room.id).messages.length, 0);
});

test("ordinary explanations stay brief while explicit depth requests expand", () => {
  assert.equal(wantsDetailedAnswer("Should I spend more time reading?"), false);
  assert.equal(wantsDetailedAnswer("Explain private property."), false);
  assert.equal(wantsDetailedAnswer("Explain that in more detail."), true);
  assert.equal(wantsDetailedAnswer("Tell me more."), true);
  assert.equal(wantsDetailedAnswer("Give details but keep it concise."), false);
});

test("insights preserve original answers and provenance without becoming persona memory", async (t) => {
  const f = await fixture(t);
  const r = await (await f.call("/rooms", "POST", { peopleIds: ["a"] })).json();
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "A useful idea?",
    })
  ).text();
  const message = f.store.get("rooms", r.id).messages.at(-1);
  const saved = await (
    await f.call("/insights", "POST", {
      roomId: r.id,
      messageId: message.id,
      content: "Replace the answer",
    })
  ).json();
  assert.equal(saved.content, message.content);
  assert.equal(saved.kind, "AI interpretation");
  assert.equal(saved.identities[0].version.length, 64);
  const again = await (
    await f.call("/insights", "POST", { roomId: r.id, messageId: message.id })
  ).json();
  assert.equal(saved.id, again.id);
  assert.equal(
    (
      await f.call("/insights", "POST", {
        roomId: r.id,
        messageId: r.messages[0]?.id || "bad",
      })
    ).status,
    400,
  );
  await f.call(`/insights/${saved.id}`, "PATCH", {
    title: "Keep this",
    note: "SECRET_NOTE_REWRITE_IDENTITY",
    content: "Replacement",
  });
  assert.equal(f.store.get("insights", saved.id).content, message.content);
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", { content: "What next?" })
  ).text();
  assert.doesNotMatch(
    JSON.stringify(f.requests.at(-1)),
    /SECRET_NOTE_REWRITE_IDENTITY/,
  );
  await f.call(`/rooms/${r.id}`, "DELETE");
  const state = await (await f.call("/state")).json();
  assert.equal(state.insights[0].title, "Keep this");
  assert.equal(state.insights[0].content, message.content);
});

test("research is staged and reviewed, preserving identity and an audit trail", async (t) => {
  const f = await fixture(t);
  const identity = f.store.get("identities", "a");
  const proposed = await (
    await f.call("/research", "POST", { pageId: 5, personId: "a" })
  ).json();
  assert.equal(proposed.biography, "A biography.");
  assert.equal(proposed.sources.length, 0);
  assert.equal(proposed.pendingResearch.name, "New Mind");
  assert.equal(proposed.pendingResearch.source.text, undefined);
  assert.equal(
    (
      await f.call("/people/a/research-review", "POST", {
        proposalId: "stale",
        decision: "accept",
      })
    ).status,
    409,
  );
  const accepted = await (
    await f.call("/people/a/research-review", "POST", {
      proposalId: proposed.pendingResearch.id,
      decision: "accept",
    })
  ).json();
  assert.match(accepted.biography, /documented life/);
  assert.equal(accepted.content, identity.content);
  assert.equal(accepted.identityVersion, identity.version);
  assert.equal(accepted.pendingResearch, undefined);
  assert.equal(f.store.all("researchReviews")[0].decision, "accept");
  assert.match(f.store.all("researchReviews")[0].source.text, /Important work/);
  const second = await (
    await f.call("/research", "POST", { pageId: 5, personId: "a" })
  ).json();
  await f.call("/people/a/research-review", "POST", {
    proposalId: second.pendingResearch.id,
    decision: "reject",
  });
  assert.deepEqual(f.store.get("people", "a").sources, [
    f.store.all("researchReviews").find((r) => r.decision === "accept").source,
  ]);
  await f.call("/people/a", "PATCH", {
    notes: "SECRET_PERSONAL_REWRITE",
    content: "Changed beliefs",
  });
  const r = await (await f.call("/rooms", "POST", { peopleIds: ["a"] })).json();
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "What do you think?",
    })
  ).text();
  assert.doesNotMatch(
    JSON.stringify(f.requests[0]),
    /SECRET_PERSONAL_REWRITE|Changed beliefs/,
  );
  assert.match(f.requests[0].messages[0].content, /IDENTITY BOUNDARY/);
  assert.equal(f.store.get("identities", "a").version, identity.version);
});

test("changing the default model does not switch an existing conversation", async (t) => {
  const f = await fixture(t);
  const r = await (await f.call("/rooms", "POST", { peopleIds: ["a"] })).json();
  await f.call("/settings", "PUT", { model: "another-local-model" });
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", { content: "Hello" })
  ).text();
  assert.equal(f.requests[0].model, "llama3.1:8b");
  const next = await (
    await f.call("/rooms", "POST", { peopleIds: ["a"] })
  ).json();
  assert.equal(next.model, "another-local-model");
});

test("changed model weights cannot silently alter an existing conversation", async (t) => {
  const f = await fixture(t);
  const r = await (await f.call("/rooms", "POST", { peopleIds: ["a"] })).json();
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "First question",
    })
  ).text();
  assert.equal(f.store.get("rooms", r.id).modelDigest, "fixture-version");
  f.mode("changed");
  assert.equal(
    (
      await f.call(`/rooms/${r.id}/messages`, "POST", {
        content: "Second question",
      })
    ).status,
    409,
  );
  assert.equal(f.requests.length, 1);
  assert.equal(f.store.get("rooms", r.id).messages.length, 2);
});

test("removed conversations disappear from history and restore intact", async (t) => {
  const f = await fixture(t);
  const r = await (await f.call("/rooms", "POST", { peopleIds: ["a"] })).json();
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "Keep this conversation",
    })
  ).text();
  const before = f.store.get("rooms", r.id);
  assert.equal((await f.call(`/rooms/${r.id}`, "DELETE")).status, 200);
  const state = await (await f.call("/state")).json();
  assert.equal(state.rooms.length, 0);
  assert.deepEqual(state.removedRooms, [{ id: r.id, title: before.title }]);
  assert.equal(
    (await f.call(`/rooms/${r.id}/messages`, "POST", { content: "Hidden" }))
      .status,
    404,
  );
  const restored = await (
    await f.call(`/rooms/${r.id}/restore`, "POST", {})
  ).json();
  assert.deepEqual(restored, before);
  assert.equal(f.store.all("removedRooms").length, 0);
});

test("watch mode runs exactly two rounds, shares earlier arguments, and saves quoted assessments", async (t) => {
  const f = await fixture(t);
  const r = await (
    await f.call("/rooms", "POST", { peopleIds: ["a", "b"] })
  ).json();
  await f.call(`/rooms/${r.id}`, "PATCH", { responseMode: "watch" });
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "What is fair?",
    })
  ).text();
  const saved = f.store.get("rooms", r.id);
  const answers = saved.messages.filter((m) => m.role === "assistant");
  assert.deepEqual(
    answers.map((m) => [m.personId, m.round]),
    [
      ["a", 1],
      ["b", 1],
      ["a", 2],
      ["b", 2],
    ],
  );
  assert.equal(saved.discussionEvents.length, 4);
  assert.equal(saved.discussionEvents[0].state, "unclear");
  assert.equal(saved.discussionEvents.at(-1).state, "conflict");
  assert.equal(saved.discussionEvents.at(-1).evidence.length, 2);
  const generations = f.requests.filter((r) => r.stream);
  assert.equal(generations.length, 4);
  assert.match(JSON.stringify(generations[2].messages), /A caf/);
  f.mode("bad-assessment");
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "Try another perspective",
    })
  ).text();
  assert.equal(
    f.store.get("rooms", r.id).discussionEvents.at(-1).state,
    "unclear",
  );
  assert.equal(f.store.get("rooms", r.id).messages.at(-1).status, "complete");
});

test("agreement colors require valid states and exact quotations from different speakers", () => {
  const replies = [
    { id: "a1", personId: "a", content: "I support individual rights." },
    { id: "b1", personId: "b", content: "I support collective ownership." },
  ];
  const evidence = replies.map((m) => ({ messageId: m.id, quote: m.content }));
  for (const state of ["conflict", "common-ground", "agreement", "unclear"])
    assert.equal(
      parseAssessment(
        JSON.stringify({ state, reason: "A short assessment", evidence }),
        replies,
      ).state,
      state,
    );
  assert.throws(() =>
    parseAssessment(
      JSON.stringify({
        state: "agreement",
        reason: "Invented",
        evidence: [{ messageId: "a1", quote: "We completely agree." }],
      }),
      replies,
    ),
  );
  assert.throws(() =>
    parseAssessment(
      JSON.stringify({ state: "100%", reason: "Invented", evidence }),
      replies,
    ),
  );
});

test("stopping during assessment preserves completed replies and prevents later rounds", async (t) => {
  const f = await fixture(t);
  f.mode("wait-assessment");
  const r = await (
    await f.call("/rooms", "POST", { peopleIds: ["a", "b"] })
  ).json();
  await f.call(`/rooms/${r.id}`, "PATCH", { responseMode: "watch" });
  const stream = await f.call(`/rooms/${r.id}/messages`, "POST", {
    content: "Debate this",
  });
  const reader = stream.body.getReader();
  let seen = "";
  while ((seen.match(/"phase":"assessing"/g) || []).length < 2) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    seen += new TextDecoder().decode(value);
  }
  await f.call(`/rooms/${r.id}/stop`, "POST", {});
  while (!(await reader.read()).done) {
    /* Drain stopped stream. */
  }
  const saved = f.store.get("rooms", r.id);
  assert.equal(saved.messages.length, 3);
  assert.ok(saved.messages.slice(1).every((m) => m.status === "complete"));
  assert.equal(saved.discussionEvents.length, 1);
});

test("AI briefs remain quarantined until review and never replace identity", async (t) => {
  const f = await fixture(t);
  const p = await (await f.call("/research", "POST", { pageId: 5 })).json();
  const draft = await (
    await f.call(`/people/${p.id}/brief`, "POST", {})
  ).json();
  assert.equal(draft.aiBrief.grounded.length, 1);
  assert.equal(draft.supplementalBrief, undefined);
  assert.equal(draft.content, p.content);
  const r = await (
    await f.call("/rooms", "POST", { peopleIds: [p.id] })
  ).json();
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "What do you think?",
    })
  ).text();
  assert.doesNotMatch(
    JSON.stringify(f.requests.at(-1)),
    /UNVERIFIED_BRIEF_CONTEXT/,
  );
  assert.equal(
    (
      await f.call(`/people/${p.id}/brief-review`, "POST", {
        briefId: "stale",
        decision: "accept",
      })
    ).status,
    409,
  );
  const accepted = await (
    await f.call(`/people/${p.id}/brief-review`, "POST", {
      briefId: draft.aiBrief.id,
      decision: "accept",
    })
  ).json();
  assert.equal(accepted.aiBrief, undefined);
  assert.equal(accepted.content, p.content);
  await (
    await f.call(`/rooms/${r.id}/messages`, "POST", {
      content: "More context?",
    })
  ).text();
  assert.match(JSON.stringify(f.requests.at(-1)), /UNVERIFIED_BRIEF_CONTEXT/);
  assert.match(JSON.stringify(f.requests.at(-1)), /NOT independently verified/);
  assert.equal(f.store.all("briefReviews")[0].decision, "accept");
  f.mode("cloud");
  const count = f.requests.length;
  assert.notEqual(
    (await f.call(`/people/${p.id}/brief`, "POST", {})).status,
    200,
  );
  assert.equal(f.requests.length, count);
});

test("AI brief source claims with invented or mismatched excerpts are excluded", () => {
  const result = parseBrief(
    JSON.stringify({
      grounded: [
        {
          claim: "False source",
          sourceId: "wiki-5",
          quote: "This passage was invented.",
        },
      ],
      context: [{ topic: "Unverified idea", summary: "Needs checking" }],
      questions: [],
    }),
    [{ id: "wiki-5", text: "A documented life." }],
  );
  assert.equal(result.grounded.length, 0);
  assert.equal(result.context[0].summary, "Needs checking");
});
