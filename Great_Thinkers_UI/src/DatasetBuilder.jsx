import { useState } from "react";

function DraftReview({ draft, disabled, onReview }) {
  const [content, setContent] = useState(draft.content);
  const [scope, setScope] = useState(draft.scope);
  return (
    <div className="dataset-draft">
      <h4>Review the proposed personality</h4>
      <p>
        Check the claims and edit the profile. Matching excerpts establish where
        the words came from; they do not verify the model's interpretation.
      </p>
      <label>
        Period and perspective
        <input
          value={scope}
          maxLength={300}
          onChange={(e) => setScope(e.target.value)}
        />
      </label>
      <label>
        Profile for new conversations
        <textarea
          rows={12}
          value={content}
          maxLength={6000}
          onChange={(e) => setContent(e.target.value)}
        />
      </label>
      <details>
        <summary>
          Supporting claims and excerpts ({draft.grounded.length})
        </summary>
        {draft.grounded.map((c, i) => (
          <div key={i}>
            <p>{c.claim}</p>
            <blockquote>{c.quote}</blockquote>
            <small>
              {draft.sources.find((s) => s.id === c.sourceId)?.title}
            </small>
          </div>
        ))}
      </details>
      <p className="field-help">
        {draft.model} · AI draft, awaiting your review. Accepting changes new
        chats only.
      </p>
      <div className="insight-actions">
        <button
          disabled={disabled || content.trim().length < 100 || !scope.trim()}
          onClick={() => onReview("accept", content, scope)}
        >
          Accept profile for new chats
        </button>
        <button disabled={disabled} onClick={() => onReview("reject")}>
          Discard draft
        </button>
      </div>
    </div>
  );
}

export default function DatasetBuilder({
  person,
  api,
  onUpdate,
  disabled,
  onBusy,
}) {
  const [title, setTitle] = useState("");
  const [attribution, setAttribution] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [sourceType, setSourceType] = useState("primary");
  const [scope, setScope] = useState(
    person.identityPeriod || "Documented life and ideas",
  );
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const candidates = [
    ...(person.datasetSources || []),
    ...person.sources.filter(
      (s) => !(person.datasetSources || []).some((d) => d.id === s.id),
    ),
  ];
  const run = async (task, message) => {
    setError("");
    setStatus(message);
    setWorking(true);
    onBusy(true);
    try {
      await task();
      setStatus("");
    } catch (e) {
      setError(e.message);
      setStatus("");
    } finally {
      setWorking(false);
      onBusy(false);
    }
  };
  const locked = disabled || working;
  return (
    <section className="research-review dataset-builder">
      <h3>Build this thinker's dataset</h3>
      <p>
        Add writings, letters, interviews, or a reliable biography. Sources stay
        in this workspace until you accept a profile that uses them. Everything
        runs on this computer.
      </p>
      <details>
        <summary>Add source text or a file</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              onUpdate(
                await api(`/people/${person.id}/sources`, "POST", {
                  title,
                  attribution,
                  url,
                  text,
                  sourceType,
                }),
              );
              setTitle("");
              setAttribution("");
              setUrl("");
              setText("");
            }, "Saving source...");
          }}
        >
          <label>
            Source title
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Author and edition / date
            <input
              required
              maxLength={500}
              value={attribution}
              onChange={(e) => setAttribution(e.target.value)}
            />
          </label>
          <label>
            Original source link (optional)
            <input
              type="url"
              maxLength={2000}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label>
            Source type
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
            >
              <option value="primary">
                Primary — their own writing or recorded words
              </option>
              <option value="secondary">
                Secondary — someone writing about them
              </option>
            </select>
          </label>
          <label>
            Load a .txt or .md file
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              disabled={locked}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (!/\.(txt|md)$/i.test(file.name) || file.size > 800000)
                    throw new Error(
                      "Choose a text or Markdown file under 800 KB.",
                    );
                  const value = await file.text();
                  if (value.length > 200000)
                    throw new Error(
                      "Use an excerpt of at most 200,000 characters.",
                    );
                  setText(value);
                  if (!title) setTitle(file.name.replace(/\.(txt|md)$/i, ""));
                  setError("");
                } catch (err) {
                  setError(err.message);
                }
              }}
            />
          </label>
          <label>
            Source text
            <textarea
              rows={7}
              required
              minLength={100}
              maxLength={200000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <p className="field-help">
            Paste a focused excerpt. Keep attribution and use material you may
            copy. Links are saved for reference; this form does not fetch
            webpages.
          </p>
          <button disabled={locked || text.trim().length < 100}>
            Save source to dataset
          </button>
        </form>
      </details>
      <h4>Choose evidence for a profile</h4>
      <p className="field-help">
        Select up to three sources. The model reads up to 12,000 characters from
        each selected text; focused excerpts work best.
      </p>
      {!candidates.length && (
        <p>Connect biographical research or add your first source above.</p>
      )}
      {candidates.map((s) => (
        <label className="dataset-source" key={s.id}>
          <input
            type="checkbox"
            checked={selected.includes(s.id)}
            disabled={
              locked || (!selected.includes(s.id) && selected.length >= 3)
            }
            onChange={(e) =>
              setSelected(
                e.target.checked
                  ? [...selected, s.id]
                  : selected.filter((id) => id !== s.id),
              )
            }
          />
          <span>
            {s.title}
            <small>
              {s.publisher} ·{" "}
              {s.inEdition || person.sources.some((p) => p.id === s.id)
                ? "Available to current edition"
                : "Workspace only"}
            </small>
          </span>
        </label>
      ))}
      <label>
        Period or perspective to portray
        <input
          value={scope}
          maxLength={300}
          onChange={(e) => setScope(e.target.value)}
          placeholder="For example: documented life and ideas in the 1580s"
        />
      </label>
      <button
        disabled={locked || !selected.length || !scope.trim()}
        onClick={() =>
          run(
            async () =>
              onUpdate(
                await api(`/people/${person.id}/profile-draft`, "POST", {
                  sourceIds: selected,
                  scope,
                }),
              ),
            "Preparing profile with local Ollama. This can take up to two minutes...",
          )
        }
      >
        Prepare personality with local AI
      </button>
      {person.profileDraft && (
        <DraftReview
          key={person.profileDraft.id}
          draft={person.profileDraft}
          disabled={locked}
          onReview={(decision, content, scope) =>
            run(
              async () =>
                onUpdate(
                  await api(`/people/${person.id}/profile-review`, "POST", {
                    draftId: person.profileDraft.id,
                    decision,
                    content,
                    scope,
                  }),
                ),
              "Saving your review...",
            )
          }
        />
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
      <p>
        <a href={`/api/people/${person.id}/dataset`} download>
          Download thinker dataset (JSON)
        </a>
      </p>
      <p className="field-help">
        Includes sources and profile history. Chats and private notes are
        excluded. Keep a full data-folder backup for restoring the app; dataset
        import will accompany the future hosting setup.
      </p>
    </section>
  );
}
