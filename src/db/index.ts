import fs from "fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

/**
 * Where the database lives.
 *
 * `DATABASE_PATH` wins so the file can sit on a mounted volume. Resolving it against the
 * working directory instead — which is what this used to do unconditionally — puts it inside
 * the container's writable layer, and a container's writable layer is thrown away on every
 * deploy. The default keeps existing local checkouts working unchanged.
 */
const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), "sqlite.db");

// SQLite creates the file but never its parent directory.
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);

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
  if (!existing.has("metadata_attempts")) {
    sqlite.exec("ALTER TABLE download ADD COLUMN metadata_attempts INTEGER NOT NULL DEFAULT 0");
  }
}

ensureColumns();

export const db = drizzle(sqlite, { schema });
