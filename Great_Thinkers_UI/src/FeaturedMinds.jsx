import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, Users } from "lucide-react";

// Editorial pairings from the library profiles, not model-generated claims of agreement.
const groups = [
  {
    id: "government",
    topic: "What makes government legitimate?",
    question:
      "What makes a government legitimate, and when should people resist it?",
    contrast:
      "Consent and rights meet the case for strong authority and the general will.",
    members: [
      ["John Locke", "Consent, rights, and limits on government."],
      ["Thomas Hobbes", "Strong authority as protection against disorder."],
      ["Jean-Jacques Rousseau", "Popular sovereignty and the general will."],
    ],
  },
  {
    id: "knowledge",
    topic: "How can we know what is true?",
    question:
      "How can we know what is true: through reason, experience, or both?",
    contrast:
      "Reason, experience, and the limits of knowledge offer different starting points.",
    members: [
      ["Rene Descartes", "Doubt as a route toward rational certainty."],
      ["David Hume", "Experience, skepticism, and the limits of inference."],
      ["Immanuel Kant", "How the mind helps structure experience."],
    ],
  },
  {
    id: "art",
    topic: "Does art need a moral purpose?",
    question: "Does art need to serve a moral purpose, or is beauty enough?",
    contrast:
      "Art's independence meets moral responsibility and the exploration of inner life.",
    members: [
      ["Oscar Wilde", "Beauty and art's independence from moral instruction."],
      ["Leo Tolstoy", "Art as a connection with ethical consequences."],
      [
        "Virginia Woolf",
        "Art as a way to explore consciousness and experience.",
      ],
    ],
  },
  {
    id: "quantum",
    topic: "What does quantum theory tell us about reality?",
    question:
      "Does quantum theory describe reality completely, or only what we can predict?",
    contrast:
      "Different approaches to physical reality, measurement, and prediction.",
    members: [
      [
        "Albert Einstein",
        "Question whether quantum theory is a complete account.",
      ],
      ["Niels Bohr", "Consider measurement and complementary descriptions."],
      [
        "Richard Feynman",
        "Focus on what the theory predicts and experiments test.",
      ],
    ],
  },
];
const storageKey = "great-thinkers-last-featured-group";
function previousGroup() {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
function choose(available, previous) {
  const choices = available.filter((g) => g.id !== previous);
  const pool = choices.length ? choices : available;
  return pool[Math.floor(Math.random() * pool.length)]?.id;
}

export default function FeaturedMinds({
  people,
  Avatar,
  shortCategory,
  onMeet,
  onStart,
  working,
}) {
  const available = groups.filter((g) =>
    g.members.every(([name]) => people.some((p) => p.name === name)),
  );
  const [groupId, setGroupId] = useState(() =>
    choose(available, previousGroup()),
  );
  const group = available.find((g) => g.id === groupId) || available[0];
  useEffect(() => {
    if (group?.id) {
      try {
        localStorage.setItem(storageKey, group.id);
      } catch {
        /* Rotation still works within this visit. */
      }
    }
  }, [group?.id]);
  if (!group) return null;
  const members = group.members.map(([name, perspective]) => ({
    ...people.find((p) => p.name === name),
    perspective,
  }));
  return (
    <section className="featured-section">
      <div className="section-heading">
        <h2>A good place to begin</h2>
        <button
          onClick={() => setGroupId(choose(available, group.id))}
          disabled={available.length < 2 || working}
        >
          <RefreshCw size={15} /> Another group
        </button>
      </div>
      <div className="featured-topic" aria-live="polite">
        <h3>{group.topic}</h3>
        <p>{group.contrast}</p>
      </div>
      <div className="featured-grid">
        {members.map((p, i) => (
          <button
            className={`featured-card feature-${i}`}
            key={p.id}
            onClick={() => onMeet(p)}
          >
            <div className="featured-top">
              <span>
                0{i + 1} / {shortCategory(p.category)}
              </span>
              <ArrowUpRight size={21} />
            </div>
            <div className="featured-body">
              <Avatar person={p} large />
              <div>
                <h3>{p.name}</h3>
                <p>{p.perspective}</p>
              </div>
            </div>
            <span className="featured-footer">
              Meet this mind <span>→</span>
            </span>
          </button>
        ))}
      </div>
      <div className="featured-actions">
        <button
          disabled={working}
          onClick={() =>
            onStart(
              members.map((p) => p.id),
              group.question,
            )
          }
        >
          <Users size={16} /> Start with these three
        </button>
        <p className="field-help">
          Suggested contrasts, not a promise of disagreement. Your question
          shapes the discussion.
        </p>
      </div>
    </section>
  );
}
