import { useState } from "react";
import { Search, BookOpen, Download } from "lucide-react";

export default function Notebook({
  insights,
  rooms,
  onOpenRoom,
  onSave,
  working,
  Markdown,
  SourceList,
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const filtered = insights.filter((i) =>
    [i.title, i.question, i.content, i.note, ...i.people.map((p) => p.name)]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(insights, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "great-thinkers-insights.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="notebook">
      <div className="notebook-heading">
        <div>
          <div className="eyebrow">YOUR NOTEBOOK</div>
          <h1>Ideas worth keeping.</h1>
        </div>
        <button disabled={!insights.length} onClick={download}>
          <Download size={16} /> Export notebook
        </button>
      </div>
      <p>
        Save useful answers, add your own reflections, and find them later.
        These are AI interpretations, not verified facts. Your notebook never
        changes a thinker's identity.
      </p>
      <label className="search-box">
        <Search size={17} />
        <input
          aria-label="Search insights"
          placeholder="Search ideas, people, or your notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="field-help">
        {filtered.length} {filtered.length === 1 ? "insight" : "insights"}
      </p>
      {!filtered.length && (
        <div className="empty">
          <BookOpen />
          <h2>
            {insights.length
              ? "No matching insights"
              : "Keep your first insight"}
          </h2>
          <p>
            {insights.length
              ? "Try another word or person's name."
              : "Use Save insight beneath a completed answer in any conversation."}
          </p>
        </div>
      )}
      {filtered.map((i) => (
        <article className="insight-card" key={i.id}>
          <div className="eyebrow">AI INTERPRETATION</div>
          <h2>{i.title}</h2>
          <p className="field-help">
            {i.people.map((p) => p.name).join(", ")} ·{" "}
            {new Date(i.createdAt).toLocaleDateString()} ·{" "}
            {i.model || "Model not recorded"}
          </p>
          <Markdown>{i.content}</Markdown>
          {i.sources.length > 0 ? (
            <details>
              <summary>Sources supplied to the original answer</summary>
              <SourceList sources={i.sources} />
            </details>
          ) : (
            <p className="field-help">
              No research sources were attached to this answer.
            </p>
          )}
          {i.note && (
            <div className="insight-note">
              <strong>Your reflection</strong>
              <p>{i.note}</p>
            </div>
          )}
          {editing?.id === i.id ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await onSave(editing)) setEditing(null);
              }}
            >
              <label>
                Insight title
                <input
                  aria-label="Insight title"
                  maxLength={120}
                  required
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                />
              </label>
              <label>
                Your reflection
                <textarea
                  aria-label="Your reflection"
                  maxLength={3000}
                  rows={3}
                  value={editing.note}
                  onChange={(e) =>
                    setEditing({ ...editing, note: e.target.value })
                  }
                />
              </label>
              <div className="insight-actions">
                <button disabled={working} className="primary">
                  Save reflection
                </button>
                <button type="button" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="insight-actions">
              <button onClick={() => setEditing(i)}>
                Edit title / reflection
              </button>
              {rooms.some((r) => r.id === i.roomId) ? (
                <button onClick={() => onOpenRoom(i.roomId)}>
                  Open original conversation
                </button>
              ) : (
                <span className="field-help">
                  Original conversation removed; this copy is preserved.
                </span>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
