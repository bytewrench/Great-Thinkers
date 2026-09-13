import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

export function openStore(filename, library) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT, id TEXT, value TEXT NOT NULL, PRIMARY KEY(kind,id))",
  );
  const store = {
    get: (kind, id) => {
      const row = db
        .prepare("SELECT value FROM records WHERE kind=? AND id=?")
        .get(kind, id);
      return row ? JSON.parse(row.value) : null;
    },
    all: (kind) =>
      db
        .prepare("SELECT value FROM records WHERE kind=?")
        .all(kind)
        .map((r) => JSON.parse(r.value)),
    put: (kind, value) => {
      db.prepare("INSERT OR REPLACE INTO records VALUES(?,?,?)").run(
        kind,
        value.id,
        JSON.stringify(value),
      );
      return value;
    },
    remove: (kind, id) =>
      db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id),
    close: () => db.close(),
  };
  if (library)
    for (const category of readdirSync(library, { withFileTypes: true }).filter(
      (d) => d.isDirectory(),
    )) {
      for (const file of readdirSync(join(library, category.name)).filter((f) =>
        f.endsWith(".md"),
      )) {
        const id = createHash("sha256")
          .update(category.name + "/" + file)
          .digest("hex")
          .slice(0, 16);
        if (store.get("people", id)) continue;
        const content = readFileSync(
          join(library, category.name, file),
          "utf8",
        );
        const biography =
          content
            .split("## 1.")[1]
            ?.split("## 2.")[0]
            ?.replace(/^[^\n]+\n/, "")
            .replace(/\*\*/g, "")
            .replace(/^- /gm, "")
            .trim() || "";
        store.put("people", {
          id,
          name: file.slice(0, -3).replaceAll("_", " "),
          category: category.name.replaceAll("_", " "),
          content,
          biography,
          notes: "",
          sources: [],
          favorite: false,
          createdAt: new Date().toISOString(),
        });
      }
    }
  return store;
}
