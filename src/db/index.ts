import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const sqlite = new Database(
  path.resolve(process.cwd(), "sqlite.db")
);

export const db = drizzle(sqlite, { schema });
