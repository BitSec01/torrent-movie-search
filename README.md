# Torrent Movie Search

A self-hosted web app for searching movies and TV series, managing torrent downloads, and organising your Plex media library — all from a modern dark UI. Powered by an **AI Movie Librarian** chatbot that can recommend titles, search torrents, and kick off downloads for you.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![SQLite](https://img.shields.io/badge/SQLite-DB-003B57?logo=sqlite)

---

## Features

- **Multi-source search** — IMDb + OMDB merged results with posters, ratings, and torrent links
- **AI Movie Librarian** — ChatGPT-powered assistant that recommends titles, searches torrents, and starts downloads
- **qBittorrent integration** — add magnets, track progress, real-time status
- **Library tab** — tracks all downloads with status (downloading → completed → organised), auto-enriches missing poster/IMDb data via OMDB on each status check
- **Organise tab** — 2×2 grid view of your storage; per-folder AI organiser copies torrent files into Plex-compatible structure (Movies/Series), merging without overwriting existing files
- **Authentication** — session-based login via Better Auth + SQLite

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, standalone output) |
| Frontend | React 19, Tailwind CSS 4 |
| AI | Vercel AI SDK + OpenAI |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| Auth | Better Auth |
| Torrent search | torrent-search-api + custom TPB scraper |
| Download client | qBittorrent Web API |
| Deployment | PM2 on Raspberry Pi (armv7l) |

---

## Local Development

### Prerequisites

- Node.js 18+
- A running qBittorrent instance with Web UI enabled
- OMDB API key — [get one free](https://www.omdbapi.com/apikey.aspx)
- OpenAI API key

### Setup

```bash
git clone git@github.com:BitSec01/torrent-movie-search.git
cd torrent-movie-search
npm install
cp .env.example .env
# Edit .env with your values (see section below)
npm run db:push   # creates sqlite.db with the schema
npm run dev       # http://localhost:3000
```

### Environment variables

```env
BETTER_AUTH_SECRET=your-secret-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000

OMDB_API_KEY=your-omdb-api-key
OPENAI_API_KEY=your-openai-api-key

QBITTORRENT_HOST=http://192.168.1.26:8080
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=your-qbt-password
```

---

## Deploying to Raspberry Pi

The app runs on a Raspberry Pi (armv7l) via PM2. The deploy process builds the Next.js standalone bundle on your dev machine, then rsyncs it to the Pi.

> **Important:** The Pi's `sqlite.db` is **never touched** by the deploy script. It is the source of truth for all download tracking data and must be preserved across deployments.

### One-time Pi setup

```bash
# On the Pi — install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Create the app directory
mkdir -p /home/bitsec/torrent-movie-search/logs

# Copy your .env to the Pi (only needed once, or when env vars change)
scp .env bitsec@192.168.1.26:/home/bitsec/torrent-movie-search/.env
```

On the Pi, install the native SQLite module (must be compiled on-device for armv7l):

```bash
ssh bitsec@192.168.1.26
cd /home/bitsec/torrent-movie-search
npm install better-sqlite3 bindings file-uri-to-path
```

Set up PM2 to restart on reboot:

```bash
pm2 startup    # follow the printed command to enable the systemd service
pm2 save
```

Set up SSH key auth from your dev machine so the deploy script works without a password:

```bash
# On your dev machine (one time)
ssh-copy-id bitsec@192.168.1.26
```

### Deploying

From your dev machine, in the project root:

```bash
./scripts/deploy.sh
```

This script:
1. Builds the Next.js standalone bundle locally (`npx next build --webpack`)
2. Rsyncs the build to the Pi — **`sqlite.db` is excluded** so the Pi database is never overwritten
3. Rsyncs static assets and the PM2 ecosystem config
4. Backs up the Pi's `.env` before sync and restores it after (so it is never replaced by the dev copy)
5. Restarts the app via `pm2 restart`

The app will be available at **http://192.168.1.26:3000**.

### What the rsync excludes

| Excluded | Reason |
|----------|--------|
| `node_modules/better-sqlite3` | Native module — must be compiled on the Pi (armv7l), not copied from x86 |
| `node_modules/bindings` | Dependency of better-sqlite3, same reason |
| `node_modules/file-uri-to-path` | Dependency of better-sqlite3, same reason |
| `sqlite.db` | **Live database** — Pi data must never be overwritten by a local dev copy |

### Checking the app after deploy

```bash
ssh bitsec@192.168.1.26 "pm2 list"
ssh bitsec@192.168.1.26 "pm2 logs torrent-movie-search --lines 30 --nostream"
```

### Troubleshooting

**App crashes — `Error: Cannot find module 'better-sqlite3'`**

The native module needs to be compiled on the Pi. SSH in and run:

```bash
cd /home/bitsec/torrent-movie-search
npm install better-sqlite3 bindings file-uri-to-path
pm2 restart ecosystem.config.js
```

**App crashes — missing env var (e.g. `BETTER_AUTH_SECRET`)**

```bash
scp .env bitsec@192.168.1.26:/home/bitsec/torrent-movie-search/.env
ssh bitsec@192.168.1.26 "pm2 restart ecosystem.config.js"
```

**Library shows no downloads after a fresh deploy**

The database (`sqlite.db`) lives on the Pi and is preserved across deploys. If it is missing (e.g. fresh install), the app will create a new empty one on first start. Run `npm run db:push` on the Pi, or simply start the app — Drizzle will auto-migrate.

---

## Storage Structure

The app expects media to live at `/mnt/storage` on the Pi:

```
/mnt/storage/
├── Movies/
│   └── Movie Title (Year)/
│       └── Movie Title (Year).mkv
├── Series/
│   └── Show Name (Year)/
│       └── Season 01/
│           └── Show Name (Year) - s01e01 - Episode Title.mkv
└── torrents/          ← qBittorrent save path (staging area)
```

The **Organise tab** AI reads from `torrents/` and copies files into `Movies/` or `Series/` with correct Plex naming. The original torrent folder is kept intact; existing files at the destination are skipped (safe to run multiple times or use as a merge tool).

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/                    # AI chat streaming
│   │   ├── library/
│   │   │   ├── check/               # Poll qBittorrent + enrich OMDB metadata
│   │   │   ├── organize/            # AI organiser for library downloads
│   │   │   ├── organize-folder/     # AI organiser for a single torrent folder
│   │   │   ├── organize-storage/    # Batch organiser for entire torrents dir
│   │   │   └── storage-tree/        # Directory tree API for Organise tab
│   │   ├── movies/                  # Search + detail
│   │   └── torrents/                # qBittorrent download + status
│   └── page.tsx
├── components/
│   ├── ai-chat.tsx
│   ├── library-page.tsx
│   ├── organize-page.tsx
│   └── search-page.tsx
├── db/                              # Drizzle schema + connection
├── lib/api/                         # IMDb, OMDB, torrent, qBittorrent clients
└── scripts/
    └── deploy.sh                    # Build + rsync to Pi
```

---

## License

Personal/educational use only. Respect copyright laws in your jurisdiction.
