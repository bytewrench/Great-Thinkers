export default function ResponseControls({ room, disabled, target, onChange }) {
  const mode = room.responseMode || "synthesis";
  const value =
    mode === "synthesis"
      ? "synthesis"
      : room.voice === "historical"
        ? "historical"
        : "individual";
  const single = Boolean(target) || room.peopleIds.length === 1;
  return (
    <div className="response-controls">
      <label htmlFor="answer-format">Answer format</label>
      <select
        id="answer-format"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const value = event.target.value;
          onChange({
            responseMode: value === "synthesis" ? "synthesis" : "individual",
            voice: value === "historical" ? "historical" : "plain",
          });
        }}
      >
        <option value="synthesis">Combined answer</option>
        <option value="individual">Individual answers</option>
        <option value="historical">In character</option>
      </select>
      <span>
        {value === "synthesis"
          ? single
            ? "One brief, plain-language answer from the selected person."
            : "One short answer. Important disagreements included."
          : value === "individual"
            ? "Each person answers briefly in plain language."
            : "Individual replies with historical personality."}{" "}
        Ask for more detail anytime.
      </span>
    </div>
  );
}
