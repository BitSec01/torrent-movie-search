import { NextRequest } from 'next/server'
import { db } from '@/db'
import { download } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import path from 'node:path'

const execAsync = promisify(exec)

const STORAGE_ROOT = '/mnt/storage'
const MOVIES_DIR = `${STORAGE_ROOT}/Movies`
const SERIES_DIR = `${STORAGE_ROOT}/Series`
const TORRENTS_DIR = `${STORAGE_ROOT}/torrents`

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

function copyFileWithProgress(
  src: string,
  dst: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('rsync', ['--progress', '--whole-file', src, dst])
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      const match = chunk.toString().match(/(\d+)%/)
      if (match) onProgress(parseInt(match[1], 10))
    })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `rsync exited ${code}`))
    })
    proc.on('error', () => {
      execAsync(`cp ${shellEscape(src)} ${shellEscape(dst)}`).then(() => resolve()).catch(reject)
    })
  })
}

interface FileOperation {
  sourceAbsPath: string
  destRelPath: string
}

interface FolderPlan {
  folderName: string
  downloadId?: string
  destinationBase: string
  rootFolder: string
  operations: FileOperation[]
}

/**
 * POST /api/library/organize-execute
 * Executes a list of FolderPlans deterministically:
 * 1. Disk space check
 * 2. Delete existing destination root folder
 * 3. Create directory structure
 * 4. Copy each file with its new name
 * 5. Update DB record to "organized"
 *
 * Streams progress back via SSE.
 * Body: { plans: FolderPlan[] }
 */
export async function POST(req: NextRequest) {
  let plans: FolderPlan[]
  try {
    const body = await req.json()
    plans = body.plans
    if (!Array.isArray(plans) || plans.length === 0) {
      return Response.json({ error: 'plans array is required' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      ;(async () => {
        try {
          for (const plan of plans) {
            const { folderName, downloadId, rootFolder, destinationBase, operations } = plan

            let destRoot: string
            try {
              destRoot = sanitizePath(`${destinationBase}/${rootFolder}`)
            } catch {
              send('log', { folderName, action: 'ERROR', detail: 'Invalid destination path' })
              send('folder-error', { folderName, error: 'Invalid destination path' })
              continue
            }

            if (!destRoot.startsWith(MOVIES_DIR + '/') && !destRoot.startsWith(SERIES_DIR + '/')) {
              send('log', { folderName, action: 'ERROR', detail: `Destination not in Movies/ or Series/` })
              send('folder-error', { folderName, error: 'Destination outside allowed directories' })
              continue
            }

            send('log', { folderName, action: 'START', detail: `→ ${destRoot}` })

            // Disk space check
            try {
              const sourceDir = sanitizePath(`${TORRENTS_DIR}/${folderName}`)
              const { stdout: duOut } = await execAsync(`du -sb ${shellEscape(sourceDir)} 2>/dev/null`)
              const sourceBytes = parseInt(duOut.split('\t')[0], 10)
              const { stdout: dfOut } = await execAsync(
                `df --output=avail -B1 ${shellEscape(destinationBase)} 2>/dev/null | tail -1`
              )
              const availBytes = parseInt(dfOut.trim(), 10)

              if (!isNaN(sourceBytes) && !isNaN(availBytes) && sourceBytes > availBytes) {
                const msg = `Insufficient space: need ${(sourceBytes / 1e9).toFixed(1)} GB, have ${(availBytes / 1e9).toFixed(1)} GB`
                send('log', { folderName, action: 'ERROR', detail: msg })
                send('folder-error', { folderName, error: msg })
                continue
              }
              send('log', { folderName, action: 'INFO', detail: 'Disk space OK' })
            } catch {
              // non-fatal: proceed without the check
            }

            // Delete existing destination (clean slate)
            try {
              await execAsync(`rm -rf ${shellEscape(destRoot)}`)
              send('log', { folderName, action: 'DELETE', detail: `Cleared existing: ${destRoot}` })
            } catch {
              // already gone or never existed
            }

            // Create directory structure
            const dirs = new Set([destRoot])
            for (const op of operations) {
              dirs.add(path.dirname(path.join(destRoot, op.destRelPath)))
            }
            for (const dir of [...dirs]) {
              try {
                await execAsync(`mkdir -p ${shellEscape(dir)}`)
              } catch (e) {
                send('log', { folderName, action: 'ERROR', detail: `mkdir failed: ${e instanceof Error ? e.message : e}` })
              }
            }
            send('log', { folderName, action: 'MKDIR', detail: 'Directory structure created' })

            // Copy files
            let copied = 0
            let failed = 0

            for (const op of operations) {
              let safeSrc: string
              let safeDst: string
              try {
                safeSrc = sanitizePath(op.sourceAbsPath)
                safeDst = sanitizePath(path.join(destRoot, op.destRelPath))
              } catch {
                send('log', { folderName, action: 'ERROR', detail: 'Skipped: invalid path in operation' })
                failed++
                continue
              }

              const fileName = path.basename(safeDst)

              let sizeLabel = ''
              try {
                const { stdout } = await execAsync(`stat -c%s ${shellEscape(safeSrc)}`)
                const bytes = parseInt(stdout.trim(), 10)
                if (bytes > 1_073_741_824) sizeLabel = ` (${(bytes / 1_073_741_824).toFixed(1)} GB)`
                else if (bytes > 1_048_576) sizeLabel = ` (${(bytes / 1_048_576).toFixed(0)} MB)`
                else sizeLabel = ` (${(bytes / 1024).toFixed(0)} KB)`
              } catch {
                // ignore
              }

              send('log', { folderName, action: 'COPY', detail: `${fileName}${sizeLabel}` })

              try {
                let lastPct = -1
                await copyFileWithProgress(safeSrc, safeDst, (pct) => {
                  const rounded = Math.floor(pct / 10) * 10
                  if (rounded > lastPct) {
                    lastPct = rounded
                    send('progress', { folderName, fileName, pct })
                  }
                })
                send('log', { folderName, action: 'DONE', detail: fileName })
                copied++
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                send('log', { folderName, action: 'ERROR', detail: `${fileName}: ${msg}` })
                failed++
              }
            }

            // Update DB record if this folder has a tracked download
            if (downloadId) {
              try {
                db.update(download)
                  .set({ status: 'organized', destinationPath: destRoot, updatedAt: new Date() })
                  .where(eq(download.id, downloadId))
                  .run()
              } catch {
                // best-effort
              }
            }

            send('folder-complete', { folderName, destination: destRoot, copied, failed })
          }

          send('complete', { organized: plans.length })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          send('error', { error: msg })
        } finally {
          controller.close()
        }
      })()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
