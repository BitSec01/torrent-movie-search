#!/bin/bash
# Auto-update script for torrent-movie-search
# Checks for new commits on main, pulls, rebuilds, and restarts PM2.
# Designed to run via cron every 2 minutes.

APP_DIR="/home/bitsec/torrent-movie-search"
LOG_FILE="$APP_DIR/logs/update.log"
LOCK_FILE="/tmp/torrent-movie-search-update.lock"

# Ensure logs directory exists
mkdir -p "$APP_DIR/logs"

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
  # Check if lock is stale (older than 10 minutes)
  if [ "$(find "$LOCK_FILE" -mmin +10 2>/dev/null)" ]; then
    rm -f "$LOCK_FILE"
  else
    exit 0
  fi
fi

trap "rm -f $LOCK_FILE" EXIT
touch "$LOCK_FILE"

cd "$APP_DIR" || exit 1

# Fetch latest from origin
git fetch origin main --quiet 2>/dev/null

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Update detected: $LOCAL -> $REMOTE" >> "$LOG_FILE"

# Pull latest changes
git pull origin main --quiet >> "$LOG_FILE" 2>&1

# Install dependencies (if package-lock.json changed)
npm ci --production=false >> "$LOG_FILE" 2>&1

# Rebuild
npm run build >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
  # Restart PM2 app
  pm2 restart torrent-movie-search >> "$LOG_FILE" 2>&1
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Update complete and app restarted" >> "$LOG_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Build failed! App not restarted." >> "$LOG_FILE"
fi
