/** Schema for the download table, kept in step with src/db/schema.ts */
export const DOWNLOAD_TABLE_DDL = `
  CREATE TABLE download (
    id TEXT PRIMARY KEY,
    hash TEXT NOT NULL UNIQUE,
    magnet TEXT NOT NULL,
    title TEXT NOT NULL,
    year TEXT,
    type TEXT NOT NULL,
    imdb_id TEXT,
    poster TEXT,
    total_seasons TEXT,
    torrent_name TEXT,
    original_path TEXT,
    destination_path TEXT,
    status TEXT NOT NULL DEFAULT 'downloading',
    error_message TEXT,
    organize_attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;
