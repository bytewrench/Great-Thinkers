import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import DatasetBuilder from "./DatasetBuilder.jsx";
import FeaturedMinds from "./FeaturedMinds.jsx";
import ResearchBrief from "./ResearchBrief.jsx";
import DiscussionMeter from "./DiscussionMeter.jsx";
import TextSizeControl from "./TextSizeControl.jsx";
import Notebook from "./Notebook.jsx";
import ResponseControls from "./ResponseControls.jsx";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Download,
  Globe2,
  Heart,
  Library,
  LoaderCircle,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Users,
  X,
} from "lucide-react";

async function api(path, method = "GET", body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "The request could not be completed.");
  return data;
}
const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .filter((c) => /\p{L}/u.test(c))
    .slice(0, 2)
    .join("");
const shortCategory = (category) =>
  ({
    "Arts Literature and Culture": "Arts & culture",
    "Philosophy and Ethics": "Philosophy",
    "Politics Strategy and Leadership": "Leadership",
    "Science and Mathematics": "Science",
    "Your discoveries": "Your discoveries",
  })[category] || category;
const questions = [
  "What makes a life well lived?",
  "Is imagination more important than knowledge?",
  "What would you question about the world today?",
];
function Avatar({ person, large = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <span
      className={`avatar ${large ? "large" : ""} tone-${(person?.name?.charCodeAt(0) || 0) % 4}`}
    >
      {person?.image && !imageFailed ? (
        <img
          src={person.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initials(person?.name || "?")
      )}
    </span>
  );
}
function Modal({ title, children, close, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon" onClick={close} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Markdown({ children }) {
  return (
    <div className="prose">
      <ReactMarkdown
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
          img: ({ alt }) => <span>{alt || "[Image omitted]"}</span>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
function SourceList({ sources }) {
  return (
    <div className="sources">
      {sources.map((s, i) => (
        <div key={s.id}>
          <a href={s.url} target="_blank" rel="noreferrer">
            <span className="source-number">{i + 1}</span>
            <span>
              <strong>{s.title}</strong>
              <small>
                {s.publisher} ·{" "}
                {s.accessedAt
                  ? `Retrieved ${new Date(s.accessedAt).toLocaleDateString()}`
                  : "Bundled primary source"}{" "}
                · {s.license}
                {s.edition && <> · {s.edition}</>}
              </small>
            </span>
            <ArrowUpRight size={16} />
          </a>
          {s.excerpt && (
            <details className="source-excerpt">
              <summary>Read the passages used</summary>
              <p>{s.excerpt}</p>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [textSize, setTextSize] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("great-thinkers-text-size"));
      return saved >= 14 && saved <= 24 ? saved : 16;
    } catch {
      return 16;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("great-thinkers-text-size", String(textSize));
    } catch {
      /* Controls work without storage. */
    }
  }, [textSize]);
  const [data, setData] = useState(null);
  const [connection, setConnection] = useState({
    online: false,
    models: [],
    checking: true,
  });
  const [view, setView] = useState("library");
  const [activeId, setActiveId] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All minds");
  const [detail, setDetail] = useState(null);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamRoomId, setStreamRoomId] = useState(null);
  const telemetry = useRef({
    bytes: 0,
    chunks: 0,
    textChunks: 0,
    samples: [],
    startedAt: 0,
    lastAt: 0,
  });
  const [phase, setPhase] = useState("speaking");
  const [removeId, setRemoveId] = useState(null);
  const [working, setWorking] = useState(false);
  const [draft, setDraft] = useState("");
  const [target, setTarget] = useState("");
  const [selection, setSelection] = useState([]);
  const [researchName, setResearchName] = useState("");
  const [results, setResults] = useState(null);
  const [researchFor, setResearchFor] = useState(null);
  const [autoBrief, setAutoBrief] = useState(true);
  const [notes, setNotes] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [roomTitle, setRoomTitle] = useState("");
  const end = useRef(null);
  const scrollArea = useRef(null);
  const follow = useRef(true);
  const currentRoom = data?.rooms.find((r) => r.id === activeId);
  const detailPerson = data?.people.find((p) => p.id === detail);

  useEffect(() => {
    let live = true;
    api("/state")
      .then((state) => {
        if (live) setData(state);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    const check = () =>
      api("/models")
        .then((state) => {
          if (live) setConnection({ ...state, checking: false });
        })
        .catch(() => {
          if (live)
            setConnection({ online: false, models: [], checking: false });
        });
    check();
    const interval = setInterval(check, 30000);
    return () => {
      live = false;
      clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    if (follow.current) end.current?.scrollIntoView({ behavior: "instant" });
  }, [currentRoom?.messages]);
  const updatePerson = (p) =>
    setData((d) => ({
      ...d,
      people: [...d.people.filter((x) => x.id !== p.id), p],
    }));
  const updateRoom = (r) =>
    setData((d) => ({
      ...d,
      rooms: [r, ...d.rooms.filter((x) => x.id !== r.id)],
    }));
  async function act(fn) {
    setWorking(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  function openRoom(id) {
    if (busy) return;
    setActiveId(id);
    setView("chat");
    setTarget("");
    setDraft("");
    setMobileNav(false);
    follow.current = true;
  }
  async function createRoom(ids) {
    const r = await api("/rooms", "POST", { peopleIds: ids });
    updateRoom(r);
    setDetail(null);
    setModal(null);
    openRoom(r.id);
  }
  function openPicker(invite = false) {
    setSelection(invite ? currentRoom.peopleIds : []);
    setPickerSearch("");
    setModal(invite ? "invite" : "roundtable");
  }
  function openResearch(p) {
    setResearchFor(p?.id || null);
    setResearchName(p?.name || "");
    setResults(null);
    setDetail(null);
    setModal("research");
  }
  async function send(text = draft, retry = false, everyone = false) {
    if (
      busy ||
      working ||
      !currentRoom ||
      !connection.online ||
      !connection.models.some(
        (m) => m.name === (currentRoom.model || data.settings.model),
      ) ||
      (!text.trim() && !retry)
    )
      return;
    setStreamRoomId(activeId);
    telemetry.current = {
      bytes: 0,
      chunks: 0,
      textChunks: 0,
      samples: [],
      startedAt: performance.now(),
      lastAt: 0,
    };
    setBusy(true);
    setPhase("speaking");
    setError("");
    follow.current = true;
    let accepted = false;
    try {
      const response = await fetch(`/api/rooms/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          target: everyone ? undefined : target || undefined,
          retry,
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      accepted = true;
      setDraft("");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      function event(line) {
        if (!line.trim()) return;
        const e = JSON.parse(line);
        if (e.type === "phase") setPhase(e.phase);
        if (e.type === "room") updateRoom(e.room);
        if (e.type === "token") telemetry.current.textChunks += 1;
        if (e.type === "token")
          setData((d) => ({
            ...d,
            rooms: d.rooms.map((r) =>
              r.id === activeId
                ? {
                    ...r,
                    messages: r.messages.map((m) =>
                      m.id === e.id ? { ...m, content: m.content + e.text } : m,
                    ),
                  }
                : r,
            ),
          }));
        if (e.type === "error") setError(e.error);
        if (e.type === "done") finished = true;
      }
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const now = performance.now(),
          measured = telemetry.current;
        measured.bytes += value.byteLength;
        measured.chunks += 1;
        measured.lastAt = now;
        measured.samples = [
          ...measured.samples.filter((s) => now - s.at < 8000),
          { at: now, bytes: value.byteLength },
        ].slice(-2000);
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        lines.forEach(event);
      }
      buffer += decoder.decode();
      event(buffer);
      if (!finished)
        throw new Error(
          "The connection was interrupted. Your saved conversation will reload.",
        );
    } catch (e) {
      setError(e.message);
      if (accepted) {
        try {
          setData(await api("/state"));
        } catch {
          /* Preserve the displayed conversation when offline. */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  function exportRoom() {
    const text =
      `# ${currentRoom.title}\n\nAI simulations, not the real people.\n\n` +
      currentRoom.messages
        .map(
          (m) =>
            `## ${m.role === "user" ? "You" : m.name}\n\n${m.content}${m.status && m.status !== "complete" ? "\n\n[Reply incomplete]" : ""}\n\n${(m.sources || []).map((s, i) => `[${i + 1}] ${s.title}: ${s.url} (${s.license})`).join("\n")}`,
        )
        .join("\n\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "great-thinkers-conversation.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!data)
    return (
      <div className="loading-page">
        <BookOpen size={40} />
        <h1>Great Thinkers</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => window.location.reload()}>Try again</button>
          </>
        ) : (
          <p>Opening your library…</p>
        )}
      </div>
    );
  const people = [...data.people].sort((a, b) => a.name.localeCompare(b.name));
  const categories = [
    "All minds",
    ...new Set(people.map((p) => shortCategory(p.category))),
  ];
  const filtered = people.filter(
    (p) =>
      (view !== "favorites" || p.favorite) &&
      (category === "All minds" || shortCategory(p.category) === category) &&
      `${p.name} ${p.biography} ${p.content}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const installed = connection.models.some(
    (m) =>
      m.name ===
      (view === "chat" && currentRoom
        ? currentRoom.model
        : data.settings.model),
  );
  const modelReady = connection.online && installed;

  return (
    <div className="app-shell" style={{ "--reading-size": `${textSize}px` }}>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <button
          className="brand"
          disabled={busy}
          onClick={() => {
            setView("library");
            setMobileNav(false);
          }}
        >
          <span className="brand-mark">
            <BookOpen size={24} />
          </span>
          <span>
            Great Thinkers<small>A LIBRARY OF MINDS</small>
          </span>
        </button>
        <button
          className="new-conversation"
          disabled={busy}
          onClick={() => openPicker()}
        >
          <Plus size={18} /> New conversation
        </button>
        <nav aria-label="Main navigation">
          <button
            className={view === "library" ? "selected" : ""}
            disabled={busy}
            onClick={() => {
              setView("library");
              setCategory("All minds");
              setQuery("");
              setMobileNav(false);
            }}
          >
            <Library size={18} /> The library <span>{people.length}</span>
          </button>
          <button
            className={view === "favorites" ? "selected" : ""}
            disabled={busy}
            onClick={() => {
              setView("favorites");
              setCategory("All minds");
              setQuery("");
              setMobileNav(false);
            }}
          >
            <Heart size={18} /> Saved minds{" "}
            <span>{people.filter((p) => p.favorite).length}</span>
          </button>
          <button
            className={view === "notebook" ? "selected" : ""}
            disabled={busy}
            onClick={() => {
              setView("notebook");
              setMobileNav(false);
            }}
          >
            <BookOpen size={18} /> Insights{" "}
            <span>{(data.insights || []).length}</span>
          </button>
        </nav>
        <div className="sidebar-label">YOUR CONVERSATIONS</div>
        <div className="conversation-list">
          {!data.rooms.length ? (
            <p className="sidebar-hint">
              Good conversations start
              <br />
              with a little curiosity.
            </p>
          ) : (
            data.rooms.map((r) => (
              <div className="history-row" key={r.id}>
                <button
                  disabled={busy}
                  className={
                    view === "chat" && r.id === activeId ? "active-room" : ""
                  }
                  onClick={() => openRoom(r.id)}
                >
                  <MessageCircle size={16} />
                  <span>
                    {r.title}
                    <small>
                      {r.peopleIds
                        .map((id) =>
                          people
                            .find((p) => p.id === id)
                            ?.name.split(" ")
                            .at(-1),
                        )
                        .join(" · ")}
                    </small>
                  </span>
                </button>
                <button
                  className="history-remove"
                  disabled={busy}
                  title={`Remove ${r.title} from history`}
                  aria-label={`Remove ${r.title} from history`}
                  onClick={() => {
                    setRemoveId(r.id);
                    setModal("delete");
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
        <button
          className="removed-chats"
          disabled={busy}
          onClick={() => setModal("removed")}
        >
          <Trash2 size={14} /> Removed chats ({(data.removedRooms || []).length}
          )
        </button>
        <div className="sidebar-bottom">
          <div className="local-note">
            <ShieldCheck size={17} />
            <span>
              Your thoughts stay here
              <small>Conversations saved on this computer</small>
            </span>
          </div>
          <button onClick={() => setModal("settings")} disabled={busy}>
            <Settings size={17} /> Settings{" "}
            <span className={`status-dot ${modelReady ? "online" : ""}`} />
          </button>
        </div>
      </aside>
      <main className={view === "chat" ? "chat-main" : ""}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span>THE LIBRARY OF MINDS</span>
            <ChevronRight size={14} />
            <span>
              {view === "chat"
                ? "Conversation"
                : view === "favorites"
                  ? "Saved minds"
                  : view === "notebook"
                    ? "Insights"
                    : "Explore"}
            </span>
          </div>
          <button
            className="connection"
            disabled={busy}
            onClick={() => setModal("settings")}
          >
            <span className={`status-dot ${modelReady ? "online" : ""}`} />
            {connection.checking
              ? "Connecting…"
              : modelReady
                ? "Local AI connected"
                : "Set up local AI"}
          </button>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button
              className="icon"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {view === "notebook" ? (
          <Notebook
            insights={data.insights || []}
            rooms={data.rooms}
            onOpenRoom={openRoom}
            working={working}
            Markdown={Markdown}
            SourceList={SourceList}
            onDelete={async (id) => {
              let deleted = false;
              await act(async () => {
                await api(`/insights/${id}`, "DELETE");
                setData((d) => ({
                  ...d,
                  insights: d.insights.filter((i) => i.id !== id),
                }));
                deleted = true;
              });
              return deleted;
            }}
            onSave={async (insight) => {
              let saved = false;
              await act(async () => {
                const updated = await api(`/insights/${insight.id}`, "PATCH", {
                  title: insight.title,
                  note: insight.note,
                });
                setData((d) => ({
                  ...d,
                  insights: d.insights.map((i) =>
                    i.id === updated.id ? updated : i,
                  ),
                }));
                saved = true;
              });
              return saved;
            }}
          />
        ) : view !== "chat" ? (
          <div className="library-page">
            <section className="hero">
              <div className="eyebrow">
                <span /> IDEAS HAVE NO EXPIRATION DATE
              </div>
              <h1>
                A meeting of minds.
                <br />
                <em>Across time.</em>
              </h1>
              <p>
                Ask a question. Challenge an idea. Find a new perspective.
                <br className="desktop-break" /> A hundred remarkable minds, and
                room for one more: yours.
              </p>
              <div className="hero-actions">
                <button className="primary" onClick={() => openPicker()}>
                  <Users size={17} /> Start a roundtable{" "}
                  <ArrowUpRight size={17} />
                </button>
                <button className="text-button" onClick={() => openResearch()}>
                  <Plus size={17} /> Discover someone new
                </button>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="orbit orbit-three" />
                <span className="orbit-word word-one">CURIOSITY</span>
                <span className="orbit-word word-two">PERSPECTIVE</span>
                <div className="art-center">&</div>
                <span className="orbit-point point-one" />
                <span className="orbit-point point-two" />
                <span className="orbit-point point-three" />
              </div>
            </section>
            {view === "library" && !query && category === "All minds" && (
              <FeaturedMinds
                people={people}
                Avatar={Avatar}
                shortCategory={shortCategory}
                working={working || busy}
                onMeet={(p) => {
                  setDetail(p.id);
                  setNotes(p.notes);
                }}
                onStart={(ids, question) =>
                  act(async () => {
                    await createRoom(ids);
                    setDraft(question);
                  })
                }
              />
            )}
            <section className="catalog">
              <div className="section-heading catalog-heading">
                <div>
                  <h2>
                    {view === "favorites"
                      ? "Your saved minds"
                      : "Explore the library"}
                  </h2>
                  <p>
                    {filtered.length} {filtered.length === 1 ? "mind" : "minds"}{" "}
                    to get to know
                  </p>
                </div>
                <label className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Search minds and ideas"
                    placeholder="Search a name or an idea…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div
                className="category-tabs"
                role="group"
                aria-label="Filter minds by category"
              >
                {categories.map((c) => (
                  <button
                    key={c}
                    className={category === c ? "active" : ""}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="people-grid">
                {filtered.map((p) => (
                  <article className="person-card" key={p.id}>
                    <button
                      className="person-main"
                      onClick={() => {
                        setDetail(p.id);
                        setNotes(p.notes);
                      }}
                    >
                      <Avatar person={p} />
                      <small>{shortCategory(p.category)}</small>
                      <h3>{p.name}</h3>
                      <p>{p.biography.replace(/^Background & Era:\s*/, "")}</p>
                    </button>
                    <div className="person-footer">
                      <span>
                        {p.sources.length ? (
                          <>
                            <Globe2 size={12} /> Source connected
                          </>
                        ) : (
                          "From the original collection"
                        )}
                      </span>
                      <button
                        className={`icon favorite ${p.favorite ? "saved" : ""}`}
                        disabled={working}
                        aria-label={`${p.favorite ? "Unsave" : "Save"} ${p.name}`}
                        aria-pressed={p.favorite}
                        onClick={() =>
                          act(async () =>
                            updatePerson(
                              await api(`/people/${p.id}`, "PATCH", {
                                favorite: !p.favorite,
                              }),
                            ),
                          )
                        }
                      >
                        <Heart
                          size={16}
                          fill={p.favorite ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!filtered.length && (
                <div className="empty">
                  <Search size={30} />
                  <h3>
                    {view === "favorites"
                      ? "Make this library your own"
                      : "An undiscovered mind?"}
                  </h3>
                  <p>
                    {view === "favorites"
                      ? "Save people using the heart on their card."
                      : "Try another name or research someone new."}
                  </p>
                  <button onClick={() => openResearch()}>
                    <Plus size={16} /> Discover a person
                  </button>
                </div>
              )}
            </section>
            <footer className="page-footer">
              <BookOpen size={16} />
              <span>Inspired by real lives. Open to new ideas.</span>
              <button onClick={() => setModal("about")}>
                About these conversations <CircleHelp size={14} />
              </button>
            </footer>
          </div>
        ) : currentRoom ? (
          <>
            <div className="room-header">
              <div>
                <button
                  className="room-title"
                  disabled={busy}
                  onClick={() => {
                    setRoomTitle(currentRoom.title);
                    setModal("rename");
                  }}
                >
                  <h1>{currentRoom.title}</h1>
                </button>
                <div className="participants">
                  {currentRoom.peopleIds.map((id) => {
                    const p = people.find((p) => p.id === id);
                    return (
                      <button
                        key={id}
                        disabled={busy}
                        onClick={() => {
                          setDetail(id);
                          setNotes(p.notes);
                        }}
                      >
                        <Avatar person={p} />
                        <span>{p.name}</span>
                      </button>
                    );
                  })}
                  <button
                    className="invite-button"
                    disabled={busy}
                    onClick={() => openPicker(true)}
                  >
                    <Plus size={15} /> Invite / manage
                  </button>
                </div>
              </div>
              <div className="room-tools">
                <TextSizeControl value={textSize} onChange={setTextSize} />
                <button
                  className="icon"
                  title="Export conversation"
                  aria-label="Export conversation"
                  disabled={busy || !currentRoom.messages.length}
                  onClick={exportRoom}
                >
                  <Download size={18} />
                </button>
                <button
                  className="icon"
                  aria-label="Remove conversation from history"
                  disabled={busy}
                  onClick={() => {
                    setRemoveId(activeId);
                    setModal("delete");
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
            <p className="room-model">
              Conversation model: {currentRoom.model || data.settings.model}.
              Changing the default applies to new conversations. Thinker
              editions are also fixed for this chat.
            </p>
            {currentRoom.peopleIds.some(
              (id) =>
                currentRoom.identityPins?.[id] &&
                currentRoom.identityPins[id] !==
                  people.find((p) => p.id === id)?.identityVersion,
            ) && (
              <p className="notice">
                A newer thinker edition is available. This chat keeps its
                original profile; start a new chat to use the new edition.
              </p>
            )}
            <ResponseControls
              room={currentRoom}
              target={target}
              disabled={busy || working}
              onChange={(preferences) =>
                act(async () =>
                  updateRoom(
                    await api(`/rooms/${activeId}`, "PATCH", preferences),
                  ),
                )
              }
            />
            {(currentRoom.peopleIds.length > 1 ||
              (busy && streamRoomId === currentRoom.id)) && (
              <DiscussionMeter
                room={currentRoom}
                telemetry={telemetry}
                busy={busy && streamRoomId === currentRoom.id}
                phase={phase}
                onContinue={() =>
                  send(
                    "Continue the previous topic for another two short rounds. Engage each other's specific points; preserve genuine differences and do not force agreement.",
                    false,
                    true,
                  )
                }
              />
            )}
            <div
              className="messages"
              ref={scrollArea}
              onScroll={() => {
                const el = scrollArea.current;
                follow.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 100;
              }}
            >
              {!currentRoom.messages.length && (
                <div className="conversation-welcome">
                  <span className="welcome-mark">
                    <Sparkles size={27} />
                  </span>
                  <div className="eyebrow">
                    A LITTLE CURIOSITY GOES A LONG WAY
                  </div>
                  <h2>Where shall we begin?</h2>
                  <p>
                    {currentRoom.peopleIds.length > 1
                      ? "Ask a question and get one clear answer informed by the people at your table. Important disagreements are included. Switch formats to hear them individually."
                      : "Ask a question and get a short, clear answer. Ask follow-up questions whenever you want more detail."}
                  </p>
                  <div className="question-suggestions">
                    {questions.map((q) => (
                      <button
                        key={q}
                        disabled={!modelReady}
                        onClick={() => send(q)}
                      >
                        {q}
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {currentRoom.messages.map((m, i) => (
                <article key={m.id} className={`message ${m.role}`}>
                  <div className="message-avatar">
                    {m.role === "user" ? (
                      <span className="avatar you">Y</span>
                    ) : m.kind === "synthesis" ? (
                      <span className="avatar synthesis-avatar">
                        <Users size={18} />
                      </span>
                    ) : (
                      <Avatar
                        person={people.find((p) => p.id === m.personId)}
                      />
                    )}
                  </div>
                  <div className="message-body">
                    <div className="message-heading">
                      <strong>{m.role === "user" ? "You" : m.name}</strong>
                      <span>
                        {m.role === "user"
                          ? ""
                          : m.kind === "synthesis"
                            ? "AI SYNTHESIS"
                            : m.voice === "plain"
                              ? "AI PERSPECTIVE"
                              : "AI PORTRAYAL"}
                      </span>
                    </div>
                    {m.watching && (
                      <p className="synthesis-context">
                        Discussion · round {m.round} of 2
                      </p>
                    )}
                    {m.kind === "synthesis" && (
                      <p className="synthesis-context">
                        Informed by{" "}
                        {m.personIds
                          .map(
                            (id) =>
                              people.find((p) => p.id === id)?.name ||
                              "a former participant",
                          )
                          .join(", ")}
                      </p>
                    )}
                    {m.content ? (
                      <Markdown>{m.content}</Markdown>
                    ) : busy && i === currentRoom.messages.length - 1 ? (
                      <p className="thinking">
                        <LoaderCircle size={15} className="spin" /> Considering
                        your question…
                      </p>
                    ) : (
                      <p className="muted">No reply was completed.</p>
                    )}
                    {m.role === "assistant" && m.status === "complete" && (
                      <button
                        className="save-insight"
                        disabled={
                          working ||
                          (data.insights || []).some(
                            (i) =>
                              i.messageId === m.id &&
                              i.roomId === currentRoom.id,
                          )
                        }
                        onClick={() =>
                          act(async () => {
                            const insight = await api("/insights", "POST", {
                              roomId: currentRoom.id,
                              messageId: m.id,
                            });
                            setData((d) => ({
                              ...d,
                              insights: [
                                insight,
                                ...(d.insights || []).filter(
                                  (i) => i.id !== insight.id,
                                ),
                              ],
                            }));
                          })
                        }
                      >
                        <BookOpen size={14} />
                        {(data.insights || []).some(
                          (i) =>
                            i.messageId === m.id && i.roomId === currentRoom.id,
                        )
                          ? "Saved to insights"
                          : "Save insight"}
                      </button>
                    )}
                    {m.sources?.length > 0 && (
                      <details className="message-sources">
                        <summary>
                          {m.sources.length}{" "}
                          {m.sources.length === 1 ? "source" : "sources"}{" "}
                          supplied to this reply
                        </summary>
                        <SourceList sources={m.sources} />
                      </details>
                    )}
                    {m.status && m.status !== "complete" && !busy && (
                      <div className="incomplete">
                        <span>{m.error || "Reply interrupted."}</span>
                        {i === currentRoom.messages.length - 1 && (
                          <button
                            disabled={!modelReady}
                            onClick={() => send("", true)}
                          >
                            Retry reply
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              <div ref={end} />
            </div>
            <div className="composer-area">
              {!modelReady && (
                <div className="offline-note">
                  {connection.online
                    ? "Choose an installed model to begin."
                    : "Open Ollama on this computer to start chatting."}
                  <button onClick={() => setModal("settings")}>
                    Connection settings
                  </button>
                </div>
              )}
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <label className="sr-only" htmlFor="message">
                  Your message
                </label>
                <textarea
                  id="message"
                  placeholder="Ask a question or request more detail…"
                  value={draft}
                  maxLength={4000}
                  disabled={busy || working}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={2}
                />
                <div className="composer-bottom">
                  <label>
                    Ask{" "}
                    <select
                      aria-label="Who should reply"
                      value={target}
                      disabled={busy}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">
                        {currentRoom.peopleIds.length > 1
                          ? "Everyone at the table"
                          : people.find(
                              (p) => p.id === currentRoom.peopleIds[0],
                            )?.name}
                      </option>
                      {currentRoom.peopleIds.length > 1 &&
                        currentRoom.peopleIds.map((id) => (
                          <option key={id} value={id}>
                            {people.find((p) => p.id === id)?.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="send-controls">
                    <small>
                      {draft.length > 3500
                        ? `${draft.length}/4000`
                        : "Enter to send"}
                    </small>
                    {busy ? (
                      <button
                        type="button"
                        className="send-button"
                        aria-label="Stop reply"
                        onClick={() =>
                          act(() => api(`/rooms/${activeId}/stop`, "POST", {}))
                        }
                      >
                        <Square size={16} />
                      </button>
                    ) : (
                      <button
                        className="send-button"
                        type="submit"
                        aria-label="Send message"
                        disabled={!draft.trim() || !modelReady || working}
                      >
                        <ArrowUp size={20} />
                      </button>
                    )}
                  </div>
                </div>
              </form>
              <p className="simulation-note">
                AI portrayals informed by history. Responses may be inaccurate.{" "}
                <button onClick={() => setModal("about")}>Learn more</button>
              </p>
            </div>
          </>
        ) : (
          <div className="empty">
            <h2>Choose a conversation</h2>
            <button onClick={() => openPicker()}>Start a conversation</button>
          </div>
        )}
      </main>

      {detailPerson && (
        <Modal wide title="Meet this mind" close={() => setDetail(null)}>
          <div className="profile-hero">
            <Avatar person={detailPerson} large />
            <div className="eyebrow">
              {shortCategory(detailPerson.category)}
            </div>
            <h1>{detailPerson.name}</h1>
            <p>{detailPerson.biography}</p>
            <div className="profile-actions">
              <button
                className="primary"
                disabled={working || busy}
                onClick={() => act(() => createRoom([detailPerson.id]))}
              >
                <MessageCircle size={17} /> Begin a conversation
              </button>
              <button
                disabled={busy}
                onClick={() => openResearch(detailPerson)}
              >
                <Globe2 size={16} />
                {detailPerson.sources.length
                  ? "Update research"
                  : "Connect a source"}
              </button>
            </div>
          </div>
          <div className="profile-content">
            {detailPerson.sources.length ? (
              <>
                <h3>Research sources</h3>
                <SourceList sources={detailPerson.sources} />
              </>
            ) : (
              <p className="notice">
                This original profile is an editorial starting point, with no
                verified sources attached yet. Connect a source for better
                historical grounding.
              </p>
            )}
            <div className="notice">
              <strong>Stable identity</strong>
              <p>
                The selected profile is preserved across research updates.
                Personal notes and saved insights do not change it. Profile
                version {detailPerson.identityVersion?.slice(0, 8)}. This is an
                editorial interpretation, not a verified reconstruction.
                Existing chats keep their own edition.
              </p>
            </div>
            {detailPerson.identityPeriod && (
              <p className="notice">
                <strong>Edition scope</strong>
                <br />
                {detailPerson.identityPeriod}
              </p>
            )}
            {detailPerson.availableEdition && (
              <section className="research-review">
                <h3>Review a primary-source edition</h3>
                <p>{detailPerson.availableEdition.period}</p>
                <p>{detailPerson.availableEdition.rationale}</p>
                <a
                  href={detailPerson.availableEdition.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Read {detailPerson.availableEdition.title}
                </a>
                <p className="field-help">
                  {detailPerson.availableEdition.edition}
                </p>
                <details>
                  <summary>Compare the proposed profile</summary>
                  <h4>Current profile</h4>
                  <Markdown>{detailPerson.content}</Markdown>
                  <h4>Proposed profile</h4>
                  <Markdown>{detailPerson.availableEdition.content}</Markdown>
                </details>
                <p>
                  Accepting adds this work to the thinker's evidence library and
                  selects this profile for new chats. Existing chats keep their
                  original edition. This is an editorial review, not proof of
                  historical accuracy.
                </p>
                <button
                  disabled={working}
                  onClick={() =>
                    act(async () =>
                      updatePerson(
                        await api(
                          `/people/${detailPerson.id}/identity-review`,
                          "POST",
                          {
                            decision: "accept",
                            packId: detailPerson.availableEdition.id,
                            baseVersion: detailPerson.identityVersion,
                          },
                        ),
                      ),
                    )
                  }
                >
                  Accept edition for new chats
                </button>
              </section>
            )}
            {detailPerson.pendingResearch && (
              <section className="research-review">
                <h3>Review proposed research</h3>
                <p>
                  Confirm this is the same person and review the biography and
                  source before allowing it into future replies. Accepting
                  evidence does not rewrite the identity profile or verify every
                  claim.
                </p>
                <strong>{detailPerson.pendingResearch.name}</strong>
                <p>{detailPerson.pendingResearch.biography}</p>
                <SourceList sources={[detailPerson.pendingResearch.source]} />
                <div className="insight-actions">
                  {["accept", "reject"].map((decision) => (
                    <button
                      key={decision}
                      disabled={working}
                      onClick={() =>
                        act(async () =>
                          updatePerson(
                            await api(
                              `/people/${detailPerson.id}/research-review`,
                              "POST",
                              {
                                proposalId: detailPerson.pendingResearch.id,
                                decision,
                              },
                            ),
                          ),
                        )
                      }
                    >
                      {decision === "accept"
                        ? "Accept as supporting evidence"
                        : "Reject research"}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <DatasetBuilder
              key={detailPerson.id}
              person={detailPerson}
              api={api}
              onUpdate={updatePerson}
              disabled={working || busy}
              onBusy={setWorking}
            />
            <ResearchBrief
              person={detailPerson}
              working={working}
              onGenerate={() =>
                act(async () =>
                  updatePerson(
                    await api(`/people/${detailPerson.id}/brief`, "POST", {}),
                  ),
                )
              }
              onReview={(decision) =>
                act(async () =>
                  updatePerson(
                    await api(
                      `/people/${detailPerson.id}/brief-review`,
                      "POST",
                      { briefId: detailPerson.aiBrief.id, decision },
                    ),
                  ),
                )
              }
            />
            {error && (
              <p role="alert" className="dialog-error">
                {error}
              </p>
            )}
            <details>
              <summary>Read the full character profile</summary>
              <Markdown>{detailPerson.content}</Markdown>
            </details>
            <label className="field-label" htmlFor="notes">
              Your private notes
            </label>
            <p className="field-help">
              For your reference only. These notes are saved but are not sent to
              the model or used to change the thinker.
            </p>
            <textarea
              id="notes"
              rows={3}
              maxLength={1500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="For example: read their letters next..."
            />
            <button
              disabled={working || notes === detailPerson.notes}
              onClick={() =>
                act(async () =>
                  updatePerson(
                    await api(`/people/${detailPerson.id}`, "PATCH", { notes }),
                  ),
                )
              }
            >
              <Check size={16} /> Save notes
            </button>
          </div>
        </Modal>
      )}
      {(modal === "roundtable" || modal === "invite") && (
        <Modal
          title={
            modal === "invite"
              ? "Who’s at the table?"
              : "Start a meeting of minds"
          }
          close={() => setModal(null)}
        >
          <div className="modal-content">
            <p className="modal-intro">
              Choose up to three people. Each brings a different way of seeing.
            </p>
            <label className="search-box">
              <Search size={17} />
              <input
                autoFocus
                placeholder="Find a mind…"
                aria-label="Find a participant"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
              />
            </label>
            <div className="selection-count">
              {selection.length} of 3 seats filled
            </div>
            <div className="picker-list">
              {people
                .filter((p) =>
                  p.name.toLowerCase().includes(pickerSearch.toLowerCase()),
                )
                .map((p) => (
                  <button
                    key={p.id}
                    className={selection.includes(p.id) ? "chosen" : ""}
                    disabled={
                      !selection.includes(p.id) && selection.length === 3
                    }
                    onClick={() =>
                      setSelection((ids) =>
                        ids.includes(p.id)
                          ? ids.filter((id) => id !== p.id)
                          : [...ids, p.id],
                      )
                    }
                  >
                    <Avatar person={p} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>{shortCategory(p.category)}</small>
                    </span>
                    <span className="checkbox">
                      {selection.includes(p.id) && <Check size={14} />}
                    </span>
                  </button>
                ))}
            </div>
            <button
              className="primary full"
              disabled={working || !selection.length}
              onClick={() =>
                act(async () => {
                  if (modal === "invite") {
                    updateRoom(
                      await api(`/rooms/${activeId}`, "PATCH", {
                        peopleIds: selection,
                      }),
                    );
                    setTarget("");
                    setModal(null);
                  } else await createRoom(selection);
                })
              }
            >
              {working
                ? "Preparing…"
                : modal === "invite"
                  ? "Update the table"
                  : "Begin the conversation"}
              <ArrowUpRight size={17} />
            </button>
          </div>
        </Modal>
      )}
      {modal === "research" && (
        <Modal
          title={
            researchFor
              ? "Connect biographical research"
              : "Discover a new mind"
          }
          close={() => {
            if (!working) setModal(null);
          }}
        >
          <div className="modal-content">
            <p className="modal-intro">
              Find the right person, then let local AI prepare a broader
              research brief: key ideas, works, influences, and questions to
              investigate. Wikipedia helps identify the person and supplies
              starting evidence. You review new material before it influences
              replies.
            </p>
            <form
              className="research-form"
              onSubmit={(e) => {
                e.preventDefault();
                act(async () =>
                  setResults(
                    await api(
                      `/research?q=${encodeURIComponent(researchName)}`,
                    ),
                  ),
                );
              }}
            >
              <input
                aria-label="Person to research"
                autoFocus
                placeholder="e.g. Carl Jung, Hannah Arendt…"
                value={researchName}
                maxLength={100}
                onChange={(e) => {
                  setResearchName(e.target.value);
                  setResults(null);
                }}
              />
              <button
                className="primary"
                disabled={working || researchName.trim().length < 2}
              >
                {working ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Search size={17} />
                )}{" "}
                Search
              </button>
            </form>
            <p className="field-help">
              Best for people with published biographies. Check the description
              before adding someone; names can be ambiguous.
            </p>
            {results?.length === 0 && (
              <div className="empty">
                <h3>No matching pages</h3>
                <p>Try their full name or add an occupation.</p>
              </div>
            )}
            <label className="ai-research-option">
              <input
                type="checkbox"
                checked={autoBrief}
                onChange={(e) => setAutoBrief(e.target.checked)}
                disabled={working}
              />{" "}
              Prepare an AI research brief after selecting a person
            </label>
            <p className="field-help">
              Uses your local model ({data.settings.model}). Additional model
              knowledge is labeled unverified. No paid research API.
            </p>
            <div className="research-results">
              {results?.map((p) => (
                <button
                  key={p.pageId}
                  disabled={working}
                  onClick={() =>
                    act(async () => {
                      const added = await api("/research", "POST", {
                        pageId: p.pageId,
                        personId: researchFor || undefined,
                      });
                      updatePerson(added);
                      setModal(null);
                      setDetail(added.id);
                      setNotes(added.notes);
                      if (autoBrief)
                        updatePerson(
                          await api(`/people/${added.id}/brief`, "POST", {}),
                        );
                    })
                  }
                >
                  <Avatar person={p} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.description}</small>
                  </span>
                  <Plus size={18} />
                </button>
              ))}
            </div>
            {working && (
              <p className="thinking" role="status">
                <LoaderCircle size={16} className="spin" /> Researching… this
                can take a few moments.
              </p>
            )}
            {error && (
              <p className="dialog-error" role="alert">
                {error}
              </p>
            )}
            <div className="research-foot">
              <Globe2 size={17} /> Wikipedia identification + local AI research
            </div>
          </div>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal title="Your local studio" close={() => setModal(null)}>
          <div className="modal-content">
            <div className="settings-status">
              <span
                className={`status-dot ${connection.online ? "online" : ""}`}
              />
              <strong>
                {connection.online
                  ? "Ollama is connected"
                  : "Ollama is offline"}
              </strong>
              <button
                onClick={() =>
                  act(async () =>
                    setConnection({
                      ...(await api("/models")),
                      checking: false,
                    }),
                  )
                }
              >
                Refresh
              </button>
            </div>
            <p className="modal-intro">
              Conversations run on this computer. No AI subscription or cloud
              account required.
            </p>
            <label className="field-label" htmlFor="model">
              Default model for new conversations
            </label>
            <select
              id="model"
              value={data.settings.model}
              disabled={working || !connection.online}
              onChange={(e) =>
                act(async () => {
                  const settings = await api("/settings", "PUT", {
                    model: e.target.value,
                  });
                  setData((d) => ({ ...d, settings }));
                })
              }
            >
              {!installed && (
                <option value={data.settings.model}>
                  {data.settings.model} — unavailable
                </option>
              )}
              {connection.models.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} · {(m.size / 1e9).toFixed(1)} GB
                </option>
              ))}
            </select>
            <p className="field-help">
              Start with Llama 3.1 8B on this computer. Larger models can take
              longer, especially in group conversations.
            </p>
            {!connection.online && (
              <div className="notice">
                Open the Ollama desktop app, or run <code>ollama serve</code> in
                a terminal, then click Refresh.
              </div>
            )}
            <div className="settings-detail">
              <ShieldCheck size={21} />
              <div>
                <h3>Stored locally, by design</h3>
                <p>
                  Profiles, sources, and conversations are saved in a local
                  SQLite database. New research connects to Wikipedia; existing
                  conversations can work offline with Ollama.
                </p>
              </div>
            </div>
            <div className="settings-detail">
              <Users size={21} />
              <div>
                <h3>One model. Many perspectives.</h3>
                <p>
                  Combined answers bring the selected perspectives into one
                  short reply. Individual answers are optional. Long
                  conversations use recent turns; earlier messages remain saved
                  and exportable.
                </p>
              </div>
            </div>
            {error && <p className="dialog-error">{error}</p>}
          </div>
        </Modal>
      )}
      {modal === "about" && (
        <Modal
          title="Real ideas. Imagined conversations."
          close={() => setModal(null)}
        >
          <div className="modal-content">
            <p>
              Great Thinkers is a place to explore ideas through AI portrayals
              of remarkable people. You are speaking with a model, not the
              person or their representative.
            </p>
            <p>
              The original collection includes editorial profiles and simulated
              monologues. Connected Wikipedia biographies provide additional
              context, but they are a starting point rather than exhaustive
              research.
            </p>
            <p>
              Source links show material supplied to the model. Citation numbers
              are generated by the model and are not independently verified.
              Check important claims against the sources.
            </p>
            <p>
              Answers about modern situations are interpretations. Models can
              misrepresent beliefs or invent details, especially when
              documentation is limited.
            </p>
            <div className="notice">
              Research and portraits are retrieved from Wikipedia. Article text
              is available under CC BY-SA 4.0; follow each source page for
              attribution, history, and image licensing.
            </div>
          </div>
        </Modal>
      )}
      {modal === "rename" && (
        <Modal title="Name this conversation" close={() => setModal(null)}>
          <form
            className="modal-content"
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                updateRoom(
                  await api(`/rooms/${activeId}`, "PATCH", {
                    title: roomTitle,
                  }),
                );
                setModal(null);
              });
            }}
          >
            <input
              autoFocus
              aria-label="Conversation title"
              value={roomTitle}
              maxLength={100}
              onChange={(e) => setRoomTitle(e.target.value)}
            />
            <button
              className="primary full"
              disabled={working || !roomTitle.trim()}
            >
              Save title
            </button>
          </form>
        </Modal>
      )}
      {modal === "removed" && (
        <Modal title="Removed chats" close={() => setModal(null)}>
          <div className="modal-content">
            <p>
              Restore a conversation with its messages, model, and settings
              intact. Saved insights are kept separately.
            </p>
            {!(data.removedRooms || []).length && <p>No removed chats.</p>}
            {(data.removedRooms || []).map((r) => (
              <div className="removed-chat-row" key={r.id}>
                <span>{r.title}</span>
                <button
                  disabled={working}
                  onClick={() =>
                    act(async () => {
                      const restored = await api(
                        `/rooms/${r.id}/restore`,
                        "POST",
                        {},
                      );
                      updateRoom(restored);
                      setData((d) => ({
                        ...d,
                        removedRooms: d.removedRooms.filter(
                          (x) => x.id !== r.id,
                        ),
                      }));
                    })
                  }
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {modal === "delete" && (
        <Modal title="Remove from history?" close={() => setModal(null)}>
          <div className="modal-content">
            <p>
              “{data.rooms.find((r) => r.id === removeId)?.title}” will move to
              Removed chats. You can restore it anytime. Saved insights are
              kept.
            </p>
            <div className="modal-actions">
              <button onClick={() => setModal(null)}>Keep conversation</button>
              <button
                className="danger"
                disabled={working}
                onClick={() =>
                  act(async () => {
                    await api(`/rooms/${removeId}`, "DELETE");
                    setData((d) => ({
                      ...d,
                      rooms: d.rooms.filter((r) => r.id !== removeId),
                      removedRooms: [
                        ...(d.removedRooms || []),
                        {
                          id: removeId,
                          title: d.rooms.find((r) => r.id === removeId)?.title,
                        },
                      ],
                    }));
                    if (activeId === removeId) {
                      setActiveId(null);
                      setView("library");
                    }
                    setModal(null);
                  })
                }
              >
                Remove from history
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
