export default function TextSizeControl({ value, onChange }) {
  return (
    <div
      className="text-size-control"
      role="group"
      aria-label="Conversation text size"
    >
      <button
        type="button"
        aria-label="Decrease text size"
        title="Smaller text"
        disabled={value <= 14}
        onClick={() => onChange(Math.max(14, value - 1))}
      >
        A−
      </button>
      <button
        type="button"
        className="text-size-reset"
        aria-label={`Text size ${value} pixels. Reset to default`}
        title="Reset text size"
        onClick={() => onChange(16)}
      >
        {value}
      </button>
      <button
        type="button"
        aria-label="Increase text size"
        title="Larger text"
        disabled={value >= 24}
        onClick={() => onChange(Math.min(24, value + 1))}
      >
        A+
      </button>
    </div>
  );
}
