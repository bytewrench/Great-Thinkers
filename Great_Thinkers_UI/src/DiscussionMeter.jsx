import ActivityGraphic from "./ActivityToast.jsx";
import { useState } from "react";
import { ChevronDown, Eye, Play } from "lucide-react";
const states = {
  conflict: { label: "Disagreement", color: "#bd4f49" },
  "common-ground": { label: "Some common ground", color: "#b88a19" },
  agreement: { label: "Agreement expressed", color: "#348564" },
  unclear: { label: "Exploring", color: "#6383a3" },
};
export default function DiscussionMeter({
  room,
  telemetry,
  busy,
  phase,
  onContinue,
}) {
  const [expanded, setExpanded] = useState(false);
  const question = room.messages.findLast((m) => m.role === "user");
  const events = (room.discussionEvents || []).filter(
    (e) => e.questionId === question?.id,
  );
  const event = events.at(-1);
  const state = states[event?.state] || states.unclear;
  const last = room.messages.at(-1);
  const speaker =
    busy &&
    phase !== "assessing" &&
    last?.role === "assistant" &&
    last.status !== "complete"
      ? last.name
      : null;
  const watching = room.responseMode === "watch";
  const reason =
    event?.reason ||
    (room.peopleIds.length === 1
      ? "Ready for your next question."
      : watching
        ? "Start a topic and watch each perspective develop."
        : "Choose Watch discussion to see how the speakers relate.");
  return (
    <section
      className={`discussion-meter ${busy ? "is-live" : ""}`}
      style={{ "--discussion-color": state.color }}
      aria-label="Discussion atmosphere"
    >
      <ActivityGraphic
        telemetry={telemetry}
        active={busy}
        state={event?.state}
      />
      <div className="discussion-copy">
        <div className="discussion-kicker">
          <Eye size={13} /> AT THE TABLE {busy && <span className="live-dot" />}
        </div>
        <strong className="discussion-state">{state.label}</strong>
        <p role="status">
          {phase === "assessing" && busy
            ? "Reading the exchange..."
            : speaker
              ? `${speaker} is replying${last.round ? ` · round ${last.round} of 2` : ""}`
              : reason}
        </p>
        <div className="discussion-trail" aria-label="Assessment history">
          {events.map((e, i) => (
            <span
              key={e.messageId}
              style={{ background: states[e.state]?.color }}
              title={`${i + 1}: ${states[e.state]?.label} - ${e.reason}`}
            />
          ))}
          <small>AI reading of this exchange</small>
        </div>
      </div>
      <div className="discussion-actions">
        <button
          className="icon"
          aria-label={
            expanded ? "Hide discussion details" : "Show discussion details"
          }
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown size={17} />
        </button>
        {watching && !busy && question && (
          <button onClick={onContinue}>
            <Play size={14} /> Another round
          </button>
        )}
      </div>
      {expanded && (
        <div className="discussion-details">
          <p>
            Red: conflicting positions. Yellow: partial common ground. Green:
            explicit agreement. Blue: exploring, insufficient evidence, or an
            unavailable assessment. Colors can move in either direction;
            agreement is never the goal by force.
          </p>
          <p>{reason}</p>
          {event?.evidence?.map((e, i) => {
            const m = room.messages.find((m) => m.id === e.messageId);
            return (
              <blockquote key={i}>
                <strong>{m?.name}</strong>: {e.quote}
              </blockquote>
            );
          })}
          <small>
            This describes AI-generated replies, not historical consensus or a
            percentage of agreement. Assessments happen after completed replies
            in Watch discussion.
          </small>
        </div>
      )}
    </section>
  );
}
