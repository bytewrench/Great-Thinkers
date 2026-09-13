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
- Receive streamed replies from a selected local Ollama model. Stop or retry an interrupted reply.
- Reopen, rename, export, or delete saved conversations.
- Add your own characterization notes without confusing them with historical evidence.

## Data and privacy

Data is stored in `data/great-thinkers.sqlite`, outside the UI folder and excluded from Git. To back it up, stop the app and copy the entire `data` directory. Completed messages are persisted after each speaker; an interrupted process may lose the current unfinished reply's text, but not earlier saved messages. A stopped reply can be retried.

The server binds only to `127.0.0.1`, checks Host/Origin, and calls Ollama at `127.0.0.1:11434`. It is a **single-user local app**, not a publicly deployable authenticated service. Do not expose it through a reverse proxy or port forwarding without adding authentication and reviewing the deployment architecture.

Research sends the entered name and selected page identifiers to Wikipedia/Wikidata. Portraits load from Wikimedia; the UI's fonts are bundled locally. Conversation messages are sent only to local Ollama. New research needs internet access. Previously saved profiles and chat generation can work offline; uncached portraits may not load.

## Research and portrayal limits

These are explicit AI simulations, not the real people. The original Markdown profiles are editorial material, not verified biographies; their simulated monologues are fiction. Imported biographies use Wikipedia as a starting source, not a comprehensive research service. Search requires a Wikidata human classification, so some poorly documented or legendary figures may not appear.

For each reply, the app selects a bounded set of source passages by keyword relevance and supplies them to the model. Visible source links identify material supplied; the model's citation numbers and historical claims are **not independently verified**. Model quality, source quality, and the specificity of the question affect accuracy. Modern views are extrapolations.

The model sees recent conversation turns within a character budget and uses an 8,192-token context setting. Earlier turns remain stored and exportable but are not permanent model memory. Participants answer sequentially; retry regenerates only the interrupted participant. This keeps an 8 GB GPU practical. Larger models may spill into system RAM and run slowly.

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

The working local version is the first milestone. Before calling this a finished public product: assess conversations with a representative set of people, add curated primary sources and stronger citation verification, evaluate long-conversation memory, and choose a hosting/authentication design if public access is wanted. Keep voice, autonomous debates, and paid search providers out of the core milestone until the conversational experience is validated.
