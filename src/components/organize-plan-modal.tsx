'use client'

import { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileOperation {
  sourceAbsPath: string
  destRelPath: string
}

export interface FolderPlan {
  folderName: string
  downloadId?: string
  mediaType?: 'movie' | 'series'
  destinationBase?: string
  rootFolder?: string
  metadata?: { title: string; year: string | null }
  operations?: FileOperation[]
  error?: string
}

type ModalState = 'loading' | 'review' | 'executing' | 'done'
type FolderExecState = 'pending' | 'running' | 'done' | 'error'

interface LogEntry {
  folderName: string
  action: string
  detail: string
}

type TreeNode =
  | { kind: 'file'; name: string; opIndex: number }
  | { kind: 'dir'; name: string; children: TreeNode[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTree(operations: FileOperation[]): TreeNode[] {
  const root: TreeNode[] = []
  for (let i = 0; i < operations.length; i++) {
    const parts = operations[i].destRelPath.split('/')
    let nodes = root
    for (let j = 0; j < parts.length - 1; j++) {
      const dirName = parts[j]
      let found = nodes.find(
        (n): n is TreeNode & { kind: 'dir' } => n.kind === 'dir' && n.name === dirName
      )
      if (!found) {
        found = { kind: 'dir', name: dirName, children: [] }
        nodes.push(found)
      }
      nodes = found.children
    }
    nodes.push({ kind: 'file', name: parts[parts.length - 1], opIndex: i })
  }
  return root
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface OrganizePlanModalProps {
  items: Array<{ folderName: string; downloadId?: string }>
  onClose: () => void
  onDone: () => void
}

export function OrganizePlanModal({ items, onClose, onDone }: OrganizePlanModalProps) {
  const [modalState, setModalState] = useState<ModalState>('loading')
  const [editedPlans, setEditedPlans] = useState<FolderPlan[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [editingFile, setEditingFile] = useState<{
    folderName: string
    opIndex: number
    value: string
  } | null>(null)
  const [folderStates, setFolderStates] = useState<Record<string, FolderExecState>>({})
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const fetchPlans = async () => {
    setModalState('loading')
    setLoadError(null)
    try {
      const res = await fetch('/api/library/organize-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Plan generation failed')

      const fetched: FolderPlan[] = data.plans
      setEditedPlans(fetched.map((p) => ({
        ...p,
        operations: p.operations?.map((op) => ({ ...op })) ?? [],
      })))
      // Auto-expand first folder
      if (fetched.length > 0) {
        setExpandedFolders(new Set([fetched[0].folderName]))
      }
      setModalState('review')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
      setModalState('review')
    }
  }

  const updateRootFolder = (folderName: string, value: string) => {
    setEditedPlans((prev) =>
      prev.map((p) => (p.folderName === folderName ? { ...p, rootFolder: value } : p))
    )
  }

  const commitFileEdit = () => {
    if (!editingFile) return
    const { folderName, opIndex, value } = editingFile
    setEditedPlans((prev) =>
      prev.map((p) => {
        if (p.folderName !== folderName) return p
        const ops = (p.operations ?? []).map((op, i) => {
          if (i !== opIndex) return op
          const slash = op.destRelPath.lastIndexOf('/')
          const dir = slash >= 0 ? op.destRelPath.slice(0, slash + 1) : ''
          return { ...op, destRelPath: dir + value }
        })
        return { ...p, operations: ops }
      })
    )
    setEditingFile(null)
  }

  const cancelFileEdit = () => setEditingFile(null)

  const toggleFolder = (folderName: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderName)) next.delete(folderName)
      else next.add(folderName)
      return next
    })
  }

  const handleOrganize = async () => {
    const validPlans = editedPlans.filter((p) => !p.error && p.operations && p.operations.length > 0)
    if (validPlans.length === 0) return

    setModalState('executing')
    const initStates: Record<string, FolderExecState> = {}
    validPlans.forEach((p) => { initStates[p.folderName] = 'pending' })
    setFolderStates(initStates)

    try {
      const res = await fetch('/api/library/organize-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plans: validPlans }),
      })

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          if (!part.trim()) continue
          let eventType = ''
          let eventData = ''
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7)
            else if (line.startsWith('data: ')) eventData = line.slice(6)
          }
          if (!eventData) continue

          try {
            const payload = JSON.parse(eventData)

            if (eventType === 'log') {
              if (payload.action === 'START') {
                setFolderStates((prev) => ({ ...prev, [payload.folderName]: 'running' }))
              }
              setLogs((prev) => [...prev, payload])
            } else if (eventType === 'progress') {
              const entry: LogEntry = {
                folderName: payload.folderName,
                action: 'PROGRESS',
                detail: `${payload.fileName}: ${payload.pct}%`,
              }
              setLogs((prev) => {
                const last = prev[prev.length - 1]
                if (last?.action === 'PROGRESS' && last?.folderName === payload.folderName) {
                  return [...prev.slice(0, -1), entry]
                }
                return [...prev, entry]
              })
            } else if (eventType === 'folder-complete') {
              setFolderStates((prev) => ({ ...prev, [payload.folderName]: 'done' }))
            } else if (eventType === 'folder-error') {
              setFolderStates((prev) => ({ ...prev, [payload.folderName]: 'error' }))
            } else if (eventType === 'complete') {
              setModalState('done')
            } else if (eventType === 'error') {
              setLogs((prev) => [...prev, { folderName: '', action: 'ERROR', detail: payload.error }])
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      setModalState('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setLogs((prev) => [...prev, { folderName: '', action: 'ERROR', detail: msg }])
    }
  }

  const validCount = editedPlans.filter((p) => !p.error && p.operations && p.operations.length > 0).length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-8">
      <div className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-700 rounded-2xl flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Organise Plan</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {modalState === 'loading' && 'AI is analysing files and generating the plan...'}
              {modalState === 'review' && (
                loadError
                  ? 'Failed to generate plan'
                  : `${validCount} folder${validCount !== 1 ? 's' : ''} ready — review names before organising`
              )}
              {modalState === 'executing' && 'Copying files...'}
              {modalState === 'done' && 'Organisation complete'}
            </p>
          </div>
          {modalState !== 'executing' && (
            <button
              onClick={modalState === 'done' ? onDone : onClose}
              className="rounded-lg p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)', minHeight: '200px' }}>
          {/* Loading */}
          {modalState === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16">
              <span className="h-10 w-10 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              <p className="mt-4 text-sm text-zinc-400">Analysing files and generating plan...</p>
              <p className="mt-1 text-xs text-zinc-600">{items.length} folder{items.length !== 1 ? 's' : ''}</p>
            </div>
          )}

          {/* Review: load error */}
          {modalState === 'review' && loadError && (
            <div className="p-6">
              <div className="rounded-lg bg-red-900/20 border border-red-800/50 p-4 text-sm text-red-400">
                {loadError}
              </div>
              <button
                onClick={fetchPlans}
                className="mt-3 text-xs text-zinc-400 hover:text-zinc-200 underline"
              >
                Retry
              </button>
            </div>
          )}

          {/* Review: plan cards */}
          {modalState === 'review' && !loadError && (
            <div className="divide-y divide-zinc-800/60">
              {editedPlans.map((plan) => (
                <PlanCard
                  key={plan.folderName}
                  plan={plan}
                  expanded={expandedFolders.has(plan.folderName)}
                  editingFile={editingFile}
                  onToggle={() => toggleFolder(plan.folderName)}
                  onRootFolderChange={(v) => updateRootFolder(plan.folderName, v)}
                  onFileEditStart={(opIndex, value) =>
                    setEditingFile({ folderName: plan.folderName, opIndex, value })
                  }
                  onFileEditChange={(value) =>
                    setEditingFile((prev) => (prev ? { ...prev, value } : null))
                  }
                  onFileEditCommit={commitFileEdit}
                  onFileEditCancel={cancelFileEdit}
                />
              ))}
            </div>
          )}

          {/* Executing / done */}
          {(modalState === 'executing' || modalState === 'done') && (
            <div>
              {/* Per-folder status rows */}
              <div className="divide-y divide-zinc-800/40">
                {editedPlans
                  .filter((p) => !p.error && p.operations && p.operations.length > 0)
                  .map((plan) => {
                    const state = folderStates[plan.folderName] ?? 'pending'
                    return (
                      <div key={plan.folderName} className="flex items-center gap-3 px-5 py-3">
                        <ExecStateIcon state={state} />
                        <span className="flex-1 min-w-0 truncate text-sm font-medium text-zinc-200">
                          {plan.rootFolder ?? plan.folderName}
                        </span>
                        <ExecStateBadge state={state} />
                      </div>
                    )
                  })}
              </div>

              {/* Scrollable log */}
              <div
                className="border-t border-zinc-800/60 p-3 space-y-0.5 overflow-y-auto"
                style={{ maxHeight: '320px', minHeight: '80px' }}
              >
                {logs.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-zinc-600 italic">Waiting...</p>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="flex gap-2 items-start px-2 py-1 rounded hover:bg-zinc-800/30">
                      <LogBadge action={log.action} />
                      <span className="text-xs text-zinc-400 break-all leading-relaxed">
                        {log.folderName && (
                          <span className="text-zinc-600 mr-1.5">{log.folderName}</span>
                        )}
                        {log.detail}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-zinc-800 px-6 py-4 flex items-center justify-between gap-3">
          {modalState === 'review' && (
            <>
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleOrganize}
                disabled={validCount === 0}
                className="flex items-center gap-2 rounded-lg bg-emerald-600/20 px-5 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                </svg>
                Organise Now ({validCount})
              </button>
            </>
          )}
          {modalState === 'executing' && (
            <p className="text-xs text-zinc-500 italic">Copying files — please wait...</p>
          )}
          {modalState === 'done' && (
            <button
              onClick={onDone}
              className="ml-auto rounded-lg bg-zinc-700 px-5 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600 transition"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── PlanCard ─────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  expanded,
  editingFile,
  onToggle,
  onRootFolderChange,
  onFileEditStart,
  onFileEditChange,
  onFileEditCommit,
  onFileEditCancel,
}: {
  plan: FolderPlan
  expanded: boolean
  editingFile: { folderName: string; opIndex: number; value: string } | null
  onToggle: () => void
  onRootFolderChange: (v: string) => void
  onFileEditStart: (opIndex: number, value: string) => void
  onFileEditChange: (v: string) => void
  onFileEditCommit: () => void
  onFileEditCancel: () => void
}) {
  const isMovie = plan.mediaType === 'movie'
  const fileCount = plan.operations?.length ?? 0
  const tree = plan.error || !plan.operations ? [] : buildTree(plan.operations)

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Expand toggle */}
        <button
          onClick={onToggle}
          disabled={!!plan.error}
          className="shrink-0 text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
        >
          <svg
            className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* Folder icon */}
        <svg
          className={`h-5 w-5 shrink-0 ${plan.error ? 'text-red-500/60' : isMovie ? 'text-blue-400/70' : 'text-emerald-400/70'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>

        {/* Root folder name — editable input, or error message */}
        {plan.error ? (
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-400 truncate">{plan.folderName}</p>
            <p className="text-xs text-red-500/70 truncate">{plan.error}</p>
          </div>
        ) : (
          <input
            type="text"
            value={plan.rootFolder ?? ''}
            onChange={(e) => onRootFolderChange(e.target.value)}
            className="flex-1 min-w-0 bg-zinc-800/50 border border-zinc-700/50 rounded px-2 py-1 text-sm font-medium text-zinc-200 focus:outline-none focus:border-purple-500/60 focus:bg-zinc-800"
          />
        )}

        {/* Destination badge */}
        {!plan.error && (
          <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            isMovie ? 'bg-blue-600/20 text-blue-400' : 'bg-emerald-600/20 text-emerald-400'
          }`}>
            {isMovie ? 'Movies' : 'Series'}
          </span>
        )}

        {/* File count */}
        {!plan.error && fileCount > 0 && (
          <span className="shrink-0 text-xs text-zinc-500">
            {fileCount} file{fileCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Expanded tree */}
      {expanded && !plan.error && tree.length > 0 && (
        <div className="mt-2 ml-7 pl-3 border-l border-zinc-800">
          <TreeNodes
            nodes={tree}
            folderName={plan.folderName}
            editingFile={editingFile}
            onFileEditStart={onFileEditStart}
            onFileEditChange={onFileEditChange}
            onFileEditCommit={onFileEditCommit}
            onFileEditCancel={onFileEditCancel}
          />
        </div>
      )}
    </div>
  )
}

// ─── Tree renderer ────────────────────────────────────────────────────────────

function TreeNodes({
  nodes,
  folderName,
  editingFile,
  onFileEditStart,
  onFileEditChange,
  onFileEditCommit,
  onFileEditCancel,
  depth = 0,
}: {
  nodes: TreeNode[]
  folderName: string
  editingFile: { folderName: string; opIndex: number; value: string } | null
  onFileEditStart: (opIndex: number, value: string) => void
  onFileEditChange: (v: string) => void
  onFileEditCommit: () => void
  onFileEditCancel: () => void
  depth?: number
}) {
  return (
    <div className={depth > 0 ? 'ml-4 pl-2 border-l border-zinc-800/50' : ''}>
      {nodes.map((node, i) => {
        if (node.kind === 'dir') {
          return (
            <div key={i} className="mt-1">
              <div className="flex items-center gap-2 py-1">
                <svg className="h-4 w-4 shrink-0 text-amber-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                <span className="text-sm text-zinc-400 font-medium">{node.name}/</span>
              </div>
              <TreeNodes
                nodes={node.children}
                folderName={folderName}
                editingFile={editingFile}
                onFileEditStart={onFileEditStart}
                onFileEditChange={onFileEditChange}
                onFileEditCommit={onFileEditCommit}
                onFileEditCancel={onFileEditCancel}
                depth={depth + 1}
              />
            </div>
          )
        }

        const isEditing =
          editingFile?.folderName === folderName && editingFile?.opIndex === node.opIndex
        const ext = node.name.split('.').pop()?.toLowerCase() ?? ''
        const isVideo = ['mkv', 'mp4', 'avi', 'm4v', 'wmv'].includes(ext)
        const isSub = ['srt', 'sub', 'ass', 'ssa', 'vtt', 'smi'].includes(ext)

        return (
          <div key={i} className="flex items-center gap-2 py-1">
            {isVideo ? (
              <svg className="h-4 w-4 shrink-0 text-blue-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
              </svg>
            ) : isSub ? (
              <svg className="h-4 w-4 shrink-0 text-emerald-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
            ) : (
              <svg className="h-4 w-4 shrink-0 text-zinc-500/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            )}

            {isEditing ? (
              <input
                autoFocus
                type="text"
                value={editingFile!.value}
                onChange={(e) => onFileEditChange(e.target.value)}
                onBlur={onFileEditCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onFileEditCommit()
                  if (e.key === 'Escape') onFileEditCancel()
                }}
                className="flex-1 min-w-0 bg-zinc-800 border border-purple-500/60 rounded px-2 py-0.5 text-xs text-zinc-200 focus:outline-none"
              />
            ) : (
              <button
                onClick={() => onFileEditStart(node.opIndex, node.name)}
                title="Click to edit filename"
                className="flex-1 min-w-0 text-left text-xs text-zinc-400 hover:text-zinc-200 truncate transition"
              >
                {node.name}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Status indicators ────────────────────────────────────────────────────────

function ExecStateIcon({ state }: { state: FolderExecState }) {
  if (state === 'pending') {
    return (
      <svg className="h-4 w-4 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
  if (state === 'running') {
    return (
      <svg className="h-4 w-4 shrink-0 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
      </svg>
    )
  }
  if (state === 'done') {
    return (
      <svg className="h-4 w-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
  return (
    <svg className="h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  )
}

function ExecStateBadge({ state }: { state: FolderExecState }) {
  const styles: Record<FolderExecState, string> = {
    pending: 'bg-zinc-700/50 text-zinc-500',
    running: 'bg-purple-600/20 text-purple-400',
    done: 'bg-emerald-600/20 text-emerald-400',
    error: 'bg-red-600/20 text-red-400',
  }
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[state]}`}>
      {state}
    </span>
  )
}

function LogBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    START: 'bg-blue-600/20 text-blue-400',
    INFO: 'bg-zinc-700/50 text-zinc-400',
    DELETE: 'bg-red-600/20 text-red-400',
    MKDIR: 'bg-amber-600/20 text-amber-400',
    COPY: 'bg-cyan-600/20 text-cyan-400',
    PROGRESS: 'bg-purple-600/20 text-purple-400',
    DONE: 'bg-emerald-600/30 text-emerald-300',
    ERROR: 'bg-red-600/30 text-red-300',
  }
  return (
    <span className={`shrink-0 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles[action] ?? 'bg-zinc-700 text-zinc-400'}`}>
      {action}
    </span>
  )
}
