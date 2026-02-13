#!/bin/bash
# Auto-update script for torrent-movie-search (standalone deployment)
# Checks for new commits on main, pulls, builds locally, rsyncs to Pi, restarts PM2.
# Designed to run via cron every 2 minutes on the DEVELOPMENT machine.
#
# For manual deployment, run: ./scripts/deploy.sh

APP_DIR="/home/bitsec/torrent-movie-search"
LOG_FILE="$APP_DIR/logs/update.log"
LOCK_FILE="/tmp/torrent-movie-search-update.lock"

# Ensure logs directory exists
mkdir -p "$APP_DIR/logs"

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
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
GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=no' git fetch origin main --quiet 2>/dev/null

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Update detected: $LOCAL -> $REMOTE" >> "$LOG_FILE"

# Pull latest changes
GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=no' git pull origin main --quiet >> "$LOG_FILE" 2>&1

# Restart PM2 app (the deploy script on dev machine handles build + rsync)
# For now, just restart if new files were deployed
pm2 restart torrent-movie-search >> "$LOG_FILE" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Update pulled and app restarted" >> "$LOG_FILE"
