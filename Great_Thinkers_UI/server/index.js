import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { openStore } from "./store.js";
import { createApp } from "./app.js";
const root = fileURLToPath(new URL("..", import.meta.url));
const store = openStore(
  resolve(root, "../data/great-thinkers.sqlite"),
  resolve(root, "../Great_Thinkers"),
);
const port = Number(process.env.PORT || 3001);
createApp({
  store,
  dist: resolve(root, "dist"),
  ollamaUrl: process.env.OLLAMA_URL,
}).listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Great Thinkers is ready at http://127.0.0.1:${port}`),
);
