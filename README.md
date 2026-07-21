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
| Deployment | PM2 on Ubuntu 22.04 |

---

## Server Overview

The app runs on a home server (Ubuntu 22.04, static IP `192.168.1.26`) alongside several other services:

| Service | URL | Notes |
|---------|-----|-------|
| **Torrent Browser** | http://192.168.1.26 | This app — port 80 redirects to 3000 via iptables, managed by PM2 |
| **qBittorrent** | http://192.168.1.26:8090 | WebUI — set your own password on first login |
| **Plex** | http://192.168.1.26:32400/web | Claim with your Plex account, add Movies + Series libraries |
| **Samba** | `\\192.168.1.26\storage` | Network file share for `/mnt/storage` (user: bit1) |

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

QBITTORRENT_HOST=http://192.168.1.26:8090
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=your-qbt-password
```

Both of these are optional and fall back to the defaults shown:

```env
STORAGE_ROOT=/mnt/storage              # Movies/, Series/ and torrents/ hang off this
TPB_BASE=https://www3.thepiratebay3.to # override when the mirror moves
AUTO_ORGANIZE=true                     # set false to organise by hand only
AUTO_ORGANIZE_INTERVAL_MS=300000       # sweep period, clamped to a 30s minimum
CHAT_MODEL=gpt-5.4-nano                # drives nearly all API cost
ORGANIZE_MODEL=gpt-5.4-mini            # one call per download, cheap in aggregate
```

### Model cost

The chat agent loops up to 10 times per user message, so one message is up to
ten API requests with a context that grows each step. Its model choice therefore
dominates the bill — measured per 10-step turn with the real system prompt:

| model | $/turn |
|---|---|
| gpt-5.4 | $0.056 |
| gpt-5.4-mini | $0.017 |
| gpt-5.4-nano | $0.005 |

The organiser runs once per completed download, so it stays on a more capable
model. Change either via env and restart — no rebuild needed.

### Automatic organising

The server sweeps on a timer: it reconciles tracked downloads with qBittorrent,
then plans and files anything qBittorrent has finished — the same plan/execute
pipeline the review modal drives, without the review step.

- The sweep runs inside the app process, so it works with no browser open.
- A download is claimed by flipping it to `organizing`, so two sweeps (or a
  sweep and a manual run) can't both take the same item.
- A failure is retried once, then left `failed` in the library for you to look at.
- `POST /api/library/auto-organize` triggers a sweep on demand.

Organising overwrites an existing destination folder, exactly as the manual
flow does. Overwrites are logged with an `OVERWRITE` action so there is a trail.

---

## Deploying to Server

The app runs on an Ubuntu Server (x86_64) via PM2. The deploy process builds the Next.js standalone bundle on your dev machine, then rsyncs it to the server.

> **Important:** The server's `sqlite.db` is **never touched** by the deploy script. It is the source of truth for all download tracking data and is preserved across every deployment.

### One-time setup (first deploy only)

**Step 1 — SSH key auth** (from your dev machine):

```bash
ssh-copy-id bit1@192.168.1.26
```

**Step 2 — Server prerequisites** (already installed, but for reference):

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2
sudo npm install -g pm2

# Create app and logs directories
mkdir -p /home/bit1/torrent-movie-search/logs
```

**Step 3 — Run the first deploy** (from your dev machine):

```bash
./scripts/deploy.sh
```

**Step 4 — Compile native modules on the server:**

```bash
ssh bit1@192.168.1.26
cd /home/bit1/torrent-movie-search
npm install better-sqlite3 bindings file-uri-to-path
```

**Step 5 — Copy your `.env` to the server:**

```bash
scp .env bit1@192.168.1.26:/home/bit1/torrent-movie-search/.env
```

Edit the server `.env` to set a real `BETTER_AUTH_SECRET` (use `openssl rand -base64 32`) and your production API keys.

**Step 6 — Start the app and set it to restart on reboot:**

```bash
ssh bit1@192.168.1.26
cd /home/bit1/torrent-movie-search
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # prints a command — copy and run it to enable auto-start
```

The app will be available at **http://192.168.1.26:3000**.

---

### Subsequent deploys

Every deploy after the first is just one command from your dev machine:

```bash
./scripts/deploy.sh
```

This script:
1. Builds the Next.js standalone bundle locally (`npx next build --webpack`)
2. Rsyncs the build to the server — **`sqlite.db` is excluded** so the server database is never overwritten
3. Rsyncs static assets and the PM2 ecosystem config
4. Backs up the server's `.env` before sync and restores it after (so it is never replaced by the dev copy)
5. Restarts the app via `pm2 restart`

### What the rsync excludes

| Excluded | Reason |
|----------|--------|
| `node_modules/better-sqlite3` | Native module — must be compiled on the server |
| `node_modules/bindings` | Dependency of better-sqlite3, same reason |
| `node_modules/file-uri-to-path` | Dependency of better-sqlite3, same reason |
| `sqlite.db` | **Live database** — server data must never be overwritten by a local dev copy |

### Checking the app after deploy

```bash
ssh bit1@192.168.1.26 "pm2 list"
ssh bit1@192.168.1.26 "pm2 logs torrent-movie-search --lines 30 --nostream"
```

### Troubleshooting

**App crashes — `Error: Cannot find module 'better-sqlite3'`**

The native module needs to be compiled on the server. SSH in and run:

```bash
cd /home/bit1/torrent-movie-search
npm install better-sqlite3 bindings file-uri-to-path
pm2 restart ecosystem.config.js
```

**App crashes — missing env var (e.g. `BETTER_AUTH_SECRET`)**

```bash
scp .env bit1@192.168.1.26:/home/bit1/torrent-movie-search/.env
ssh bit1@192.168.1.26 "pm2 restart ecosystem.config.js"
```

**Library shows no downloads after a fresh deploy**

The database (`sqlite.db`) lives on the server and is preserved across deploys. If it is missing (e.g. fresh install), the app will create a new empty one on first start.

---

## Storage Structure

The app expects media to live at `/mnt/storage` on the server:

```
/mnt/storage/          (800GB ext4 LVM volume)
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

## Server Infrastructure

### Disk Layout

| Volume | Size | Mount | Purpose |
|--------|------|-------|---------|
| `/dev/sda2` | ~858GB | `/` | OS + applications + media storage |

Single ext4 partition on a 1TB disk. `/mnt/storage` is a directory on the root filesystem.

### Services

| Service | Managed by | Auto-start |
|---------|-----------|------------|
| Torrent Browser | PM2 | Yes (pm2 startup) |
| qBittorrent | systemd (`qbittorrent-nox.service`) | Yes |
| Plex | systemd (`plexmediaserver.service`) | Yes |
| Samba | systemd (`smbd.service`) | Yes |

### Network

- **Static IP:** `192.168.1.26/24` (configured via NetworkManager / nmcli)
- **Gateway:** `192.168.1.1`
- **DNS:** `192.168.1.1`, `8.8.8.8`, `1.1.1.1`
- **Port 80 → 3000** iptables redirect (persisted via iptables-persistent)
- **Samba** is bound to the local subnet only (`192.168.1.0/24`)

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
    └── deploy.sh                    # Build + rsync to server
```

---

## License

Personal/educational use only. Respect copyright laws in your jurisdiction.
