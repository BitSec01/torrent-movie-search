#!/bin/bash
# One-time script to organize all legacy media files in /mnt/storage
# into proper Plex-compatible folder structure.
set -e

S="/mnt/storage"
M="$S/Movies"
SR="$S/Series"
T="$S/torrents"

log() { echo "[$(date '+%H:%M:%S')] $1"; }
logmv() { log "  MOVE: $1 → $2"; mv "$1" "$2"; }
logrm() { log "  DEL:  $1"; rm -rf "$1"; }
logmkdir() { log "  MKDIR: $1"; mkdir -p "$1"; }

log "============================================"
log "  LEGACY MEDIA ORGANIZER"
log "============================================"

# ─── PHASE 1: STRAY ITEMS AT /mnt/storage ROOT ───
log ""
log "── Phase 1: Stray items at /mnt/storage root ──"

# Chicago Med Season 4 folder at root
if [ -d "$S/Chicago Med Season 4" ]; then
  log "Moving stray Chicago Med Season 4 → Series/Chicago Med/Season 04"
  logmkdir "$SR/Chicago Med/Season 04"
  for f in "$S/Chicago Med Season 4/"*.mkv; do
    [ -f "$f" ] && logmv "$f" "$SR/Chicago Med/Season 04/"
  done
  logrm "$S/Chicago Med Season 4"
fi

# .torrent files
for f in "$S"/*.torrent; do
  [ -f "$f" ] && logrm "$f"
done

# ─── PHASE 2: ORGANIZE /mnt/storage/torrents ───
log ""
log "── Phase 2: Organize torrents folder ──"

# --- MOVIES FROM TORRENTS ---

# Inception (2010) - has .srt subtitle
if [ -d "$T/Inception (2010) [1080p]" ]; then
  log "Inception (2010) → Movies"
  logmkdir "$M/Inception (2010)"
  mv "$T/Inception (2010) [1080p]/"*.mp4 "$M/Inception (2010)/Inception (2010).mp4" 2>/dev/null || true
  mv "$T/Inception (2010) [1080p]/"*.srt "$M/Inception (2010)/Inception (2010).en.srt" 2>/dev/null || true
  logrm "$T/Inception (2010) [1080p]"
fi

# Little Man Tate (1991)
if [ -d "$T/Little Man Tate (1991) [1080p] [BluRay] [YTS.MX]" ]; then
  log "Little Man Tate (1991) → Movies"
  logmkdir "$M/Little Man Tate (1991)"
  mv "$T/Little Man Tate (1991) [1080p] [BluRay] [YTS.MX]/"*.mp4 "$M/Little Man Tate (1991)/Little Man Tate (1991).mp4" 2>/dev/null || true
  logrm "$T/Little Man Tate (1991) [1080p] [BluRay] [YTS.MX]"
fi

# Megan Leavey (2017) - loose file
if [ -f "$T/Megan.Leavey.2017.1080p.BRRip.6CH.MkvCage.mkv" ]; then
  log "Megan Leavey (2017) → Movies"
  logmkdir "$M/Megan Leavey (2017)"
  logmv "$T/Megan.Leavey.2017.1080p.BRRip.6CH.MkvCage.mkv" "$M/Megan Leavey (2017)/Megan Leavey (2017).mkv"
fi

# Phenomenon (1996) - loose file
if [ -f "$T/Phenomenon 1996 1080p BluRay HEVC x265 5.1 BONE.mkv" ]; then
  log "Phenomenon (1996) → Movies"
  logmkdir "$M/Phenomenon (1996)"
  logmv "$T/Phenomenon 1996 1080p BluRay HEVC x265 5.1 BONE.mkv" "$M/Phenomenon (1996)/Phenomenon (1996).mkv"
fi

# Ratatouille (2007) - has .srt subtitle
if [ -d "$T/Ratatouille (2007) [1080p]" ]; then
  log "Ratatouille (2007) → Movies"
  logmkdir "$M/Ratatouille (2007)"
  mv "$T/Ratatouille (2007) [1080p]/"*.mp4 "$M/Ratatouille (2007)/Ratatouille (2007).mp4" 2>/dev/null || true
  mv "$T/Ratatouille (2007) [1080p]/"*.srt "$M/Ratatouille (2007)/Ratatouille (2007).en.srt" 2>/dev/null || true
  logrm "$T/Ratatouille (2007) [1080p]"
fi

# The Martian (2015)
if [ -d "$T/The.Martian.2015.1080p.BluRay.H264.AAC-RARBG" ]; then
  log "The Martian (2015) → Movies"
  logmkdir "$M/The Martian (2015)"
  mv "$T/The.Martian.2015.1080p.BluRay.H264.AAC-RARBG/The.Martian.2015.1080p.BluRay.H264.AAC-RARBG.mp4" "$M/The Martian (2015)/The Martian (2015).mp4" 2>/dev/null || true
  logrm "$T/The.Martian.2015.1080p.BluRay.H264.AAC-RARBG"
fi

# The Wizard of Lies (2017)
if [ -d "$T/The.Wizard.of.Lies.2017.HDRip.XviD.AC3-EVO" ]; then
  log "The Wizard of Lies (2017) → Movies"
  logmkdir "$M/The Wizard of Lies (2017)"
  mv "$T/The.Wizard.of.Lies.2017.HDRip.XviD.AC3-EVO/The.Wizard.of.Lies.2017.HDRip.XviD.AC3-EVO.avi" "$M/The Wizard of Lies (2017)/The Wizard of Lies (2017).avi" 2>/dev/null || true
  logrm "$T/The.Wizard.of.Lies.2017.HDRip.XviD.AC3-EVO"
fi

# Ad Astra (2019)
if [ -d "$T/www.Torrenting.com - Ad Astra 2019 1080p BluRay x264-OFT" ]; then
  log "Ad Astra (2019) → Movies"
  logmkdir "$M/Ad Astra (2019)"
  mv "$T/www.Torrenting.com - Ad Astra 2019 1080p BluRay x264-OFT/"*.mkv "$M/Ad Astra (2019)/Ad Astra (2019).mkv" 2>/dev/null || true
  logrm "$T/www.Torrenting.com - Ad Astra 2019 1080p BluRay x264-OFT"
fi

# the.rip.2026 - SUSPICIOUS: contains .exe and .dll, likely malware
if [ -d "$T/the.rip.2026.multi.1080p.web.x264 ETHEL" ]; then
  log "⚠ the.rip.2026 contains .exe/.dll files - DELETING (likely malware)"
  logrm "$T/the.rip.2026.multi.1080p.web.x264 ETHEL"
fi

# --- DUPLICATES IN TORRENTS (already in Movies/) ---

# Oppenheimer - already in Movies/, remove torrent copy
if [ -d "$T/Oppenheimer.2023.1080p.BluRay.DD5.1.x264-GalaxyRG[TGx]" ]; then
  log "Oppenheimer (2023) - duplicate, removing torrent copy"
  logrm "$T/Oppenheimer.2023.1080p.BluRay.DD5.1.x264-GalaxyRG[TGx]"
fi

# The Boy Who Harnessed The Wind - already in Movies/
if [ -d "$T/The Boy Who Harnessed The Wind (2019) [WEBRip] [1080p] [YTS.AM]" ]; then
  log "The Boy Who Harnessed the Wind (2019) - duplicate, removing torrent copy"
  logrm "$T/The Boy Who Harnessed The Wind (2019) [WEBRip] [1080p] [YTS.AM]"
fi

# Door To Door - already in Movies/
if [ -d "$T/Door To Door William H Macy" ]; then
  log "Door to Door (2002) - duplicate, removing torrent copy"
  logrm "$T/Door To Door William H Macy"
fi

# Unfinished Business - already in Movies/
if [ -d "$T/Unfinished Business (2015) [1080p]" ]; then
  log "Unfinished Business (2015) - duplicate, removing torrent copy"
  logrm "$T/Unfinished Business (2015) [1080p]"
fi

# We Bought a Zoo - in Movies/ but torrent has .srt! Copy subtitle first.
if [ -d "$T/We Bought a Zoo (2011)" ]; then
  log "We Bought a Zoo (2011) - copying subtitle from torrent, then removing duplicate"
  if [ -f "$T/We Bought a Zoo (2011)/"*.srt 2>/dev/null ]; then
    logmkdir "$M/We Bought a Zoo (2011)"
    cp "$T/We Bought a Zoo (2011)/"*.srt "$M/We Bought a Zoo (2011)/We Bought a Zoo (2011).en.srt" 2>/dev/null || true
  fi
  logrm "$T/We Bought a Zoo (2011)"
fi

# --- SERIES FROM TORRENTS ---

# Billions S01 - also exists in Series/ as raw folder, remove torrent copy
if [ -d "$T/Billions.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]" ]; then
  log "Billions S01 - duplicate in torrents, removing"
  logrm "$T/Billions.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]"
fi

# Chicago Med Season 4 from torrents (folder)
if [ -d "$T/Chicago Med Season 4" ]; then
  log "Chicago Med S04 from torrents → Series/Chicago Med/Season 04"
  logmkdir "$SR/Chicago Med/Season 04"
  for f in "$T/Chicago Med Season 4/"*.mkv; do
    [ -f "$f" ] && logmv "$f" "$SR/Chicago Med/Season 04/"
  done
  logrm "$T/Chicago Med Season 4"
fi

# Maid S01 - duplicate in torrents, remove
if [ -d "$T/Maid.S01.1080p.WEBRip.x265-RARBG[eztv.re]" ]; then
  log "Maid S01 - duplicate in torrents, removing"
  logrm "$T/Maid.S01.1080p.WEBRip.x265-RARBG[eztv.re]"
fi

# Overlord S01
if [ -d "$T/[sam] Overlord [BD 1080p FLAC]" ]; then
  log "Overlord (2015) S01 → Series"
  logmkdir "$SR/Overlord (2015)/Season 01"
  for f in "$T/[sam] Overlord [BD 1080p FLAC]/"*.mkv; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    # Extract episode number: "[sam] Overlord - 01 [BD..." → 01
    ep=$(echo "$base" | grep -oP 'Overlord - \K\d+')
    if [ -n "$ep" ]; then
      eppad=$(printf "%02d" "$ep")
      logmv "$f" "$SR/Overlord (2015)/Season 01/Overlord (2015) - s01e${eppad}.mkv"
    else
      logmv "$f" "$SR/Overlord (2015)/Season 01/$base"
    fi
  done
  logrm "$T/[sam] Overlord [BD 1080p FLAC]"
fi

# Solo Leveling S1 - duplicate in torrents (already in Series/Solo Leveling)
if [ -d "$T/Solo Leveling S1 - Eng Dub - 2160p - Mesc" ]; then
  log "Solo Leveling S1 - duplicate in torrents, removing"
  logrm "$T/Solo Leveling S1 - Eng Dub - 2160p - Mesc"
fi

# Solo Leveling S2 - duplicate in torrents
if [ -d "$T/Solo Leveling S2 - Eng Dub - 2160p - Mesc" ]; then
  log "Solo Leveling S2 - duplicate in torrents, removing"
  logrm "$T/Solo Leveling S2 - Eng Dub - 2160p - Mesc"
fi

# Clean up junk in torrents
[ -f "$T/qbittorrent.log" ] && logrm "$T/qbittorrent.log"

# ─── PHASE 3: RENAME MOVIES IN PLACE ───
log ""
log "── Phase 3: Rename items in Movies/ ──"

# Door To Door William H Macy.avi → Door to Door (2002)/
if [ -f "$M/Door To Door William H Macy.avi" ]; then
  log "Renaming Door to Door (2002)"
  logmkdir "$M/Door to Door (2002)"
  logmv "$M/Door To Door William H Macy.avi" "$M/Door to Door (2002)/Door to Door (2002).avi"
fi

# Oppenheimer
if [ -f "$M/Oppenheimer.2023.1080p.BluRay.DD5.1.x264-GalaxyRG.mkv" ]; then
  log "Renaming Oppenheimer (2023)"
  logmkdir "$M/Oppenheimer (2023)"
  logmv "$M/Oppenheimer.2023.1080p.BluRay.DD5.1.x264-GalaxyRG.mkv" "$M/Oppenheimer (2023)/Oppenheimer (2023).mkv"
fi

# The Boy Who Harnessed the Wind
if [ -f "$M/The.Boy.Who.Harnessed.The.Wind.2019.1080p.WEBRip.x264-[YTS.AM].mp4" ]; then
  log "Renaming The Boy Who Harnessed the Wind (2019)"
  logmkdir "$M/The Boy Who Harnessed the Wind (2019)"
  logmv "$M/The.Boy.Who.Harnessed.The.Wind.2019.1080p.WEBRip.x264-[YTS.AM].mp4" "$M/The Boy Who Harnessed the Wind (2019)/The Boy Who Harnessed the Wind (2019).mp4"
fi

# The Phenomenon - already clean name, just needs folder
if [ -f "$M/The Phenomenon (2020).mkv" ]; then
  log "Wrapping The Phenomenon (2020) in folder"
  logmkdir "$M/The Phenomenon (2020)"
  logmv "$M/The Phenomenon (2020).mkv" "$M/The Phenomenon (2020)/The Phenomenon (2020).mkv"
fi

# The Proposal - already clean name, just needs folder
if [ -f "$M/The Proposal (2009).mkv" ]; then
  log "Wrapping The Proposal (2009) in folder"
  logmkdir "$M/The Proposal (2009)"
  logmv "$M/The Proposal (2009).mkv" "$M/The Proposal (2009)/The Proposal (2009).mkv"
fi

# The Wrecking Crew - folder name has junk tags, rename folder + files
if [ -d "$M/The Wrecking Crew (2026) [1080p] [WEBRip] [5.1] [YTS.BZ]" ]; then
  log "Renaming The Wrecking Crew (2026)"
  # Rename folder
  mv "$M/The Wrecking Crew (2026) [1080p] [WEBRip] [5.1] [YTS.BZ]" "$M/The Wrecking Crew (2026)"
  # Rename files inside
  for f in "$M/The Wrecking Crew (2026)/"*.mp4; do
    [ -f "$f" ] && logmv "$f" "$M/The Wrecking Crew (2026)/The Wrecking Crew (2026).mp4"
  done
  for f in "$M/The Wrecking Crew (2026)/"*.srt; do
    [ -f "$f" ] && logmv "$f" "$M/The Wrecking Crew (2026)/The Wrecking Crew (2026).en.srt"
  done
  # Clean junk
  rm -f "$M/The Wrecking Crew (2026)/"*.jpg "$M/The Wrecking Crew (2026)/"*.txt 2>/dev/null
fi

# Unfinished Business
if [ -f "$M/Unfinished.Business.2015.1080p.BluRay.x264.YIFY.mp4" ]; then
  log "Renaming Unfinished Business (2015)"
  logmkdir "$M/Unfinished Business (2015)"
  logmv "$M/Unfinished.Business.2015.1080p.BluRay.x264.YIFY.mp4" "$M/Unfinished Business (2015)/Unfinished Business (2015).mp4"
fi

# We Bought a Zoo
if [ -f "$M/We.Bought.A.Zoo.2011.720p.BrRip.x264.YIFY.mp4" ]; then
  log "Renaming We Bought a Zoo (2011)"
  logmkdir "$M/We Bought a Zoo (2011)"
  logmv "$M/We.Bought.A.Zoo.2011.720p.BrRip.x264.YIFY.mp4" "$M/We Bought a Zoo (2011)/We Bought a Zoo (2011).mp4"
fi

# ─── PHASE 4: RENAME SERIES IN PLACE ───
log ""
log "── Phase 4: Rename items in Series/ ──"

# Billions S01 folder → Billions (2016)/Season 01/
if [ -d "$SR/Billions.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]" ]; then
  log "Reorganizing Billions (2016) Season 01"
  logmkdir "$SR/Billions (2016)/Season 01"
  for f in "$SR/Billions.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]/"*.mkv; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    ep=$(echo "$base" | grep -oP 'S01E\K\d+')
    if [ -n "$ep" ]; then
      eppad=$(printf "%02d" "$ep")
      logmv "$f" "$SR/Billions (2016)/Season 01/Billions (2016) - s01e${eppad}.mkv"
    fi
  done
  logrm "$SR/Billions.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]"
fi

# Chicago Med S01 raw folder → merge into Chicago Med/Season 01
if [ -d "$SR/Chicago.Med.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]" ]; then
  log "Reorganizing Chicago Med Season 01 (from raw folder)"
  logmkdir "$SR/Chicago Med/Season 01"
  for f in "$SR/Chicago.Med.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]/"*.mkv; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    ep=$(echo "$base" | grep -oP 'S01E\K\d+')
    if [ -n "$ep" ]; then
      eppad=$(printf "%02d" "$ep")
      logmv "$f" "$SR/Chicago Med/Season 01/Chicago Med - s01e${eppad}.mkv"
    fi
  done
  logrm "$SR/Chicago.Med.S01.COMPLETE.720p.AMZN.WEBRip.x264-GalaxyTV[TGx]"
fi

# Chicago Med - zero-pad season folders (Season 1 → Season 01)
for d in "$SR/Chicago Med/Season "?; do
  [ -d "$d" ] || continue
  num=$(basename "$d" | grep -oP '\d+')
  padded=$(printf "%02d" "$num")
  target="$SR/Chicago Med/Season $padded"
  if [ "$d" != "$target" ]; then
    log "Padding: Season $num → Season $padded"
    mv "$d" "$target"
  fi
done

# Maid raw folder → merge into Maid (2021)/Season 01/
if [ -d "$SR/Maid.S01.1080p.WEBRip.x265-RARBG[eztv.re]" ]; then
  log "Reorganizing Maid (2021) Season 01 (merging raw folder)"
  logmkdir "$SR/Maid (2021)/Season 01"
  for f in "$SR/Maid.S01.1080p.WEBRip.x265-RARBG[eztv.re]/"*.mp4; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    ep=$(echo "$base" | grep -oP 'S01E\K\d+')
    if [ -n "$ep" ]; then
      eppad=$(printf "%02d" "$ep")
      logmv "$f" "$SR/Maid (2021)/Season 01/Maid (2021) - s01e${eppad}.mp4"
    fi
  done
  logrm "$SR/Maid.S01.1080p.WEBRip.x265-RARBG[eztv.re]"
fi

# Maid existing folder → merge into Maid (2021)/
if [ -d "$SR/Maid" ] && [ ! -d "$SR/Maid (2021)" ]; then
  log "Renaming Maid → Maid (2021)"
  mv "$SR/Maid" "$SR/Maid (2021)"
elif [ -d "$SR/Maid" ] && [ -d "$SR/Maid (2021)" ]; then
  # Merge Maid into Maid (2021)
  log "Merging Maid → Maid (2021)"
  logmkdir "$SR/Maid (2021)/Season 01"
  for f in "$SR/Maid/"*.mp4; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    ep=$(echo "$base" | grep -oP 'S01E\K\d+')
    if [ -n "$ep" ]; then
      eppad=$(printf "%02d" "$ep")
      target="$SR/Maid (2021)/Season 01/Maid (2021) - s01e${eppad}.mp4"
      [ ! -f "$target" ] && logmv "$f" "$target"
    fi
  done
  # Move subs if they exist
  if [ -d "$SR/Maid/Subs" ]; then
    logmkdir "$SR/Maid (2021)/Season 01/Subs"
    cp -r "$SR/Maid/Subs/"* "$SR/Maid (2021)/Season 01/Subs/" 2>/dev/null || true
  fi
  logrm "$SR/Maid"
fi

# Solo Leveling - rename S1/S2 to Season 01/Season 02 and add year
if [ -d "$SR/Solo Leveling" ]; then
  log "Reorganizing Solo Leveling (2024)"
  # Rename root
  if [ ! -d "$SR/Solo Leveling (2024)" ]; then
    mv "$SR/Solo Leveling" "$SR/Solo Leveling (2024)"
  fi
  # Rename season folders
  [ -d "$SR/Solo Leveling (2024)/S1" ] && mv "$SR/Solo Leveling (2024)/S1" "$SR/Solo Leveling (2024)/Season 01"
  [ -d "$SR/Solo Leveling (2024)/S2" ] && mv "$SR/Solo Leveling (2024)/S2" "$SR/Solo Leveling (2024)/Season 02"
  # Rename episode files inside each season
  for season_dir in "$SR/Solo Leveling (2024)/Season "*/; do
    [ -d "$season_dir" ] || continue
    snum=$(basename "$season_dir" | grep -oP '\d+')
    for f in "$season_dir"*.mkv; do
      [ -f "$f" ] || continue
      base=$(basename "$f")
      ep=$(echo "$base" | grep -oP "S0${snum}E\K\d+")
      if [ -n "$ep" ]; then
        eppad=$(printf "%02d" "$ep")
        # Extract episode name: "Solo Leveling - S01E01 - Im Used to It 2160p -Mesc.mkv" → "Im Used to It"
        epname=$(echo "$base" | sed -E "s/.*S[0-9]+E[0-9]+ - //" | sed -E "s/ ?2160p.*//;s/ ?1080p.*//;s/ ?-Mesc.*//;s/ ?- 2160p.*//;s/\.[^.]+$//")
        spad=$(printf "%02d" "$snum")
        if [ -n "$epname" ] && [ "$epname" != "$base" ]; then
          newname="Solo Leveling (2024) - s${spad}e${eppad} - ${epname}.mkv"
        else
          newname="Solo Leveling (2024) - s${spad}e${eppad}.mkv"
        fi
        logmv "$f" "${season_dir}${newname}"
      fi
    done
    # Clean junk
    rm -f "$season_dir"*.txt "$season_dir"*.jpg 2>/dev/null
    rm -rf "$season_dir/Screenshots" 2>/dev/null
  done
fi

# ─── PHASE 5: RENAME EPISODE FILES IN CHICAGO MED SEASONS ───
log ""
log "── Phase 5: Rename Chicago Med episode files ──"
for season_dir in "$SR/Chicago Med/Season "*/; do
  [ -d "$season_dir" ] || continue
  snum=$(basename "$season_dir" | grep -oP '\d+')
  spad=$(printf "%02d" "$snum")
  for f in "$season_dir"*.mkv; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    # Already renamed?
    echo "$base" | grep -qP "^Chicago Med - s\d+e\d+" && continue
    # Try to extract SxxExx pattern
    ep=$(echo "$base" | grep -oiP "S\d+E\K\d+")
    if [ -n "$ep" ]; then
      eppad=$(printf "%02d" "$ep")
      newname="Chicago Med - s${spad}e${eppad}.mkv"
      logmv "$f" "${season_dir}${newname}"
    else
      # Try "S04E01 Title.mkv" pattern (no S prefix in some names)
      ep=$(echo "$base" | grep -oiP "E\K\d+")
      if [ -n "$ep" ]; then
        eppad=$(printf "%02d" "$ep")
        newname="Chicago Med - s${spad}e${eppad}.mkv"
        logmv "$f" "${season_dir}${newname}"
      fi
    fi
  done
done

# ─── PHASE 6: FINAL CLEANUP ───
log ""
log "── Phase 6: Final cleanup ──"

# Remove junk files from all movie folders
find "$M" -name "*.txt" -delete 2>/dev/null
find "$M" -name "*.jpg" -delete 2>/dev/null
find "$M" -name "*.nfo" -delete 2>/dev/null
find "$M" -name "*.png" -delete 2>/dev/null
find "$M" -name "RARBG*" -delete 2>/dev/null
log "Cleaned junk files from Movies/"

# Remove junk from all series folders
find "$SR" -name "*.txt" -delete 2>/dev/null
find "$SR" -name "*.jpg" -delete 2>/dev/null
find "$SR" -name "*.nfo" -delete 2>/dev/null
find "$SR" -name "NEW upcoming releases*" -delete 2>/dev/null
find "$SR" -name "*Downloaded from*" -delete 2>/dev/null
find "$SR" -name "Screenshots" -type d -exec rm -rf {} + 2>/dev/null
log "Cleaned junk files from Series/"

log ""
log "============================================"
log "  ORGANIZATION COMPLETE!"
log "============================================"
log ""
log "── Final structure ──"
echo ""
echo "MOVIES:"
echo "───────"
for d in "$M"/*/; do
  [ -d "$d" ] && echo "  📁 $(basename "$d")"
  find "$d" -maxdepth 1 -type f -printf "     📄 %f\n" 2>/dev/null
done
for f in "$M"/*; do
  [ -f "$f" ] && echo "  📄 $(basename "$f")"
done

echo ""
echo "SERIES:"
echo "───────"
for d in "$SR"/*/; do
  [ -d "$d" ] || continue
  echo "  📁 $(basename "$d")"
  for sd in "$d"*/; do
    [ -d "$sd" ] || continue
    count=$(find "$sd" -maxdepth 1 -type f -name "*.mkv" -o -name "*.mp4" -o -name "*.avi" | wc -l)
    echo "     📁 $(basename "$sd") ($count episodes)"
  done
done

echo ""
echo "TORRENTS (remaining):"
echo "─────────────────────"
ls -1 "$T/" 2>/dev/null || echo "  (empty)"
