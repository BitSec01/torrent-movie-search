#!/bin/bash
# Deploy torrent-movie-search to server
# Builds locally (standalone mode) and rsyncs to the server.
# Usage: ./scripts/deploy.sh
#
# SSH key auth is assumed (run: ssh-copy-id bit1@192.168.1.26 once).

set -e

SERVER_USER="bit1"
SERVER_HOST="192.168.1.26"
SERVER_DIR="/home/bit1/torrent-movie-search"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

SSH_OPTS="-o StrictHostKeyChecking=no"
SSH_CMD="ssh $SSH_OPTS"
RSYNC_SSH="ssh $SSH_OPTS"

remote() {
  eval "$SSH_CMD $SERVER_USER@$SERVER_HOST \"$1\""
}

echo "==> Building Next.js (standalone + webpack)..."
cd "$PROJECT_DIR"
npx next build --webpack

echo "==> Syncing standalone build to $SERVER_USER@$SERVER_HOST..."

# Ensure target directories exist
remote "mkdir -p $SERVER_DIR/logs $SERVER_DIR/.next/static $SERVER_DIR/public 2>/dev/null || true"

# Back up .env before sync
remote "cp $SERVER_DIR/.env /tmp/.env.torrent-backup 2>/dev/null || true"

# Sync standalone server.
# Excludes:
#   - better-sqlite3/bindings/file-uri-to-path: native modules compiled on the
#     server, not copied from the dev machine.
#   - sqlite.db: the live database on the server must NEVER be overwritten.
rsync -az -e "$RSYNC_SSH" \
  --exclude='node_modules/better-sqlite3' \
  --exclude='node_modules/bindings' \
  --exclude='node_modules/file-uri-to-path' \
  --exclude='sqlite.db' \
  .next/standalone/ \
  "$SERVER_USER@$SERVER_HOST:$SERVER_DIR/"

# Sync static assets (standalone doesn't include these)
rsync -az -e "$RSYNC_SSH" \
  .next/static/ \
  "$SERVER_USER@$SERVER_HOST:$SERVER_DIR/.next/static/"

# Sync public folder if it exists
if [ -d "public" ]; then
  rsync -az -e "$RSYNC_SSH" \
    public/ \
    "$SERVER_USER@$SERVER_HOST:$SERVER_DIR/public/"
fi

# Sync ecosystem config + scripts
rsync -az -e "$RSYNC_SSH" \
  ecosystem.config.js \
  scripts/ \
  "$SERVER_USER@$SERVER_HOST:$SERVER_DIR/"

# Restore .env (rsync may have overwritten it with the dev version)
remote "cp /tmp/.env.torrent-backup $SERVER_DIR/.env 2>/dev/null || true"
remote "test -f $SERVER_DIR/.env || echo 'WARNING: No .env file on server! Copy .env.example and configure it.'"

echo "==> Restarting PM2..."
remote "cd $SERVER_DIR && pm2 restart ecosystem.config.js 2>/dev/null || pm2 start ecosystem.config.js"

echo "==> Deploy complete! App running at http://$SERVER_HOST:3000"
