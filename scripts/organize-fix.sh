#!/bin/bash
# Fix script: completes the remaining organization after the octal bug.
set -euo pipefail

S="/mnt/storage"
M="$S/Movies"
SR="$S/Series"
T="$S/torrents"

log() { echo "[$(date '+%H:%M:%S')] $1"; }
# Force decimal with 10# prefix to avoid octal issues
pad2() { printf "%02d" "$((10#$1))"; }

log "============================================"
log "  ORGANIZE FIX SCRIPT"
log "============================================"

# ─── REMAINING TORRENTS ───
log ""
log "── Finishing torrents cleanup ──"

# Overlord - remaining episodes (08, 10, 11, 12 weren't moved)
if [ -d "$T/[sam] Overlord [BD 1080p FLAC]" ]; then
  log "Finishing Overlord (2015) episodes"
  mkdir -p "$SR/Overlord (2015)/Season 01"
  for f in "$T/[sam] Overlord [BD 1080p FLAC]/"*.mkv; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    ep=$(echo "$base" | grep -oP 'Overlord - \K\d+')
    if [ -n "$ep" ]; then
      eppad=$(pad2 "$ep")
      dest="$SR/Overlord (2015)/Season 01/Overlord (2015) - s01e${eppad}.mkv"
      [ ! -f "$dest" ] && log "  MOVE: $base → Overlord (2015) - s01e${eppad}.mkv" && mv "$f" "$dest"
    fi
  done
  rm -rf "$T/[sam] Overlord [BD 1080p FLAC]"
  log "  Cleaned Overlord torrent folder"
fi

# Solo Leveling S1/S2 - duplicates, just remove
[ -d "$T/Solo Leveling S1 - Eng Dub - 2160p - Mesc" ] && log "Removing Solo Leveling S1 torrent dup" && rm -rf "$T/Solo Leveling S1 - Eng Dub - 2160p - Mesc"
[ -d "$T/Solo Leveling S2 - Eng Dub - 2160p - Mesc" ] && log "Removing Solo Leveling S2 torrent dup" && rm -rf "$T/Solo Leveling S2 - Eng Dub - 2160p - Mesc"
[ -f "$T/qbittorrent.log" ] && rm -f "$T/qbittorrent.log"

# ─── MOVIES RENAMING ───
log ""
log "── Renaming Movies ──"

# Door To Door (2002)
if [ -f "$M/Door To Door William H Macy.avi" ]; then
  log "Door to Door (2002)"
  mkdir -p "$M/Door to Door (2002)"
  mv "$M/Door To Door William H Macy.avi" "$M/Door to Door (2002)/Door to Door (2002).avi"
fi

# Oppenheimer (2023)
if [ -f "$M/Oppenheimer.2023.1080p.BluRay.DD5.1.x264-GalaxyRG.mkv" ]; then
  log "Oppenheimer (2023)"
  mkdir -p "$M/Oppenheimer (2023)"
  mv "$M/Oppenheimer.2023.1080p.BluRay.DD5.1.x264-GalaxyRG.mkv" "$M/Oppenheimer (2023)/Oppenheimer (2023).mkv"
fi

# The Boy Who Harnessed the Wind (2019)
if [ -f "$M/The.Boy.Who.Harnessed.The.Wind.2019.1080p.WEBRip.x264-[YTS.AM].mp4" ]; then
  log "The Boy Who Harnessed the Wind (2019)"
  mkdir -p "$M/The Boy Who Harnessed the Wind (2019)"
  mv "$M/The.Boy.Who.Harnessed.The.Wind.2019.1080p.WEBRip.x264-[YTS.AM].mp4" "$M/The Boy Who Harnessed the Wind (2019)/The Boy Who Harnessed the Wind (2019).mp4"
fi

# The Phenomenon (2020)
if [ -f "$M/The Phenomenon (2020).mkv" ]; then
  log "The Phenomenon (2020) → folder"
  mkdir -p "$M/The Phenomenon (2020)"
  mv "$M/The Phenomenon (2020).mkv" "$M/The Phenomenon (2020)/The Phenomenon (2020).mkv"
fi

# The Proposal (2009)
if [ -f "$M/The Proposal (2009).mkv" ]; then
  log "The Proposal (2009) → folder"
  mkdir -p "$M/The Proposal (2009)"
  mv "$M/The Proposal (2009).mkv" "$M/The Proposal (2009)/The Proposal (2009).mkv"
fi

# The Wrecking Crew (2026) - rename folder + files
if [ -d "$M/The Wrecking Crew (2026) [1080p] [WEBRip] [5.1] [YTS.BZ]" ]; then
  log "The Wrecking Crew (2026) → clean folder name"
  mkdir -p "$M/The Wrecking Crew (2026)"
  for f in "$M/The Wrecking Crew (2026) [1080p] [WEBRip] [5.1] [YTS.BZ]/"*.mp4; do
    [ -f "$f" ] && mv "$f" "$M/The Wrecking Crew (2026)/The Wrecking Crew (2026).mp4"
  done
  for f in "$M/The Wrecking Crew (2026) [1080p] [WEBRip] [5.1] [YTS.BZ]/"*.srt; do
    [ -f "$f" ] && mv "$f" "$M/The Wrecking Crew (2026)/The Wrecking Crew (2026).en.srt"
  done
  rm -rf "$M/The Wrecking Crew (2026) [1080p] [WEBRip] [5.1] [YTS.BZ]"
fi

# Unfinished Business (2015)
if [ -f "$M/Unfinished.Business.2015.1080p.BluRay.x264.YIFY.mp4" ]; then
  log "Unfinished Business (2015)"
  mkdir -p "$M/Unfinished Business (2015)"
  mv "$M/Unfinished.Business.2015.1080p.BluRay.x264.YIFY.mp4" "$M/Unfinished Business (2015)/Unfinished Business (2015).mp4"
fi

# We Bought a Zoo (2011) - move loose file into existing folder
if [ -f "$M/We.Bought.A.Zoo.2011.720p.BrRip.x264.YIFY.mp4" ]; then
  log "We Bought a Zoo (2011) → moving loose file into folder"
  mkdir -p "$M/We Bought a Zoo (2011)"
  mv "$M/We.Bought.A.Zoo.2011.720p.BrRip.x264.YIFY.mp4" "$M/We Bought a Zoo (2011)/We Bought a Zoo (2011).mp4"
fi

# ─── SERIES RENAMING ───
log ""
log "── Renaming Series ──"

# Billions S01 raw folder → Billions (2016)/Season 01/
if [ -d "$SR/Billions.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]" ]; then
  log "Billions (2016) Season 01"
  mkdir -p "$SR/Billions (2016)/Season 01"
  for f in "$SR/Billions.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]/"*.mkv; do
    [ -f "$f" ] || continue
    ep=$(basename "$f" | grep -oP 'S01E\K\d+')
    if [ -n "$ep" ]; then
      eppad=$(pad2 "$ep")
      mv "$f" "$SR/Billions (2016)/Season 01/Billions (2016) - s01e${eppad}.mkv"
      log "  s01e${eppad}"
    fi
  done
  rm -rf "$SR/Billions.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]"
fi

# Chicago Med S01 raw folder → merge into Chicago Med/Season 01
if [ -d "$SR/Chicago.Med.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]" ]; then
  log "Chicago Med Season 01 (from raw folder)"
  mkdir -p "$SR/Chicago Med/Season 01"
  for f in "$SR/Chicago.Med.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]/"*.mkv; do
    [ -f "$f" ] || continue
    ep=$(basename "$f" | grep -oP 'S01E\K\d+')
    if [ -n "$ep" ]; then
      eppad=$(pad2 "$ep")
      mv "$f" "$SR/Chicago Med/Season 01/Chicago Med - s01e${eppad}.mkv"
      log "  s01e${eppad}"
    fi
  done
  rm -rf "$SR/Chicago.Med.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]"
fi

# Chicago Med - zero-pad season folders
log "Chicago Med - padding season numbers"
for d in "$SR/Chicago Med/Season "?; do
  [ -d "$d" ] || continue
  num=$(basename "$d" | grep -oP '\d+')
  padded=$(pad2 "$num")
  target="$SR/Chicago Med/Season $padded"
  if [ "$d" != "$target" ]; then
    log "  Season $num → Season $padded"
    mv "$d" "$target"
  fi
done

# Rename Chicago Med episode files in all seasons
log "Chicago Med - renaming episode files"
for season_dir in "$SR/Chicago Med/Season "*/; do
  [ -d "$season_dir" ] || continue
  snum=$(basename "$season_dir" | grep -oP '\d+')
  spad=$(pad2 "$snum")
  for f in "$season_dir"*.mkv; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    # Skip already-renamed files
    echo "$base" | grep -qP "^Chicago Med - s\d+e\d+" && continue
    # Extract episode number from various patterns
    ep=$(echo "$base" | grep -oiP 'S\d+E\K\d+' || echo "$base" | grep -oiP '^S\d+E\K\d+' || echo "$base" | grep -oiP '^E\K\d+' || true)
    if [ -n "$ep" ]; then
      eppad=$(pad2 "$ep")
      mv "$f" "${season_dir}Chicago Med - s${spad}e${eppad}.mkv"
      log "  s${spad}e${eppad}"
    fi
  done
done

# Maid - merge raw folder + rename existing folder to Maid (2021)
if [ -d "$SR/Maid.S01.1080p.WEBRip.x265-RARBG[eztv.re]" ]; then
  log "Maid (2021) - merging raw folder into Season 01"
  mkdir -p "$SR/Maid (2021)/Season 01"
  for f in "$SR/Maid.S01.1080p.WEBRip.x265-RARBG[eztv.re]/"*.mp4; do
    [ -f "$f" ] || continue
    ep=$(basename "$f" | grep -oP 'S01E\K\d+')
    if [ -n "$ep" ]; then
      eppad=$(pad2 "$ep")
      mv "$f" "$SR/Maid (2021)/Season 01/Maid (2021) - s01e${eppad}.mp4"
      log "  s01e${eppad}"
    fi
  done
  rm -rf "$SR/Maid.S01.1080p.WEBRip.x265-RARBG[eztv.re]"
fi

# Maid existing folder → merge into Maid (2021)
if [ -d "$SR/Maid" ]; then
  log "Maid - merging old folder"
  mkdir -p "$SR/Maid (2021)/Season 01"
  for f in "$SR/Maid/"*.mp4; do
    [ -f "$f" ] || continue
    ep=$(basename "$f" | grep -oP 'S01E\K\d+')
    if [ -n "$ep" ]; then
      eppad=$(pad2 "$ep")
      dest="$SR/Maid (2021)/Season 01/Maid (2021) - s01e${eppad}.mp4"
      [ ! -f "$dest" ] && mv "$f" "$dest" && log "  s01e${eppad}"
    fi
  done
  # Move subs
  if [ -d "$SR/Maid/Subs" ]; then
    mkdir -p "$SR/Maid (2021)/Season 01/Subs"
    cp -r "$SR/Maid/Subs/"* "$SR/Maid (2021)/Season 01/Subs/" 2>/dev/null || true
    log "  Copied subtitle folders"
  fi
  rm -rf "$SR/Maid"
fi

# Solo Leveling → Solo Leveling (2024), S1→Season 01, S2→Season 02
if [ -d "$SR/Solo Leveling" ]; then
  log "Solo Leveling (2024) - restructuring"
  mv "$SR/Solo Leveling" "$SR/Solo Leveling (2024)"
fi
if [ -d "$SR/Solo Leveling (2024)" ]; then
  [ -d "$SR/Solo Leveling (2024)/S1" ] && mv "$SR/Solo Leveling (2024)/S1" "$SR/Solo Leveling (2024)/Season 01" && log "  S1 → Season 01"
  [ -d "$SR/Solo Leveling (2024)/S2" ] && mv "$SR/Solo Leveling (2024)/S2" "$SR/Solo Leveling (2024)/Season 02" && log "  S2 → Season 02"
  # Rename episodes
  for season_dir in "$SR/Solo Leveling (2024)/Season "*/; do
    [ -d "$season_dir" ] || continue
    snum=$(basename "$season_dir" | grep -oP '\d+')
    spad=$(pad2 "$snum")
    for f in "$season_dir"*.mkv; do
      [ -f "$f" ] || continue
      base=$(basename "$f")
      # Already renamed?
      echo "$base" | grep -qP "^Solo Leveling \(2024\)" && continue
      ep=$(echo "$base" | grep -oP "S0${snum}E\K\d+" || echo "$base" | grep -oP "S${spad}E\K\d+" || true)
      if [ -n "$ep" ]; then
        eppad=$(pad2 "$ep")
        # Extract episode name
        epname=$(echo "$base" | sed -E "s/.*S[0-9]+E[0-9]+ - //" | sed -E "s/ ?2160p.*//;s/ ?1080p.*//;s/ ?\-Mesc.*//;s/ ?- 2160p.*//;s/ ?SDR.*//;s/ ?Ai Upscale.*//;s/\.[^.]+$//" | sed 's/[[:space:]]*$//')
        if [ -n "$epname" ] && [ "$epname" != "$(echo "$base" | sed 's/\.[^.]+$//')" ]; then
          newname="Solo Leveling (2024) - s${spad}e${eppad} - ${epname}.mkv"
        else
          newname="Solo Leveling (2024) - s${spad}e${eppad}.mkv"
        fi
        mv "$f" "${season_dir}${newname}"
        log "  s${spad}e${eppad}"
      fi
    done
    # Clean junk
    rm -f "$season_dir"*.txt "$season_dir"*.jpg 2>/dev/null
    rm -rf "$season_dir/Screenshots" 2>/dev/null
  done
fi

# ─── FINAL CLEANUP ───
log ""
log "── Final cleanup ──"
find "$M" \( -name "*.txt" -o -name "*.jpg" -o -name "*.nfo" -o -name "*.png" -o -name "RARBG*" \) -delete 2>/dev/null
find "$SR" \( -name "*.txt" -o -name "*.jpg" -o -name "*.nfo" -o -name "NEW upcoming*" -o -name "*Downloaded from*" \) -delete 2>/dev/null
find "$SR" -name "Screenshots" -type d -exec rm -rf {} + 2>/dev/null
log "Cleaned junk files"

# ─── FINAL REPORT ───
log ""
log "============================================"
log "  DONE! Final structure:"
log "============================================"
echo ""
echo "MOVIES:"
echo "───────"
for d in "$M"/*/; do
  [ -d "$d" ] || continue
  echo "  $(basename "$d")/"
  find "$d" -maxdepth 1 -type f -printf "    %f\n" 2>/dev/null | sort
done
for f in "$M"/*; do
  [ -f "$f" ] && echo "  ⚠ LOOSE: $(basename "$f")"
done

echo ""
echo "SERIES:"
echo "───────"
for d in "$SR"/*/; do
  [ -d "$d" ] || continue
  echo "  $(basename "$d")/"
  for sd in "$d"*/; do
    [ -d "$sd" ] || continue
    count=$(find "$sd" -maxdepth 1 \( -name "*.mkv" -o -name "*.mp4" -o -name "*.avi" \) -type f | wc -l)
    echo "    $(basename "$sd")/ ($count episodes)"
  done
done

echo ""
echo "TORRENTS (remaining):"
echo "─────────────────────"
remaining=$(ls -1 "$T/" 2>/dev/null | wc -l)
if [ "$remaining" -eq 0 ]; then
  echo "  (empty - all organized!)"
else
  ls -1 "$T/"
fi
