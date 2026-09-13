import express from "express";
import { randomUUID } from "node:crypto";
import {
  searchPeople,
  researchPage,
  evidenceFor,
  buildMessages,
} from "./research.js";

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
const cleanPerson = (p) => ({
  ...p,
  sources: p.sources.map(({ text: _text, ...s }) => s),
});
export function createApp({
  store,
  ollamaUrl = "http://127.0.0.1:11434",
  wikiRequest,
  verifyHuman,
  dist,
}) {
  const app = express();
  const busy = new Map();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host))
      return res
        .status(403)
        .json({ error: "This app accepts local connections only." });
    const origin = req.get("origin");
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      return res.status(403).json({ error: "Untrusted origin." });
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  const person = (id) =>
    store.get("people", id) || fail("Person not found.", 404);
  const room = (id) =>
    store.get("rooms", id) || fail("Conversation not found.", 404);
  const editable = (id) => {
    if (busy.has(id))
      fail("Stop the current reply before changing this conversation.", 409);
  };
  const peopleIds = (ids) => {
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 3 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => typeof id !== "string" || !store.get("people", id))
    )
      fail("Choose one to three different people.");
    return ids;
  };
  app.get("/api/state", (_req, res) =>
    res.json({
      people: store.all("people").map(cleanPerson),
      rooms: store
        .all("rooms")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      settings: store.get("settings", "main") || {
        id: "main",
        model: "llama3.1:8b",
      },
    }),
  );
  app.get("/api/models", async (_req, res) => {
    try {
      const r = await fetch(`${ollamaUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error();
      res.json({
        online: true,
        models: ((await r.json()).models || []).filter(
          (m) =>
            !m.remote_host &&
            !m.remote_model &&
            !/cloud/i.test(m.name) &&
            m.size > 1000000,
        ),
      });
    } catch {
      res.json({ online: false, models: [] });
    }
  });
  app.put("/api/settings", (req, res) => {
    if (
      typeof req.body.model !== "string" ||
      !req.body.model.trim() ||
      req.body.model.length > 150
    )
      fail("Choose an installed model.");
    res.json(store.put("settings", { id: "main", model: req.body.model }));
  });
  app.patch("/api/people/:id", (req, res) => {
    const p = person(req.params.id);
    if (typeof req.body.favorite === "boolean") p.favorite = req.body.favorite;
    if (typeof req.body.notes === "string")
      p.notes = req.body.notes.slice(0, 1500);
    res.json(cleanPerson(store.put("people", p)));
  });
  app.get("/api/research", async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2 || q.length > 100)
      fail("Enter a name between 2 and 100 characters.");
    res.json(await searchPeople(q, wikiRequest, verifyHuman));
  });
  app.post("/api/research", async (req, res) => {
    if (!Number.isSafeInteger(req.body.pageId) || req.body.pageId < 1)
      fail("Choose a search result first.");
    if (req.body.personId) person(req.body.personId);
    const result = await researchPage(
      req.body.pageId,
      wikiRequest,
      verifyHuman,
    );
    const existing = req.body.personId
      ? person(req.body.personId)
      : store
          .all("people")
          .find(
            (p) =>
              p.sources.some((s) => s.id === result.source.id) ||
              p.name.toLowerCase() === result.name.toLowerCase(),
          );
    const p = existing || {
      id: randomUUID(),
      name: result.name,
      category: "Your discoveries",
      notes: "",
      favorite: false,
      createdAt: new Date().toISOString(),
      content: `# ${result.name}\n\n${result.biography}\n\nPortray their documented perspective. Their exact speaking style is uncertain; do not invent signature phrases.`,
    };
    p.biography = result.biography;
    p.image = result.image;
    p.sources = [result.source];
    res.json(cleanPerson(store.put("people", p)));
  });
  app.post("/api/rooms", (req, res) => {
    const ids = peopleIds(req.body.peopleIds);
    const now = new Date().toISOString();
    res.json(
      store.put("rooms", {
        id: randomUUID(),
        peopleIds: ids,
        title: ids.map((id) => person(id).name.split(" ").at(-1)).join(" & "),
        messages: [],
        createdAt: now,
        updatedAt: now,
      }),
    );
  });
  app.patch("/api/rooms/:id", (req, res) => {
    editable(req.params.id);
    const r = room(req.params.id);
    if (req.body.peopleIds) r.peopleIds = peopleIds(req.body.peopleIds);
    if (typeof req.body.title === "string")
      r.title = req.body.title.trim().slice(0, 100) || r.title;
    r.updatedAt = new Date().toISOString();
    res.json(store.put("rooms", r));
  });
  app.delete("/api/rooms/:id", (req, res) => {
    editable(req.params.id);
    room(req.params.id);
    store.remove("rooms", req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/rooms/:id/stop", (req, res) => {
    busy.get(req.params.id)?.abort();
    res.json({ ok: true });
  });
  app.post("/api/rooms/:id/messages", async (req, res) => {
    const r = room(req.params.id);
    editable(r.id);
    if (busy.size)
      fail("Another conversation is using Ollama. Wait for it to finish.", 409);
    const retry = req.body.retry === true;
    const content =
      typeof req.body.content === "string" ? req.body.content.trim() : "";
    if (!retry && (!content || content.length > 4000))
      fail("Write a message of up to 4,000 characters.");
    let targets = req.body.target ? [req.body.target] : r.peopleIds;
    if (targets.some((id) => !r.peopleIds.includes(id)))
      fail("That person is not in this conversation.");
    if (retry) {
      const last = r.messages.at(-1);
      if (
        !last ||
        last.role !== "assistant" ||
        !["error", "interrupted"].includes(last.status)
      )
        fail("There is no interrupted reply to retry.");
      if (!r.peopleIds.includes(last.personId))
        fail(
          "Invite this person back to the table before retrying their reply.",
        );
      targets = [last.personId];
    }
    const settings = store.get("settings", "main") || { model: "llama3.1:8b" };
    // Ollama can route cloud aliases through localhost. Verify local weights before sending conversation data.
    let modelInfo;
    try {
      const modelResponse = await fetch(`${ollamaUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: settings.model }),
        signal: AbortSignal.timeout(5000),
      });
      if (!modelResponse.ok)
        fail(
          "The selected model is unavailable. Choose an installed model in Settings.",
          400,
        );
      modelInfo = await modelResponse.json();
    } catch (error) {
      if (error.status) throw error;
      fail(
        "Ollama is offline or not responding. Open Ollama and try again.",
        503,
      );
    }
    if (
      modelInfo.remote_host ||
      modelInfo.remote_model ||
      !modelInfo.model_info?.["general.architecture"]
    )
      fail(
        "Choose a model with local weights. Cloud models are not used by this app.",
        400,
      );
    if (busy.size)
      fail("Another conversation is using Ollama. Wait for it to finish.", 409);
    const controller = new AbortController();
    busy.set(r.id, controller);
    const timeout = setTimeout(() => controller.abort(), 300000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    res.set({
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    });
    res.flushHeaders();
    const emit = (data) => {
      if (!res.destroyed) res.write(JSON.stringify(data) + "\n");
    };
    const save = () => {
      r.updatedAt = new Date().toISOString();
      store.put("rooms", r);
    };
    if (retry) r.messages.pop();
    else {
      r.messages.push({
        id: randomUUID(),
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      });
      if (r.messages.length === 1) r.title = content.slice(0, 65);
    }
    save();
    emit({ type: "room", room: r });
    let current;
    try {
      for (const id of targets) {
        controller.signal.throwIfAborted();
        const p = person(id);
        const evidence = evidenceFor(
          p,
          r.messages.filter((m) => m.role === "user").at(-1).content,
        );
        const messages = buildMessages(p, r, evidence);
        current = {
          id: randomUUID(),
          role: "assistant",
          personId: id,
          name: p.name,
          content: "",
          status: "interrupted",
          model: settings.model,
          sources: evidence.map(({ text, ...s }) => ({ ...s, excerpt: text })),
          createdAt: new Date().toISOString(),
        };
        r.messages.push(current);
        save();
        emit({ type: "room", room: r });
        const response = await fetch(`${ollamaUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: settings.model,
            messages,
            stream: true,
            options: { num_ctx: 8192, num_predict: 550, temperature: 0.4 },
          }),
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "The selected model is not installed. Choose another in Settings."
              : "Ollama could not generate a reply. Check that it is running and try a smaller model.",
          );
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;
        const processLine = (line) => {
          if (!line.trim()) return;
          const data = JSON.parse(line);
          if (data.error) throw new Error(data.error);
          if (data.message?.content) {
            current.content += data.message.content;
            emit({ type: "token", id: current.id, text: data.message.content });
          }
          if (data.done) done = true;
        };
        for await (const chunk of response.body) {
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();
          lines.forEach(processLine);
        }
        buffer += decoder.decode();
        processLine(buffer);
        if (!done || !current.content.trim())
          throw new Error(
            "The model ended without a complete reply. Try again or choose another model.",
          );
        current.status = "complete";
        save();
        emit({ type: "room", room: r });
        current = null;
      }
    } catch (error) {
      if (current) {
        current.status = controller.signal.aborted ? "interrupted" : "error";
        current.error = controller.signal.aborted
          ? "Reply stopped. You can retry it."
          : error.cause?.code === "ECONNREFUSED"
            ? "Ollama is offline. Open Ollama, then retry."
            : error.message;
      }
      save();
      emit({ type: "room", room: r });
      emit({ type: "error", error: current?.error || "Conversation stopped." });
    } finally {
      clearTimeout(timeout);
      busy.delete(r.id);
      emit({ type: "done" });
      res.end();
    }
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  if (dist) {
    app.use(express.static(dist));
    app.get("/{*path}", (_req, res) =>
      res.sendFile("index.html", { root: dist }),
    );
  }
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({
      error:
        error.type === "entity.parse.failed"
          ? "Invalid request."
          : error.message || "Something went wrong. Please try again.",
    });
  });
  return app;
}
