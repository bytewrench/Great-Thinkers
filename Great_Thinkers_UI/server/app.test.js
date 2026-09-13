import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { openStore } from "./store.js";
import { createApp } from "./app.js";
import {
  evidenceFor,
  buildMessages,
  searchPeople,
  researchPage,
} from "./research.js";

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
        JSON.stringify({ models: [{ name: "llama3.1:8b", size: 4700000000 }] }),
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
  const prompt = buildMessages(p, room, evidence);
  const context = prompt
    .slice(1, -1)
    .map((m) => m.content)
    .join("\n");
  assert.match(context, /49 history/);
  assert.doesNotMatch(context, /^0 history/);
  assert.ok(context.length < 11000);
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
