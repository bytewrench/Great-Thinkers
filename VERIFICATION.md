# Local studio verification

Checked on September 12, 2026 on Windows, Node.js 24.18.0, an RTX 5070 Laptop GPU with 8 GB VRAM, and approximately 32 GB system RAM.

## Automated

- `npm test`: 24 passing tests. Isolated databases and a mock Ollama transport cover ordered group replies and shared context, targeted replies, streamed Unicode, cancellation, retry without duplicate visitor messages, conflicting writes, input validation, origin rejection, research identity/provenance, source retrieval limits, persistence, and cloud-alias rejection.
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

## Notebook and identity safeguards

- 18 automated tests pass, including immutable insight snapshots, duplicate-save handling, survival after conversation deletion, private-note exclusion, staged research acceptance/rejection and stale-review rejection, stable identity hashes, model-name pinning, and blocking changed model digests before sending a new question.
- Browser check: generated an answer with local Ollama, saved it to Insights, edited its title and reflection, and searched the saved content.
- Live model check: the installed Llama 3.1 8B digest and both profile hashes were recorded with a completed answer. A real Wikipedia refresh of Marcus Aurelius was staged without replacing his current identity.
- Browser check: reviewed and rejected the staged Marcus Aurelius refresh; the review controls disappeared. The notebook and reflection survived reload. At 390 pixels, the notebook had no horizontal overflow; the viewport was restored.
- A local database backup was created before the identity migration. Older messages retain their original metadata; missing historic model/profile versions are not invented.

## History, discussion, and AI research

- 24 automated tests pass. Added coverage includes reversible history removal/restoration, two-round discussion order and context, exact-quote validation, malformed-assessment fallback, stopping during assessment, research-brief quarantine and admission without identity replacement, invented-excerpt exclusion, and cloud-model rejection for briefs.
- Lint and production build passed. In a live Llama 3.1 8B run, Locke and Marx completed four replies in two rounds in 15.8 seconds. The panel remained red after both views were available and cited exact excerpts from the generated replies. This is one latency observation, not a guarantee or historical verification.
- Browser: opened the assessment details, removed the test conversation from its history-row control, and restored it with messages and settings intact. Inspected the mobile discussion at 390 by 844 pixels: no horizontal overflow and the composer stayed inside the viewport. Restored the viewport afterward.
- Generated and displayed a local AI research draft for John Locke. With no connected sources, it correctly displayed zero grounded excerpts and kept the generated context unverified and pending review. The revised prompt produced additional works, influences, and research questions through the profile-screen button. The unverified test draft was discarded through the UI; it was not admitted into the portrayal. Verified the discovery form has AI brief generation selected by default.

## Limits of this evidence

The tests do not establish historical accuracy. Local models can still invent details, omit citations, exceed requested word counts, or give weak interpretations. Source cards are provenance for the material supplied, not independent validation of generated claims. The UI and README state this explicitly.

This is a working local milestone, not an assertion that the app has reached a “world class” finish line. Broader portrayal evaluation, richer primary-source research, stronger citation verification, and user feedback on the visual and conversational experience remain the next product milestones. Public hosting, authentication, voice, and cloud inference are not part of this local release.


## Three primary-source editions (September 12, 2026 local time)

- 27 automated tests passed, plus lint and production build. Added tests cover corpus extraction/locators, immutable identity history, stale-review rejection, old/new chat behavior, removed/restored chat pins, and preservation of primary works through biography research and favorite edits.
- Ran nine fixed local Llama 3.1 8B questions on three successive prompt revisions. Final report: `data/evaluations/2026-09-13T03-08-29-252Z.json`. All nine generations completed. This is a diagnostic run, not a fidelity pass: the model resisted direct belief replacement more clearly after revision but retained weak reasoning about AI government, nonstandard citation formatting, and an irrelevant ideological explanation of why Marx could not advise a government after his death. One intermediate revision actually accepted a conflicting Marx premise; that regression is retained in the earlier local report.
- Backed up the live database to `data/backup-before-primary-editions.sqlite` before migration. All 11 existing chats acquired identity pins. Earlier message bodies were preserved.
- Browser check: opened Marcus Aurelius's profile, observed the edition comparison and acceptance controls, accepted the edition, and verified the primary-source card and dated scope replaced the proposal. The rendered dialog remained readable. Accepted Locke and Marx through the same local review endpoint. Existing chats retain their older edition.

Next fidelity milestone: independently reviewed claim-to-passage checks and a broader, held-out question set before treating any model/profile combination as consistently faithful. The present checks protect stored identity and source integrity; they cannot guarantee every generated answer follows them.


## Local Docker and web dataset builder

- 29 automated tests and ESLint pass. Added tests cover staged source text, URL/size validation, duplicate-source rejection, source ownership, local profile drafting, reviewed acceptance, old-chat isolation, stale-draft rejection, and dataset export without private notes or chats.
- Built the production image successfully on Docker Desktop's Linux engine using Node 24. Container runs as the node user and publishes 3001 only on 127.0.0.1. Inspected the effective restart policy: `always`. The Windows Docker-login setting was not changed, and the entire Docker Engine was not restarted because unrelated containers are running.
- Verified the app health endpoint and connectivity from inside the container to existing Windows Ollama models through host.docker.internal. Created `data/backup-before-docker.sqlite` before switching from the native process to Docker. The existing data directory is bind-mounted; no model weights were copied.
- Browser: opened source/file controls and prepared a profile from Meditations using local Llama 3.1 8B. An initial prompt failed the exact-excerpt gate; the revised prompt returned five matching excerpts with an editable profile and accept/discard controls. Inspected the rendered draft and supporting passages, then discarded this test draft without changing the active edition. Text matching does not verify interpretation; drafts still need review.
- Restarted only the Great Thinkers container. It became healthy; 102 people and 11 conversations remained available and a hash comparison confirmed complete chat history was unchanged. The discarded draft remained absent.
- Google OAuth, invitations, OpenRouter spending enforcement, public hosting, and dataset re-import are explicitly deferred to the private VPS milestone. The current site remains local-only.


## Delete a saved idea

- Added a Delete idea control to every notebook card, with an inline confirmation that names the saved copy and reflection as the deletion target. The original chat is unaffected.
- 30 automated tests and lint pass. New coverage verifies selected deletion, preservation of other ideas and original messages, absence from refreshed state, missing-ID handling, and saving the original answer again. Docker production build passed.


## Themed starting groups

- Replaced fixed featured minds with four editorial groups on government, knowledge, art, and quantum theory. Each uses three relevant library profiles with contrasting approaches; dissent is invited, not scripted.
- Browser verified a quantum group, switching to an art group with Another group, and a government group after reload. Selection excludes the last displayed group when alternatives exist and is persisted in browser storage. Returning to the library remounts the section and selects again.
- Added a group conversation shortcut that fills a suggested question without sending it. ESLint and the Docker production build passed; the updated container is healthy. No inference is used for group selection.
