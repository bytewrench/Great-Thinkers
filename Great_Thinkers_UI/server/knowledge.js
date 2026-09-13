import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const packs = JSON.parse(
  readFileSync(new URL("../knowledge/packs.json", import.meta.url), "utf8"),
);
const cache = new Map();
export function sourceFor(packId) {
  if (cache.has(packId)) return cache.get(packId);
  const pack = packs.find((p) => p.id === packId);
  if (!pack)
    throw new Error("This identity's knowledge edition is unavailable.");
  const original = readFileSync(
    new URL(`../knowledge/originals/pg${pack.book}.txt`, import.meta.url),
  );
  if (createHash("sha256").update(original).digest("hex") !== pack.sha256)
    throw new Error(
      "Primary source has changed. Review a new edition before using it.",
    );
  const full = original.toString("utf8").replaceAll("\r\n", "\n");
  const start =
    pack.book === "2680"
      ? "\nTHE FIRST BOOK\n"
      : pack.book === "7370"
        ? "\nCHAPTER. I.\n"
        : "\nA spectre is haunting Europe";
  const end =
    pack.book === "2680" ? "\nAPPENDIX" : "*** END OF THE PROJECT GUTENBERG";
  const from = full.indexOf(start),
    to = full.indexOf(end, from);
  if (from < 0 || to <= from)
    throw new Error("Primary source boundaries could not be verified.");
  const body = full.slice(from, to).trim();
  let section = "Preamble",
    paragraph = 0;
  const passages = body
    .split(/\n\s*\n/)
    .filter(Boolean)
    .flatMap((block) => {
      const heading = block.match(
        /^(THE [A-Z]+ BOOK|CHAPTER\. [IVXLCDM]+\.|[IVX]+\.\n[A-Z][A-Z ,\n]+$)/,
      );
      if (heading) section = heading[1].replaceAll("\n", " ");
      const numbered = block.match(/^(Sect\. \d+\.|[IVXLCDM]+\.)\s/);
      const locator = `${section}${numbered ? ` / ${numbered[1]}` : ""} / paragraph ${++paragraph}`;
      let remaining = block.replace(/\s+/g, " ").trim();
      const parts = [];
      while (remaining.length) {
        const boundary =
          remaining.length > 1200
            ? remaining.lastIndexOf(" ", 1200)
            : remaining.length;
        const cut = boundary > 0 ? boundary : 1200;
        parts.push({
          locator: `${locator}${parts.length ? ` (continued ${parts.length + 1})` : ""}`,
          text: remaining.slice(0, cut),
        });
        remaining = remaining.slice(cut).trim();
      }
      return parts;
    })
    .map((p, i) => ({ ...p, id: `${pack.id}:${i + 1}` }));
  const source = {
    id: pack.id,
    title: pack.title,
    url: pack.url,
    publisher: "Project Gutenberg",
    license:
      "Public domain in the USA; Project Gutenberg license included with original",
    edition: pack.edition,
    sha256: pack.sha256,
    primary: true,
    passages,
    text: passages.map((p) => `[${p.locator}] ${p.text}`).join("\n\n"),
  };
  cache.set(packId, source);
  return source;
}

export function identityService(store) {
  const archive = (identity) => {
    const id = `${identity.id}:${identity.version}`;
    if (!store.get("identityVersions", id))
      store.put("identityVersions", { ...identity, personId: identity.id, id });
  };
  const person = (id, version) => {
    const p = store.get("people", id);
    if (!p)
      throw Object.assign(new Error("Person not found."), { status: 404 });
    let active = store.get("identities", id);
    if (!active)
      active = store.put("identities", {
        id,
        name: p.name,
        content: p.content,
        version: createHash("sha256").update(p.content).digest("hex"),
        createdAt: new Date().toISOString(),
      });
    archive(active);
    const identity = version
      ? store.get("identityVersions", `${id}:${version}`)
      : active;
    if (!identity)
      throw Object.assign(
        new Error(
          "This conversation's identity edition is missing. Restore its data before continuing.",
        ),
        { status: 409 },
      );
    const primary = (identity.packIds || []).map(sourceFor);
    if (
      primary.some(
        (source) => identity.packHashes?.[source.id] !== source.sha256,
      )
    )
      throw Object.assign(
        new Error(
          "This identity's primary source version changed. Restore its original edition before continuing.",
        ),
        { status: 409 },
      );
    return {
      ...p,
      content: identity.content,
      identityVersion: identity.version,
      identityPeriod: identity.period,
      identityPackIds: identity.packIds || [],
      availableEdition: packs.find(
        (pack) =>
          pack.name === p.name && !(identity.packIds || []).includes(pack.id),
      ),
      sources: [...primary, ...p.sources.filter((s) => !s.primary)],
    };
  };
  const pin = (r) => {
    r.identityPins ||= {};
    for (const id of r.peopleIds)
      r.identityPins[id] ||=
        r.messages
          .findLast((m) => m.identities?.some((i) => i.personId === id))
          ?.identities.find((i) => i.personId === id)?.version ||
        person(id).identityVersion;
    return r;
  };
  const accept = (id, packId, baseVersion) => {
    const p = person(id),
      pack = packs.find((x) => x.id === packId && x.name === p.name);
    if (p.identityVersion !== baseVersion)
      throw Object.assign(
        new Error("The identity changed. Reload and review the edition again."),
        { status: 409 },
      );
    if (!pack)
      throw Object.assign(
        new Error("Choose an edition prepared for this thinker."),
        { status: 400 },
      );
    sourceFor(packId);
    const version = createHash("sha256")
      .update(JSON.stringify(pack))
      .digest("hex");
    const identity = {
      id,
      name: p.name,
      content: pack.content,
      period: pack.period,
      packIds: [packId],
      packHashes: { [packId]: pack.sha256 },
      version,
      previousVersion: baseVersion,
      createdAt: new Date().toISOString(),
    };
    archive(identity);
    store.put("identityReviews", {
      id: `${id}:${version}`,
      personId: id,
      baseVersion,
      version,
      packId,
      rationale: pack.rationale,
      decision: "accept",
      reviewedAt: identity.createdAt,
    });
    store.put("identities", identity);
    return person(id);
  };
  return { person, pin, accept };
}
