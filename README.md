# Great Thinkers

A local library of minds: research a person, talk with an AI portrayal, or invite up to three people into a shared conversation. Built with React, Express, SQLite, and Ollama.

## Run on Windows

Install **Node.js 24 or newer** and **Ollama**. Download a conversational model (the default is `llama3.1:8b`), then open **Start Great Thinkers.cmd** in this folder.

Or run:

```powershell
cd Great_Thinkers_UI
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3001**. In Settings, select an installed Ollama model. No model is downloaded automatically, and no paid API is used. For development, `npm run dev` starts the API and Vite together; open the Vite URL printed in the terminal.

## What you can do

- Browse and search the 100 original profiles; save favorite minds.
- Discover someone by name. Wikipedia search and Wikidata's human classification narrow the choices; confirm the correct biography before importing it.
- Connect research to an original profile or refresh its source. Biographical text, source URL, article revision, and retrieval date are saved locally.
- Chat with one person or a roundtable of up to three. Address everyone or one participant, and change participants between turns.
- Choose Watch discussion for two short rounds of replies to one another, with an animated speaker graph and a color-coded assessment. Stop anytime or request another round.
- Get one brief combined answer by default, with important disagreement stated plainly. Ask for more detail in a follow-up.
- Switch Answer format to Individual answers for separate plain-language perspectives, or In character for historical style. The choice is saved per conversation; existing histories stay intact.
- Receive streamed replies from a selected local Ollama model. Stop or retry an interrupted reply.
- Reopen, rename, export, or remove conversations from history. Restore them anytime from Removed chats; removal is not permanent erasure.
- Save completed answers to a searchable Insights notebook; edit titles and reflections, reopen the original conversation, and export the notebook as JSON.
- Keep private notes for each thinker. Notes and insights are never added to model prompts.

## Watching a discussion

The At the table panel uses red for conflicting positions, yellow for partial common ground, green for explicit agreement, and blue when exploring or unable to assess. It highlights the current speaker and keeps assessment history for the current question. Expand the panel to read the quoted replies behind its color. There is no percentage or scripted progression toward green.

Watch discussion runs two rounds (up to six individual replies), with bounded local-model assessments between replies once two people have spoken. Exact excerpts from different speakers must match completed replies before a non-neutral assessment is displayed. This checks quotation provenance, not whether the interpretation is correct. Assessments can be wrong; failed assessments remain blue. Ordinary combined answers keep their single-call workflow. The meter evaluates Watch discussion, not an unseen debate behind combined answers.

## AI-assisted research

Discovery can automatically prepare a local Ollama research brief after you select a matching person. Existing profiles also have a Prepare with local AI button. Wikipedia/Wikidata still identify the person and provide starting source material; the model adds context, works, influences, critiques, and research questions from its learned knowledge. It does not independently browse other websites.

Briefs separate claims accompanied by exact source excerpts from explicitly unverified model context. Invalid or invented source excerpts are excluded; a valid excerpt does not establish that a claim follows from it. The draft is stored locally and excluded from replies until you choose Use reviewed brief. That admits a bounded portion as secondary, unverified context, never as a replacement for the fixed identity. Draft decisions and source/model metadata are retained. Discard draft rejects a pending brief. No paid API is used. Local model verification rejects cloud aliases, and research generation is serialized with conversations.

## Identity and research boundaries

Each thinker has a versioned identity record with a content hash. Existing original profiles remain editorial interpretations; newly discovered people start with the biography you selected, which is not an independently verified personality. Research, chat messages, insights, and notes cannot overwrite the selected identity. A separately reviewed, bundled primary-source edition can replace the default for new chats; earlier versions remain archived.

Research updates for existing thinkers are staged. Review the proposed biography and linked source in the person's profile, then accept or reject them. Accepted research updates supporting evidence only; decisions and the proposed source text remain in an audit record. This is human review and provenance, not an automated factual-verification service. The initial selected biography for a new person establishes their baseline. Earlier imported sources are retained, not retroactively verified.

Conversations retain their model name. On their next reply they also pin the installed model digest; subsequent changes to that model version are blocked with an explanation. Changing Settings affects new conversations. Existing conversations adopt their last recorded model when upgraded. Earlier messages cannot be assigned a model digest retroactively. Prompts ask the model to preserve worldview, identify conflicts, and distinguish modern interpretation from documented beliefs. These checks prevent silent data/model replacement but cannot guarantee faithful reasoning or eliminate prompt injection.

Saved insights are independent snapshots of the original question, answer, people, sources supplied, and any recorded model/profile versions. They survive deletion of the source conversation. Your reflection remains separate from the original answer, and saving an insight never promotes AI output into historical evidence.

## Data and privacy

Data is stored in `data/great-thinkers.sqlite`, outside the UI folder and excluded from Git. To back it up, stop the app and copy the entire `data` directory. Completed messages are persisted after each speaker; an interrupted process may lose the current unfinished reply's text, but not earlier saved messages. A stopped reply can be retried.

The server binds only to `127.0.0.1`, checks Host/Origin, and calls Ollama at `127.0.0.1:11434`. It is a **single-user local app**, not a publicly deployable authenticated service. Do not expose it through a reverse proxy or port forwarding without adding authentication and reviewing the deployment architecture.

Research sends the entered name and selected page identifiers to Wikipedia/Wikidata. Portraits load from Wikimedia; the UI's fonts are bundled locally. Conversation messages are sent only to local Ollama. New research needs internet access. Previously saved profiles and chat generation can work offline; uncached portraits may not load.

## Research and portrayal limits

These are explicit AI simulations, not the real people. The original Markdown profiles are editorial material, not verified biographies; their simulated monologues are fiction. Imported biographies use Wikipedia as a starting source, not a comprehensive research service. Search requires a Wikidata human classification, so some poorly documented or legendary figures may not appear.

For each reply, the app selects a bounded set of source passages by keyword relevance and supplies them to the model. Visible source links identify material supplied; the model's citation numbers and historical claims are **not independently verified**. Model quality, source quality, and the specificity of the question affect accuracy. Modern views are extrapolations.

The model sees recent conversation turns within a character budget and uses an 8,192-token context setting. Earlier turns remain stored and exportable but are not permanent model memory. Combined mode makes one model call informed by all selected profiles, rather than running a hidden debate or vote. Individual mode runs participants sequentially. Retry preserves the interrupted reply's original format and participants. This keeps an 8 GB GPU practical. Larger models may spill into system RAM and run slowly.

Wikipedia article text is licensed under CC BY-SA 4.0; source cards link to the article and its contributor history. Wikimedia image licensing varies; follow the source article's image link for its attribution and license.

## Verification

```powershell
cd Great_Thinkers_UI
npm test
npm run lint
npm run build
```

The automated suite uses isolated SQLite stores and a mock Ollama server to exercise streamed Unicode, group context/order, targeted replies, cancellation, retry, input limits, origin rejection, research provenance, nonperson filtering, and persistence. It makes no paid calls. Real model performance and live research should also be checked on the target computer.

## Project layout

- `Great_Thinkers/`: preserved original character library.
- `Great_Thinkers_UI/src/`: responsive library, profiles, chat, and settings.
- `Great_Thinkers_UI/server/`: local API, SQLite persistence, research and prompts.
- `scripts/`: legacy Gemini CLI utilities, independent of the new app. They are not used or required by the local experience.

## Next milestones

The working local version is the first milestone. Before calling this a finished public product: assess conversations with a representative set of people, add curated primary sources and stronger citation verification, evaluate long-conversation memory, and choose a hosting/authentication design if public access is wanted. Keep voice, unbounded autonomous debates, and paid search providers out of the core milestone until the conversational experience is validated.


## Primary-source editions

Marcus Aurelius, John Locke, and Karl Marx now have optional source-based editions. Open their profile, compare the proposed profile with the current one, then **Accept edition for new chats**. Each has a bounded period and subject scope, an editorial core profile, and a primary work with passage locators:

- Marcus Aurelius: [Meditations](https://www.gutenberg.org/ebooks/2680), Meric Casaubon translation. Focus: late-life philosophical reflections.
- John Locke: [Second Treatise of Government](https://www.gutenberg.org/ebooks/7370). Focus: the political arguments published in 1689.
- Karl Marx: [The Communist Manifesto](https://www.gutenberg.org/ebooks/61), coauthored with Friedrich Engels. Focus: the 1848 work, in the English edition of 1888.

These are distinct knowledge libraries using a shared Ollama model, not separately trained neural networks. Original files and their licenses are retained in `Great_Thinkers_UI/knowledge/originals`. The loader checks their SHA-256 hashes and excludes front matter and Gutenberg boilerplate from retrieval; the Meditations editor's introduction, appendix, glossary, and notes are excluded. Excerpts carry edition-specific book/chapter/section and paragraph locators. Paragraph numbers are app locators, not print page numbers. Keyword retrieval is bounded and may miss relevant passages.

SQLite retains identity versions and review records. A chat pins each participant's identity version; accepting a new edition does not switch existing or removed/restored chats. Reinviting a previous participant retains that chat's pin. Existing chats are pinned at migration to the last recorded identity, or the then-current profile if no version was recorded. This cannot reconstruct undocumented historical versions. Supporting Wikipedia research and reviewed AI briefs may still be updated; they remain secondary context and do not rewrite the pinned core identity or primary work. To publish another edition, add a new immutable pack ID, source file and reviewed profile; do not edit an existing source in place. This release provides review of the three bundled editions, not an arbitrary profile editor.

Run `npm run evaluate` from `Great_Thinkers_UI` (optionally `npm run evaluate -- <installed-model>`) when Ollama is idle. Nine fixed questions exercise core beliefs, pressure to change identity, and modern/private-memory boundaries. This uses local inference only and does not modify chats or train models. JSON reports in `data/evaluations` contain model digest, profile hash, sources, answers and manual-review criteria. Exit success means generation completed without an out-of-range numeric citation, **not** that the answers are historically correct. Review the content against the supplied passages. The current local 8B model still produces weak reasoning, nonstandard citations and overly confident extrapolation; prompt instructions are not a complete behavioral firewall.
