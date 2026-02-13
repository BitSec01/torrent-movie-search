# 🎬 Torrent Movie Search

A self-hosted web application for searching movies and TV series, exploring detailed metadata, and managing torrent downloads — all from a beautiful, modern UI. Powered by an **AI Movie Librarian** chatbot that can recommend titles, search torrents, and kick off downloads for you.

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![SQLite](https://img.shields.io/badge/SQLite-DB-003B57?logo=sqlite)

---

## Features

### 🔍 Multi-Source Movie Search
Search across **IMDb** and **OMDB** simultaneously. Results are merged and deduplicated, showing posters, year, type (movie/series/episode), cast info, and available torrent links — all in one unified view.

### 🤖 AI Movie Librarian
A floating chat assistant powered by **OpenAI GPT** that can:
- Recommend movies based on your taste ("movies like Inception", "best 90s sci-fi")
- Search for specific titles and display them as visual cards
- Search torrent sites for available downloads
- Start downloads directly to your qBittorrent client
- Discuss options before downloading — it won't bulk-download without asking

### 🎥 Rich Movie Details
Click any movie card to open a detailed modal with:
- High-res poster, plot summary, genres, ratings (IMDb, Rotten Tomatoes, Metacritic)
- Director, writer, cast, language, country, awards, box office
- Direct link to IMDb page
- Available torrent links with seed/peer counts, file sizes, and one-click download

### 📥 qBittorrent Integration
Seamlessly connected to your **qBittorrent** instance:
- Add torrents via magnet links directly from the UI
- Real-time download status with progress %, speed, and ETA
- Visual indicators showing if a torrent is already downloaded or in progress
- Smart save paths — movies go to `/mnt/storage/Movies`, series to `/mnt/storage/torrents`

### 🗂️ Multiple View Modes
Switch between **Grid**, **List**, and **By Year** views to browse results your way.

### 🔐 Authentication
Built-in auth system using **Better Auth** with SQLite-backed sessions.

---

## Screenshots

> _Screenshots coming soon — the UI features a dark zinc/indigo theme with movie poster grids, a floating AI chat panel, and detailed movie modals._

<!-- Uncomment and add screenshot paths when available:
### Home / Search
![Search Page](docs/screenshots/search-page.png)

### Movie Detail Modal
![Movie Detail](docs/screenshots/movie-detail.png)

### AI Chat Assistant
![AI Chat](docs/screenshots/ai-chat.png)
-->

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Frontend** | React 19, Tailwind CSS 4 |
| **AI** | Vercel AI SDK + OpenAI |
| **Database** | SQLite via better-sqlite3 + Drizzle ORM |
| **Auth** | Better Auth |
| **Torrent Search** | torrent-search-api + custom TPB scraper |
| **Download Client** | qBittorrent Web API |
| **Forms** | TanStack Form + Zod validation |
| **Data Fetching** | TanStack Query |
| **Deployment** | PM2 on Raspberry Pi |

---

## Getting Started

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+
- A running **qBittorrent** instance with Web UI enabled
- An **OMDB API key** ([get one free](https://www.omdbapi.com/apikey.aspx))
- An **OpenAI API key** (for the AI chat feature)

### Installation

```bash
# Clone the repository
git clone git@github.com:BitSec01/torrent-movie-search.git
cd torrent-movie-search

# Install dependencies
npm install

# Copy environment template and fill in your values
cp .env.example .env
```

### Environment Variables

Edit `.env` with your configuration:

```env
BETTER_AUTH_SECRET=your-secret-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
OMDB_API_KEY=your-omdb-api-key
OPENAI_API_KEY=your-openai-api-key
QBITTORRENT_HOST=http://192.168.1.26:8080
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=your-qbt-password
```

### Database Setup

```bash
# Push the schema to SQLite
npm run db:push
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

---

## Deployment (Raspberry Pi with PM2)

The project includes a PM2 ecosystem config and an auto-update script for self-hosted deployment.

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the application
pm2 start ecosystem.config.js

# Save PM2 process list for auto-restart on reboot
pm2 save
pm2 startup
```

### Auto-Update (CI/CD)

A cron-based auto-update script checks for new commits on `main` every 2 minutes. If changes are detected, it pulls, rebuilds, and restarts the app automatically.

```bash
# The cron job is set up during deployment — see scripts/update.sh
```

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...all]/   # Better Auth endpoints
│   │   ├── chat/             # AI chat streaming endpoint
│   │   ├── movies/           # Movie search & detail APIs
│   │   └── torrents/         # Torrent download & status APIs
│   ├── layout.tsx            # Root layout with providers
│   └── page.tsx              # Home page
├── components/
│   ├── ai-chat.tsx           # Floating AI chat panel
│   ├── movie-card.tsx        # Movie poster card
│   ├── movie-detail-modal.tsx# Full detail modal with torrent links
│   ├── movie-grid.tsx        # Grid/List/Year view modes
│   ├── search-form.tsx       # Search form with filters
│   └── search-page.tsx       # Main search page orchestrator
├── db/                       # Drizzle ORM schema & connection
├── hooks/                    # React Query hooks
├── lib/
│   ├── api/                  # Backend API clients (IMDb, OMDB, torrents, qBittorrent)
│   └── auth.ts               # Auth configuration
└── providers/                # React context providers
```

---

## License

This project is for personal/educational use only. Respect copyright laws in your jurisdiction.
