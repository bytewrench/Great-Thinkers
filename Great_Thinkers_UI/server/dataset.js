import { createHash, randomUUID } from "node:crypto";
import { generateBrief } from "./brief.js";

const invalid = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
export function prepareSource(body, personId) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const attribution =
    typeof body.attribution === "string" ? body.attribution.trim() : "";
  if (
    !title ||
    title.length > 200 ||
    text.length < 100 ||
    text.length > 200000 ||
    !attribution ||
    attribution.length > 500
  )
    invalid(
      "Add a title, author/edition, and 100–200,000 characters of source text.",
    );
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      invalid("Use a valid https or http source link, or leave it blank.");
    }
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      url.length > 2000
    )
      invalid("Use an http or https link without credentials.");
  }
  if (!["primary", "secondary"].includes(body.sourceType))
    invalid("Identify this as a primary or secondary source.");
  return {
    id: randomUUID(),
    personId,
    title,
    text,
    url,
    publisher: attribution,
    sourceType: body.sourceType,
    license: "User supplied; consult original rights and attribution",
    sha256: createHash("sha256").update(text).digest("hex"),
    createdAt: new Date().toISOString(),
  };
}

export async function draftProfile(p, sources, scope, url, model, signal) {
  if (typeof scope !== "string" || !scope.trim() || scope.length > 300)
    invalid("Describe the period or perspective in up to 300 characters.");
  if (!sources.length)
    invalid(
      "Connect a biography or add source text before preparing a profile.",
    );
  const brief = await generateBrief(
    {
      ...p,
      sources,
      content: `Requested scope: ${scope}. Extract claims from the supplied sources rather than reconstructing the old editorial profile.`,
    },
    url,
    model,
    signal,
    true,
  );
  if (!brief.grounded.length)
    invalid(
      "The model did not return any exact supporting excerpts. Add more relevant source text and try again.",
    );
  const content = `# ${p.name}\n\nScope: ${scope.trim()}\n\nDocumented perspective (review each claim against its excerpt):\n${brief.grounded.map((c) => `- ${c.claim}`).join("\n")}\n\nConversation: Speak naturally in first person as an AI portrayal, in concise modern language. Preserve the documented perspective. Do not invent personal memories or private facts. Distinguish modern interpretation from documented views; acknowledge gaps in the available evidence.`;
  return {
    ...brief,
    id: randomUUID(),
    baseVersion: p.identityVersion,
    scope: scope.trim(),
    content,
    generatedAt: new Date().toISOString(),
    sourceIds: sources.map((s) => s.id),
  };
}
