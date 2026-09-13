import express from "express";
import { identityService } from "./knowledge.js";
import { generateBrief } from "./brief.js";
import { prepareSource, draftProfile } from "./dataset.js";
import { assessDiscussion } from "./discussion.js";
import { randomUUID } from "node:crypto";
import { searchPeople, researchPage } from "./research.js";
import {
  DEFAULT_RESPONSE,
  responsePreferences,
  replyPlan,
  buildReply,
} from "./conversation.js";

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
const cleanPerson = (p) => ({
  ...p,
  pendingResearch: p.pendingResearch
    ? {
        ...p.pendingResearch,
        source: { ...p.pendingResearch.source, text: undefined },
      }
    : undefined,
  sources: p.sources.map(({ text: _text, passages: _passages, ...s }) => s),
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
  app.use("/api/people/:id/sources", express.json({ limit: "1mb" }));
  app.use(express.json({ limit: "64kb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  const { person, pin, accept, acceptDraft } = identityService(store);
  const savePerson = (p) => {
    const {
      availableEdition: _edition,
      identityVersion: _version,
      identityPeriod: _period,
      identityPackIds: _packs,
      datasetSources: _dataset,
      ...stored
    } = p;
    stored.sources = stored.sources.filter(
      (source) => !source.primary && !source.personId,
    );
    store.put("people", stored);
    return person(p.id);
  };
  // Freeze existing editorial identities before any research or conversation writes.
  store.all("people").forEach((p) => person(p.id));
  const roomModel = (r) =>
    r.model ||
    r.messages.findLast((m) => m.model)?.model ||
    store.get("settings", "main")?.model ||
    "llama3.1:8b";
  for (const kind of ["rooms", "removedRooms"]) {
    store
      .all(kind)
      .forEach((r) => store.put(kind, pin({ ...r, model: roomModel(r) })));
  }
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
      people: store.all("people").map((p) => cleanPerson(person(p.id))),
      removedRooms: store
        .all("removedRooms")
        .map((r) => ({ id: r.id, title: r.title })),
      insights: store
        .all("insights")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      rooms: store
        .all("rooms")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((r) => ({ ...r, ...responsePreferences(r) })),
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
    res.json(cleanPerson(savePerson(p)));
  });
  app.post("/api/people/:id/identity-review", (req, res) => {
    if (busy.size)
      fail(
        "Wait for the current reply or research to finish before changing an edition.",
        409,
      );
    if (req.body.decision !== "accept")
      fail(
        "Accept the reviewed edition, or leave the current edition unchanged.",
      );
    res.json(
      cleanPerson(accept(req.params.id, req.body.packId, req.body.baseVersion)),
    );
  });
  app.post("/api/people/:id/sources", (req, res) => {
    const p = person(req.params.id);
    const source = prepareSource(req.body, p.id);
    const existing = store
      .all("thinkerSources")
      .filter((s) => s.personId === p.id);
    if (existing.some((s) => s.sha256 === source.sha256))
      fail("This text is already in the dataset.", 409);
    if (existing.length >= 30)
      fail(
        "This dataset has 30 sources. Use focused excerpts for this local edition.",
      );
    store.put("thinkerSources", source);
    res.json(cleanPerson(person(p.id)));
  });
  app.get("/api/people/:id/sources/:sourceId", (req, res) => {
    person(req.params.id);
    const source = store.get("thinkerSources", req.params.sourceId);
    if (!source || source.personId !== req.params.id)
      fail("Source not found.", 404);
    res.json(source);
  });
  app.post("/api/people/:id/profile-draft", async (req, res) => {
    const p = person(req.params.id);
    if (busy.size)
      fail("Wait for the current reply or research to finish.", 409);
    const ids = req.body.sourceIds;
    const candidates = [
      ...store.all("thinkerSources").filter((s) => s.personId === p.id),
      ...p.sources,
    ];
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 3 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !candidates.some((s) => s.id === id))
    )
      fail("Choose one to three sources for this profile draft.");
    const selected = ids.map((id) => candidates.find((s) => s.id === id));
    const controller = new AbortController(),
      key = `profile:${p.id}`;
    busy.set(key, controller);
    const timeout = setTimeout(() => controller.abort(), 120000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const draft = await draftProfile(
        p,
        selected,
        req.body.scope,
        ollamaUrl,
        store.get("settings", "main")?.model || "llama3.1:8b",
        controller.signal,
      );
      res.json(
        cleanPerson(savePerson({ ...person(p.id), profileDraft: draft })),
      );
    } finally {
      clearTimeout(timeout);
      busy.delete(key);
    }
  });
  app.post("/api/people/:id/profile-review", (req, res) => {
    if (busy.size)
      fail("Wait for the current reply or research to finish.", 409);
    const p = person(req.params.id),
      draft = p.profileDraft;
    if (!draft || draft.id !== req.body.draftId)
      fail("The draft changed. Reload and review it again.", 409);
    if (!["accept", "reject"].includes(req.body.decision))
      fail("Choose accept or reject.");
    if (req.body.decision === "accept")
      acceptDraft(p.id, draft, req.body.content, req.body.scope);
    else
      store.put("identityReviews", {
        id: draft.id,
        personId: p.id,
        draft,
        decision: "reject",
        reviewedAt: new Date().toISOString(),
      });
    const latest = person(p.id);
    delete latest.profileDraft;
    res.json(cleanPerson(savePerson(latest)));
  });
  app.get("/api/people/:id/dataset", (req, res) => {
    const p = person(req.params.id);
    res.set(
      "Content-Disposition",
      `attachment; filename="thinker-${p.id}.json"`,
    );
    res.json({
      format: "great-thinkers-dataset",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      person: {
        id: p.id,
        name: p.name,
        biography: p.biography,
        category: p.category,
      },
      activeIdentity: store.get("identities", p.id),
      identityVersions: store
        .all("identityVersions")
        .filter((i) => i.personId === p.id),
      reviews: store.all("identityReviews").filter((i) => i.personId === p.id),
      sources: p.sources,
      datasetSources: store
        .all("thinkerSources")
        .filter((s) => s.personId === p.id),
    });
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
    if (existing) {
      p.pendingResearch = {
        ...result,
        id: randomUUID(),
        proposedAt: new Date().toISOString(),
      };
    } else {
      p.biography = result.biography;
      p.image = result.image;
      p.sources = [result.source];
    }
    savePerson(p);
    res.json(cleanPerson(person(p.id)));
  });
  app.post("/api/people/:id/research-review", (req, res) => {
    const p = person(req.params.id);
    const proposal = p.pendingResearch;
    if (!proposal || proposal.id !== req.body.proposalId)
      fail(
        "This research proposal has changed. Reload and review it again.",
        409,
      );
    if (!["accept", "reject"].includes(req.body.decision))
      fail("Choose accept or reject.");
    store.put("researchReviews", {
      ...proposal,
      id: proposal.id,
      personId: p.id,
      decision: req.body.decision,
      reviewedAt: new Date().toISOString(),
    });
    if (req.body.decision === "accept") {
      p.biography = proposal.biography;
      p.image = proposal.image;
      p.sources = [proposal.source];
    }
    delete p.pendingResearch;
    res.json(cleanPerson(savePerson(p)));
  });
  app.post("/api/people/:id/brief", async (req, res) => {
    const p = person(req.params.id);
    if (busy.size)
      fail("Wait for the current discussion or research brief to finish.", 409);
    const controller = new AbortController();
    const key = `brief:${p.id}`;
    busy.set(key, controller);
    const timeout = setTimeout(() => controller.abort(), 90000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const model = store.get("settings", "main")?.model || "llama3.1:8b";
      const brief = await generateBrief(p, ollamaUrl, model, controller.signal);
      // Re-read to preserve favorites or notes edited while the model ran.
      const latest = person(p.id);
      latest.aiBrief = {
        ...brief,
        id: randomUUID(),
        generatedAt: new Date().toISOString(),
      };
      res.json(cleanPerson(savePerson(latest)));
    } finally {
      clearTimeout(timeout);
      busy.delete(key);
    }
  });
  app.post("/api/people/:id/brief-review", (req, res) => {
    const p = person(req.params.id);
    if (!p.aiBrief || p.aiBrief.id !== req.body.briefId)
      fail("This brief has changed. Reload and review it again.", 409);
    if (!["accept", "reject"].includes(req.body.decision))
      fail("Choose accept or reject.");
    store.put("briefReviews", {
      ...p.aiBrief,
      personId: p.id,
      decision: req.body.decision,
      reviewedAt: new Date().toISOString(),
    });
    if (req.body.decision === "accept") p.supplementalBrief = p.aiBrief;
    delete p.aiBrief;
    res.json(cleanPerson(savePerson(p)));
  });
  app.post("/api/insights", (req, res) => {
    const r = room(req.body.roomId);
    const index = r.messages.findIndex((m) => m.id === req.body.messageId);
    const message = r.messages[index];
    if (
      !message ||
      message.role !== "assistant" ||
      message.status !== "complete"
    )
      fail("Save a completed answer.");
    const existing = store
      .all("insights")
      .find((i) => i.roomId === r.id && i.messageId === message.id);
    if (existing) return res.json(existing);
    const question =
      r.messages.slice(0, index).findLast((m) => m.role === "user")?.content ||
      "";
    res.json(
      store.put("insights", {
        id: randomUUID(),
        roomId: r.id,
        roomTitle: r.title,
        messageId: message.id,
        title: question.slice(0, 120) || "Saved insight",
        question,
        content: message.content,
        sources: message.sources || [],
        model: message.model,
        modelDigest: message.modelDigest,
        identities: message.identities || [],
        researchBriefs: message.researchBriefs || [],
        people: (message.personIds || [message.personId])
          .filter(Boolean)
          .map((id) => ({ id, name: person(id).name })),
        kind: "AI interpretation",
        note: "",
        createdAt: new Date().toISOString(),
      }),
    );
  });
  app.patch("/api/insights/:id", (req, res) => {
    const insight =
      store.get("insights", req.params.id) || fail("Insight not found.", 404);
    if (
      typeof req.body.title !== "string" ||
      !req.body.title.trim() ||
      req.body.title.length > 120 ||
      typeof req.body.note !== "string" ||
      req.body.note.length > 3000
    )
      fail(
        "Use a title up to 120 characters and notes up to 3,000 characters.",
      );
    res.json(
      store.put("insights", {
        ...insight,
        title: req.body.title.trim(),
        note: req.body.note,
      }),
    );
  });
  app.delete("/api/insights/:id", (req, res) => {
    if (!store.get("insights", req.params.id)) fail("Insight not found.", 404);
    store.remove("insights", req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/rooms", (req, res) => {
    const ids = peopleIds(req.body.peopleIds);
    const now = new Date().toISOString();
    res.json(
      store.put("rooms", {
        id: randomUUID(),
        peopleIds: ids,
        identityPins: Object.fromEntries(
          ids.map((id) => [id, person(id).identityVersion]),
        ),
        ...DEFAULT_RESPONSE,
        model: store.get("settings", "main")?.model || "llama3.1:8b",
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
    if (
      req.body.responseMode !== undefined &&
      !["synthesis", "individual", "watch"].includes(req.body.responseMode)
    )
      fail("Choose a valid answer format.");
    if (
      req.body.voice !== undefined &&
      !["plain", "historical"].includes(req.body.voice)
    )
      fail("Choose a valid voice.");
    Object.assign(r, responsePreferences(r));
    if (req.body.responseMode !== undefined)
      r.responseMode = req.body.responseMode;
    if (req.body.voice !== undefined) r.voice = req.body.voice;
    if (req.body.peopleIds) r.peopleIds = peopleIds(req.body.peopleIds);
    pin(r);
    if (typeof req.body.title === "string")
      r.title = req.body.title.trim().slice(0, 100) || r.title;
    r.updatedAt = new Date().toISOString();
    res.json(store.put("rooms", r));
  });
  app.delete("/api/rooms/:id", (req, res) => {
    editable(req.params.id);
    const removed = room(req.params.id);
    store.put("removedRooms", removed);
    store.remove("rooms", req.params.id);
    res.json({ ok: true });
  });
  app.post("/api/rooms/:id/restore", (req, res) => {
    const restored =
      store.get("removedRooms", req.params.id) ||
      fail("Removed conversation not found.", 404);
    store.put("rooms", restored);
    store.remove("removedRooms", restored.id);
    res.json(restored);
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
    const targets = req.body.target ? [req.body.target] : r.peopleIds;
    if (targets.some((id) => !r.peopleIds.includes(id)))
      fail("That person is not in this conversation.");
    pin(r);
    const pinnedPerson = (id) => person(id, r.identityPins[id]);
    targets.forEach(pinnedPerson);
    let plan = replyPlan(r, targets, pinnedPerson);
    if (retry) {
      const last = r.messages.at(-1);
      if (
        !last ||
        last.role !== "assistant" ||
        !["error", "interrupted"].includes(last.status)
      )
        fail("There is no interrupted reply to retry.");
      const originalPeople = last.personIds || [last.personId];
      if (originalPeople.some((id) => !r.peopleIds.includes(id)))
        fail(
          "Invite the original participants back before retrying this reply.",
        );
      plan = [
        {
          round: last.round,
          watching: last.watching,
          kind: last.kind || "individual",
          personId: last.personId,
          personIds: originalPeople,
          name: last.name,
          voice: last.voice || "historical",
        },
      ];
    }
    const settings = { model: roomModel(r) };
    r.model = settings.model;
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
    const tagsResponse = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!tagsResponse.ok)
      fail("Cannot verify the installed model version. Try again.", 503);
    const installedModel = ((await tagsResponse.json()).models || []).find(
      (m) => m.name === settings.model,
    );
    if (!installedModel?.digest)
      fail(
        "Cannot verify the installed model version. Choose an installed model for a new conversation.",
      );
    if (r.modelDigest && r.modelDigest !== installedModel.digest)
      fail(
        "This conversation's model has changed on disk. Restore that model version or start a new conversation to use the updated model.",
        409,
      );
    r.modelDigest = installedModel.digest;
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
      for (const step of plan) {
        controller.signal.throwIfAborted();
        const { messages, sources, maxTokens } = buildReply(
          step,
          r,
          pinnedPerson,
        );
        current = {
          id: randomUUID(),
          role: "assistant",
          ...step,
          content: "",
          status: "interrupted",
          model: settings.model,
          modelDigest: r.modelDigest,
          researchBriefs: step.personIds
            .map((id) => ({
              personId: id,
              briefId: pinnedPerson(id).supplementalBrief?.id,
            }))
            .filter((x) => x.briefId),
          identities: step.personIds.map((id) => ({
            personId: id,
            version: pinnedPerson(id).identityVersion,
          })),
          sources,
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
            options: {
              num_ctx: 8192,
              num_predict: maxTokens,
              temperature: 0.35,
            },
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
        const completed = current;
        current = null;
        if (r.responseMode === "watch" || (step.watching && retry)) {
          emit({ type: "phase", phase: "assessing" });
          const assessment = await assessDiscussion(
            r,
            ollamaUrl,
            settings.model,
            controller.signal,
          );
          if (!controller.signal.aborted) {
            r.discussionEvents = [
              ...(r.discussionEvents || []).filter(
                (e) => e.messageId !== completed.id,
              ),
              {
                ...assessment,
                messageId: completed.id,
                questionId: r.messages.findLast((m) => m.role === "user").id,
                round: step.round,
                model: settings.model,
                createdAt: new Date().toISOString(),
              },
            ];
            save();
            emit({ type: "room", room: r });
          }
          emit({ type: "phase", phase: "speaking" });
        }
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
