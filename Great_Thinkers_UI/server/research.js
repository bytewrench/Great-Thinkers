const UA =
  "GreatThinkers/1.0 (personal research; https://github.com/bytewrench/Great-Thinkers)";
export async function wiki(params) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    ...params,
  });
  const response = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error("Wikipedia is unavailable. Please try again shortly.");
  const data = await response.json();
  if (data.error)
    throw new Error("Wikipedia could not complete this research request.");
  return data;
}
export async function humanEntities(ids) {
  if (!ids.length) return new Set();
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({
    action: "wbgetentities",
    format: "json",
    ids: ids.join("|"),
    props: "claims",
  });
  const response = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      "Person verification is temporarily unavailable. Please try again.",
    );
  const data = await response.json();
  if (data.error)
    throw new Error("Person verification failed. Please try again.");
  return new Set(
    Object.values(data.entities || {})
      .filter((e) =>
        e.claims?.P31?.some((c) => c.mainsnak?.datavalue?.value?.id === "Q5"),
      )
      .map((e) => e.id),
  );
}
export async function searchPeople(
  query,
  request = wiki,
  verify = humanEntities,
) {
  const data = await request({
    generator: "search",
    gsrsearch: query,
    gsrlimit: "8",
    gsrnamespace: "0",
    prop: "extracts|pageprops|pageimages|description",
    exintro: "1",
    explaintext: "1",
    exsentences: "2",
    piprop: "thumbnail",
    pithumbsize: "160",
  });
  const pages = data.query?.pages || [];
  const humans = await verify(
    pages.map((p) => p.pageprops?.wikibase_item).filter(Boolean),
  );
  return pages
    .filter(
      (p) =>
        !Object.hasOwn(p.pageprops || {}, "disambiguation") &&
        humans.has(p.pageprops?.wikibase_item),
    )
    .sort((a, b) => a.index - b.index)
    .map((p) => ({
      pageId: p.pageid,
      name: p.title,
      description: p.description || p.extract?.slice(0, 350) || "",
      image: p.thumbnail?.source || "",
    }));
}
export async function researchPage(
  pageId,
  request = wiki,
  verify = humanEntities,
) {
  const data = await request({
    pageids: String(pageId),
    prop: "extracts|info|pageprops|pageimages",
    explaintext: "1",
    inprop: "url",
    piprop: "thumbnail",
    pithumbsize: "480",
  });
  const page = data.query?.pages?.[0];
  if (
    !page ||
    page.missing ||
    !page.extract ||
    Object.hasOwn(page.pageprops || {}, "disambiguation")
  )
    throw new Error(
      "This page does not have a usable biography. Choose a specific person.",
    );
  const entity = page.pageprops?.wikibase_item;
  if (!entity || !(await verify([entity])).has(entity))
    throw new Error(
      "Choose a biographical page about a person, rather than a book, idea, or organization.",
    );
  const text = page.extract.slice(0, 90000);
  return {
    name: page.title,
    biography: text
      .split("\n")
      .filter(Boolean)
      .slice(0, 2)
      .join("\n")
      .slice(0, 2500),
    image: page.thumbnail?.source || "",
    source: {
      id: `wiki-${page.pageid}`,
      title: page.title,
      url: page.fullurl || `https://en.wikipedia.org/?curid=${page.pageid}`,
      revision: page.lastrevid,
      accessedAt: new Date().toISOString(),
      text,
      publisher: "Wikipedia",
      license: "CC BY-SA 4.0",
    },
  };
}

export function evidenceFor(person, question) {
  const stopwords = new Set(
    "about after again also another answer before between concrete could each example explain first from give have helps into keep last more most much myself only ourselves paragraph person please previous question reply said same should showing simple simply some speaker than that their them then there these they this those through under very what when where which while whom with words work would your yourself yourselves".split(
      " ",
    ),
  );
  const words = [
    ...new Set(question.toLowerCase().match(/[\p{L}]{4,}/gu) || []),
  ].filter((w) => !stopwords.has(w));
  return person.sources
    .map((source) => {
      const chunks = source.passages
        ? source.passages.map((p) => `[${p.locator}] ${p.text}`)
        : source.text
            .split(/\n\s*\n/)
            .filter(Boolean)
            .flatMap((paragraph) => {
              const parts = [];
              let remaining = paragraph;
              while (remaining.length > 1300) {
                const boundary = remaining.lastIndexOf(" ", 1300);
                const cut = boundary > 650 ? boundary : 1300;
                parts.push(remaining.slice(0, cut));
                remaining = remaining.slice(cut).trimStart();
              }
              if (remaining) parts.push(remaining);
              return parts;
            });
      if (!chunks.length) chunks.push("No passage available.");
      const frequency = new Map(
        words.map((word) => [
          word,
          chunks.filter((c) => c.toLowerCase().includes(word)).length,
        ]),
      );
      const ranked = chunks
        .map((text, index) => ({
          text,
          index,
          score: words.reduce(
            (n, w) =>
              n +
              (text.toLowerCase().includes(w)
                ? Math.log(1 + chunks.length / (1 + frequency.get(w)))
                : 0),
            0,
          ),
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index);
      const selected = source.primary
        ? ranked.slice(0, 3)
        : [
            ranked.find((c) => c.index === 0),
            ...ranked.filter((c) => c.index !== 0).slice(0, 2),
          ];
      const { passages: _passages, ...metadata } = source;
      return {
        ...metadata,
        retrievalScore: ranked[0]?.score || 0,
        passageIds: source.passages
          ? selected.map((c) => source.passages[c.index].id)
          : undefined,
        text: selected.map((c) => c.text).join("\n\n[...]\n\n"),
      };
    })
    .sort(
      (a, b) =>
        Number(!!b.primary) - Number(!!a.primary) ||
        b.retrievalScore - a.retrievalScore,
    )
    .slice(0, 3);
}
