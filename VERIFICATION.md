# Local studio verification

Checked on September 12, 2026 on Windows, Node.js 24.18.0, an RTX 5070 Laptop GPU with 8 GB VRAM, and approximately 32 GB system RAM.

## Automated

- `npm test`: 14 passing tests. Isolated databases and a mock Ollama transport cover ordered group replies and shared context, targeted replies, streamed Unicode, cancellation, retry without duplicate visitor messages, conflicting writes, input validation, origin rejection, research identity/provenance, source retrieval limits, persistence, and cloud-alias rejection.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm audit --audit-level=moderate`: zero reported vulnerabilities after dependency updates.

## Earlier local-studio checks

These checks preceded the concise-answer refactor; timings describe the previous individual-reply flow.

- Started the production Express server on loopback and loaded the built React app in a browser.
- Searched for Carl Jung, selected the matching biographical result, imported his research, and started a conversation through the UI. Verified that books and abstract concepts are excluded from results.
- Connected Wikipedia sources to existing Marcus Aurelius, Albert Einstein, and Virginia Woolf profiles without creating duplicate library entries.
- Added Einstein and Woolf to an existing conversation through the participant picker. Received three ordered replies from local Ollama. The initial Hermes run exposed verbosity, inaccurate examples, and blending of perspectives; prompts and retrieval were revised in response.
- Compared the already-installed Llama 3.1 8B against Hermes on a literary example. Llama followed the requested length more closely and gave a better example, so it is now the default. This is a focused comparison, not a comprehensive model evaluation.
- On the final backend, a sourced three-person roundtable using Llama 3.1 8B completed in 25 seconds. All replies completed successfully, at 73, 76, and 71 words for an under-80-word request; later speakers responded to earlier participants. This timing is one observed run, not a latency guarantee.
- Verified saved conversations remain available after browser reload and server restart. Expanded a reply's source card and read the actual saved passages supplied to the model.
- Inspected library and conversation layouts at 390 × 844, and at desktop widths. At 390 pixels the document had no horizontal overflow and the composer remained within the viewport. Reset the temporary viewport override afterward.

## Concise-answer refactor checks

- Re-ran all 14 tests, lint, and production build successfully. New coverage includes defaults for existing rooms without changing history, a single synthesis call with differing profiles and distinct source numbering, saved answer preferences, targeted plain replies, retry after a format change, and explicit detail requests.
- With local Llama 3.1 8B and Locke/Marx profiles, an ordinary question produced one 56-word answer in 1.8 seconds. A request for more detail produced 252 words in 5.3 seconds. A subsequent takeaway question returned to 59 words in 1.4 seconds. These are individual observations, not guaranteed length or latency.
- The generated answer mentioned the disagreement but offered an oversimplified compromise; the detailed example also contained weak historical reasoning. This verifies response format and follow-up behavior, not philosophical accuracy.
- In the browser, verified combined replies and participant attribution, changed to individual answers, reloaded and confirmed the saved preference, then selected historical style and restored combined mode.
- At 390 by 844 pixels, the answer selector and composer fit within the viewport and the document had no horizontal overflow.

## Limits of this evidence

The tests do not establish historical accuracy. Local models can still invent details, omit citations, exceed requested word counts, or give weak interpretations. Source cards are provenance for the material supplied, not independent validation of generated claims. The UI and README state this explicitly.

This is a working local milestone, not an assertion that the app has reached a “world class” finish line. Broader portrayal evaluation, richer primary-source research, stronger citation verification, and user feedback on the visual and conversational experience remain the next product milestones. Public hosting, authentication, voice, and cloud inference are not part of this local release.
