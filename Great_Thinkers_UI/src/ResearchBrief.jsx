export default function ResearchBrief({
  person,
  working,
  onGenerate,
  onReview,
}) {
  const brief = person.aiBrief || person.supplementalBrief;
  return (
    <section className="research-review">
      <h3>AI research brief</h3>
      <p>
        A local model can add context, ideas, works, and research leads. Its
        recalled knowledge is not automatically a verified fact.
      </p>
      <button disabled={working} onClick={onGenerate}>
        {working
          ? "Working..."
          : brief
            ? "Prepare a fresh brief"
            : "Prepare with local AI"}
      </button>
      {brief && (
        <>
          <p className="field-help">
            {brief.model} · {new Date(brief.generatedAt).toLocaleDateString()} ·{" "}
            {person.aiBrief
              ? "Awaiting your review; not used in replies"
              : "Reviewed by you; still not independently verified"}
          </p>
          <h4>Claims with source excerpts</h4>
          {!brief.grounded.length && (
            <p>No exact supporting excerpts were returned.</p>
          )}
          {brief.grounded.map((item, i) => (
            <div key={i}>
              <p>{item.claim}</p>
              <blockquote>{item.quote}</blockquote>
              <a
                href={brief.sources.find((s) => s.id === item.sourceId)?.url}
                target="_blank"
                rel="noreferrer"
              >
                Read supplied source
              </a>
            </div>
          ))}
          <h4>Additional context to verify</h4>
          <p className="field-help">
            Recalled by the model. May be incomplete, outdated, or wrong.
          </p>
          {brief.context.map((item, i) => (
            <div key={i}>
              <strong>{item.topic}</strong>
              <p>{item.summary}</p>
            </div>
          ))}
          <h4>Next research questions</h4>
          <ul>
            {brief.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
          {person.aiBrief && (
            <>
              <p>
                Using this brief allows it as secondary context in future
                replies. It cannot rewrite the fixed identity profile. Review
                the claims first; model knowledge is not a substitute for
                primary sources.
              </p>
              <div className="insight-actions">
                <button disabled={working} onClick={() => onReview("accept")}>
                  Use reviewed brief
                </button>
                <button disabled={working} onClick={() => onReview("reject")}>
                  Discard draft
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
