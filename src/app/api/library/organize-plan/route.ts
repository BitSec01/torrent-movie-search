import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { download } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const STORAGE_ROOT = '/mnt/storage'
const TORRENTS_DIR = `${STORAGE_ROOT}/torrents`

const DEST_BASES = ['/mnt/storage/Movies', '/mnt/storage/Series'] as const

function sanitizePath(p: string): string {
  const resolved = p.replace(/\/+/g, '/').replace(/\.\./g, '')
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new Error(`Path outside allowed storage root`)
  }
  return resolved
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

function cleanTorrentName(raw: string): string {
  let name = raw
  name = name.replace(/^www\.[a-z0-9-]+\.[a-z]{2,}[\s.\-–—]+/i, '')
  name = name.replace(/^[\[(][a-z0-9._ -]+[\])]\s*/i, '')
  name = name.replace(/^[a-z0-9-]+\.(com|org|net|io|to|cc|me|info)[\s.\-–—]+/i, '')
  return name.trim() || raw
}

const folderPlanSchema = z.object({
  mediaType: z.enum(['movie', 'series']),
  destinationBase: z.enum(DEST_BASES),
  rootFolder: z.string().describe(
    'Destination root folder name, e.g. "Billions (2016)" or "War Machine (2026)"'
  ),
  metadata: z.object({
    title: z.string(),
    year: z.string().nullable(),
  }),
  operations: z.array(
    z.object({
      sourceAbsPath: z.string().describe(
        'Exact absolute path from the file listing — copy character-for-character'
      ),
      destRelPath: z.string().describe(
        'Path relative to rootFolder, e.g. "Season 01/Billions (2016) - s01e01.mkv" or "War Machine (2026).mkv"'
      ),
    })
  ),
})

const SYSTEM_PROMPT = `You are a Plex media library organizer. Given a list of files from a torrent download, produce a JSON plan to organize them into the correct Plex-compatible structure.

Rules:
- Movies → /mnt/storage/Movies. rootFolder: "Title (Year)". destRelPath: "Title (Year).ext"
- TV Series → /mnt/storage/Series. rootFolder: "Show Name (Year)". destRelPath: "Season 01/Show Name (Year) - s01e01.ext"
- Keep ONLY: video files (.mkv .mp4 .avi .m4v .wmv) and subtitle files (.srt .sub .ass .ssa .vtt .smi)
- Exclude everything else: .nfo .txt .jpg .jpeg .png .sfv .md5 .exe .dll .torrent .url and filenames containing "sample"
- Strip from filenames: quality tags (720p 1080p 2160p 4K BluRay BrRip WEBRip WEB-DL HDTV), codecs (x264 x265 HEVC AVC), audio tags (AAC DDP5.1 Atmos), release groups (YIFY RARBG etc)
- For subtitles: detect language from folder/filename (e.g. "English" → .en, "French" → .fr, "Dutch" → .nl, "Spanish" → .es). Default to .en if language is unknown
- Always use two-digit padding: Season 01, s01e01
- sourceAbsPath must be copied EXACTLY from the provided file listing — never modify or reconstruct source paths
- If DB title/year is provided, use those exact values in rootFolder and all filenames`

/**
 * POST /api/library/organize-plan
 * Accepts a list of torrent folder names, runs find on each, and asks AI to
 * produce a structured JSON plan of file copy+rename operations.
 * Body: { items: Array<{ folderName: string; downloadId?: string }> }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const items: Array<{ folderName: string; downloadId?: string }> = body.items

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 })
    }

    const plans = await Promise.all(
      items.map(async ({ folderName, downloadId }) => {
        let sourcePath: string
        try {
          sourcePath = sanitizePath(`${TORRENTS_DIR}/${folderName}`)
        } catch {
          return { folderName, downloadId, error: 'Invalid folder name' }
        }

        const cleanedName = cleanTorrentName(folderName)

        let fileListing = ''
        try {
          const { stdout } = await execAsync(
            `find ${shellEscape(sourcePath)} -type f 2>/dev/null | sort | head -500`
          )
          fileListing = stdout.trim()
        } catch {
          // ignore
        }

        if (!fileListing) {
          return { folderName, downloadId, error: 'Source folder not found or empty' }
        }

        let dbHint = ''
        if (downloadId) {
          try {
            const record = db.select().from(download).where(eq(download.id, downloadId)).get()
            if (record) {
              dbHint = `\nDB title: ${record.title}\nDB year: ${record.year ?? 'unknown'}\nDB type: ${record.type}`
            }
          } catch {
            // ignore
          }
        }

        try {
          const { object } = await generateObject({
            model: openai('gpt-4o-mini'),
            schema: folderPlanSchema,
            system: SYSTEM_PROMPT,
            prompt: `Torrent folder: ${folderName}
Clean name: ${cleanedName}${dbHint}

Files:
${fileListing}`,
          })

          return { folderName, downloadId, ...object }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { folderName, downloadId, error: msg }
        }
      })
    )

    return NextResponse.json({ plans })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
