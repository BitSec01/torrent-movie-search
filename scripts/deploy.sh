#!/bin/bash
# Deploy torrent-movie-search to Raspberry Pi
# Builds locally (standalone mode) and rsyncs to the Pi.
# Usage: ./scripts/deploy.sh
#
# Requires: sshpass (apt install sshpass)
# Set PI_PASS env var or it will prompt for password.

set -e

PI_USER="bitsec"
PI_HOST="192.168.1.26"
PI_DIR="/home/bitsec/torrent-movie-search"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# SSH/rsync helper using sshpass if available
SSH_OPTS="-o StrictHostKeyChecking=no"
if [ -n "$PI_PASS" ] && command -v sshpass &>/dev/null; then
  SSH_CMD="sshpass -p '$PI_PASS' ssh $SSH_OPTS"
  RSYNC_SSH="sshpass -p '$PI_PASS' ssh $SSH_OPTS"
else
  SSH_CMD="ssh $SSH_OPTS"
  RSYNC_SSH="ssh $SSH_OPTS"
fi

remote() {
  eval "$SSH_CMD $PI_USER@$PI_HOST \"$1\""
}

echo "==> Building Next.js (standalone + webpack)..."
cd "$PROJECT_DIR"
npx next build --webpack

echo "==> Syncing standalone build to $PI_USER@$PI_HOST..."

# Ensure target directories exist
remote "mkdir -p $PI_DIR/logs $PI_DIR/.next/static $PI_DIR/public 2>/dev/null || true"

# Back up .env before sync
remote "cp $PI_DIR/.env /tmp/.env.torrent-backup 2>/dev/null || true"

# Sync standalone server (includes minimal node_modules + server.js)
rsync -az -e "$RSYNC_SSH" \
  .next/standalone/ \
  "$PI_USER@$PI_HOST:$PI_DIR/"

# Sync static assets (standalone doesn't include these)
rsync -az -e "$RSYNC_SSH" \
  .next/static/ \
  "$PI_USER@$PI_HOST:$PI_DIR/.next/static/"

# Sync public folder if it exists
if [ -d "public" ]; then
  rsync -az -e "$RSYNC_SSH" \
    public/ \
    "$PI_USER@$PI_HOST:$PI_DIR/public/"
fi

# Sync ecosystem config + scripts
rsync -az -e "$RSYNC_SSH" \
  ecosystem.config.js \
  scripts/ \
  "$PI_USER@$PI_HOST:$PI_DIR/"

# Restore .env (rsync may have overwritten it with the dev version)
remote "cp /tmp/.env.torrent-backup $PI_DIR/.env 2>/dev/null || true"
remote "test -f $PI_DIR/.env || echo 'WARNING: No .env file on Pi! Copy .env.example and configure it.'"

echo "==> Restarting PM2..."
remote "cd $PI_DIR && pm2 restart ecosystem.config.js 2>/dev/null || pm2 start ecosystem.config.js"

echo "==> Deploy complete! App running at http://$PI_HOST"
