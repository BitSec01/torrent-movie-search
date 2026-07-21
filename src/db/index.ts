import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const sqlite = new Database(
  path.resolve(process.cwd(), "sqlite.db")
);

/**
 * Columns added after the initial release, applied on startup.
 *
 * The deploy script deliberately never replaces the server's sqlite.db and has
 * no migrate step, so a new column would otherwise reach production only as a
 * runtime error. SQLite has no ADD COLUMN IF NOT EXISTS, hence the check.
 */
function ensureColumns(): void {
  const columns = sqlite.prepare("PRAGMA table_info(download)").all();

  // No rows means the table itself does not exist yet (fresh install, before
  // migrations run) — there is nothing to alter.
  if (columns.length === 0) return;

  const existing = new Set(columns.map((c) => (c as { name: string }).name));
  if (!existing.has("organize_attempts")) {
    sqlite.exec("ALTER TABLE download ADD COLUMN organize_attempts INTEGER NOT NULL DEFAULT 0");
  }
}

ensureColumns();

export const db = drizzle(sqlite, { schema });
