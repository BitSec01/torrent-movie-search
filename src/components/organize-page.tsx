"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface StorageItem {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: string;
  children?: StorageItem[];
}

interface LogEntry {
  time: string;
  action: string;
  detail: string;
}

type StorageTree = Record<string, StorageItem[]>;

export function OrganizePage() {
  const [tree, setTree] = useState<StorageTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [organizingFolder, setOrganizingFolder] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["Movies", "Series", "torrents"])
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/library/storage-tree");
      if (res.ok) {
        const data = await res.json();
        setTree(data.tree);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleOrganiseFolder = async (folderName: string) => {
    setOrganizingFolder(folderName);
    setLogs([{ time: new Date().toISOString(), action: "START", detail: `Organising: ${folderName}` }]);
    try {
      const res = await fetch("/api/library/organize-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderName }),
      });
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
      if (data.error) {
        setLogs((prev) => [...prev, { time: new Date().toISOString(), action: "ERROR", detail: data.error }]);
      }
      await fetchTree();
    } catch (err) {
      setLogs((prev) => [
        ...prev,
        { time: new Date().toISOString(), action: "ERROR", detail: String(err) },
      ]);
    } finally {
      setOrganizingFolder(null);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const torrentsItems = tree?.torrents ?? [];

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-zinc-800/50">
        <div className="absolute inset-0 bg-linear-to-b from-purple-950/20 via-zinc-950 to-zinc-950" />
        <div className="relative mx-auto max-w-7xl px-4 pb-6 pt-16 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="bg-linear-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
                Organise
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                View and organise files in /mnt/storage
              </p>
            </div>
            <button
              onClick={fetchTree}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {loading && !tree ? (
          <div className="flex items-center justify-center py-24">
            <span className="h-10 w-10 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Top row: Movies and Series */}
            <MediaSection
              section="Movies"
              items={tree?.Movies ?? []}
              expanded={expandedSections.has("Movies")}
              expandedDirs={expandedDirs}
              onToggleSection={() => toggleSection("Movies")}
              onToggleDir={toggleDir}
            />
            <MediaSection
              section="Series"
              items={tree?.Series ?? []}
              expanded={expandedSections.has("Series")}
              expandedDirs={expandedDirs}
              onToggleSection={() => toggleSection("Series")}
              onToggleDir={toggleDir}
            />

            {/* Bottom row: Torrents and Log */}
            <TorrentsSection
              items={torrentsItems}
              expanded={expandedSections.has("torrents")}
              expandedDirs={expandedDirs}
              onToggleSection={() => toggleSection("torrents")}
              onToggleDir={toggleDir}
              organizingFolder={organizingFolder}
              onOrganise={handleOrganiseFolder}
            />

            <LogSection logs={logs} logEndRef={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

function MediaSection({
  section,
  items,
  expanded,
  expandedDirs,
  onToggleSection,
  onToggleDir,
}: {
  section: string;
  items: StorageItem[];
  expanded: boolean;
  expandedDirs: Set<string>;
  onToggleSection: () => void;
  onToggleDir: (path: string) => void;
}) {
  const colorClass = section === "Movies" ? "text-blue-400 border-blue-900/40" : "text-emerald-400 border-emerald-900/40";
  const countClass = section === "Movies" ? "text-blue-600" : "text-emerald-600";

  return (
    <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden" style={{ minHeight: "320px", maxHeight: "420px" }}>
      {/* Section header */}
      <button
        onClick={onToggleSection}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-zinc-800/30 transition shrink-0 border-b border-zinc-800/60"
      >
        <svg
          className={`h-4 w-4 text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className={`text-base font-bold ${colorClass.split(" ")[0]}`}>{section}/</span>
        <span className={`text-sm ${countClass}`}>{items.length} item{items.length !== 1 ? "s" : ""}</span>
      </button>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {expanded ? (
          items.length > 0 ? (
            <div className="px-2 py-2">
              {items.map((item) => (
                <TreeItem
                  key={item.path}
                  item={item}
                  depth={0}
                  expandedDirs={expandedDirs}
                  onToggleDir={onToggleDir}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-zinc-600 italic">Empty</p>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center py-10">
            <p className="text-sm text-zinc-600">Click to expand</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TorrentsSection({
  items,
  expanded,
  expandedDirs,
  onToggleSection,
  onToggleDir,
  organizingFolder,
  onOrganise,
}: {
  items: StorageItem[];
  expanded: boolean;
  expandedDirs: Set<string>;
  onToggleSection: () => void;
  onToggleDir: (path: string) => void;
  organizingFolder: string | null;
  onOrganise: (folderName: string) => void;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden" style={{ minHeight: "320px", maxHeight: "420px" }}>
      {/* Section header */}
      <button
        onClick={onToggleSection}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-zinc-800/30 transition shrink-0 border-b border-zinc-800/60"
      >
        <svg
          className={`h-4 w-4 text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-base font-bold text-amber-400">torrents/</span>
        <span className="text-sm text-amber-600">{items.length} item{items.length !== 1 ? "s" : ""}</span>
      </button>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {expanded ? (
          items.length > 0 ? (
            <div className="px-3 py-2 space-y-1">
              {items.map((item) => (
                <TorrentFolderRow
                  key={item.path}
                  item={item}
                  expandedDirs={expandedDirs}
                  onToggleDir={onToggleDir}
                  isOrganising={organizingFolder === item.name}
                  anyOrganising={organizingFolder !== null}
                  onOrganise={() => onOrganise(item.name)}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-zinc-600 italic">Torrents folder is empty</p>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center py-10">
            <p className="text-sm text-zinc-600">Click to expand</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TorrentFolderRow({
  item,
  expandedDirs,
  onToggleDir,
  isOrganising,
  anyOrganising,
  onOrganise,
}: {
  item: StorageItem;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  isOrganising: boolean;
  anyOrganising: boolean;
  onOrganise: () => void;
}) {
  const isDir = item.type === "directory";
  const expanded = expandedDirs.has(item.path);
  const hasChildren = isDir && item.children && item.children.length > 0;

  return (
    <div>
      <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 transition ${isOrganising ? "bg-purple-900/20" : "hover:bg-zinc-800/40"}`}>
        {/* Expand toggle for dirs */}
        {isDir ? (
          <button
            onClick={() => onToggleDir(item.path)}
            className="flex items-center gap-2 min-w-0 flex-1 text-left"
          >
            <svg
              className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <svg className="h-5 w-5 shrink-0 text-amber-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            <span className="truncate text-sm font-medium text-zinc-200">{item.name}</span>
            {item.children && (
              <span className="shrink-0 text-xs text-zinc-500">{item.children.length}</span>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-4 shrink-0" />
            <FileIcon name={item.name} />
            <span className="truncate text-sm text-zinc-300">{item.name}</span>
            {item.size && (
              <span className="shrink-0 text-xs text-zinc-500">{item.size}</span>
            )}
          </div>
        )}

        {/* Organise button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOrganise();
          }}
          disabled={anyOrganising}
          title={`Organise "${item.name}" into Movies or Series`}
          className={`shrink-0 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${
            isOrganising
              ? "bg-purple-600/30 text-purple-300"
              : "bg-purple-600/20 text-purple-400 hover:bg-purple-600/30"
          }`}
        >
          {isOrganising ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              Organising...
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Organise
            </>
          )}
        </button>
      </div>

      {/* Expanded children */}
      {isDir && expanded && hasChildren && (
        <div className="ml-6 mt-0.5 space-y-0.5">
          {item.children!.map((child) => (
            <div key={child.path} className="flex items-center gap-2 rounded px-2 py-1">
              {child.type === "directory" ? (
                <>
                  <svg className="h-4 w-4 shrink-0 text-amber-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                  <span className="truncate text-sm text-zinc-400">{child.name}/</span>
                </>
              ) : (
                <>
                  <FileIcon name={child.name} />
                  <span className="truncate text-sm text-zinc-500">{child.name}</span>
                  {child.size && <span className="shrink-0 text-xs text-zinc-600">{child.size}</span>}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LogSection({
  logs,
  logEndRef,
}: {
  logs: LogEntry[];
  logEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden" style={{ minHeight: "320px", maxHeight: "420px" }}>
      <div className="shrink-0 px-5 py-4 border-b border-zinc-800/60">
        <h2 className="text-base font-bold text-zinc-300">Organisation Log</h2>
        {logs.length > 0 && (
          <p className="text-xs text-zinc-600 mt-0.5">{logs.length} actions</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full py-10 text-center px-4">
            <p className="text-sm text-zinc-600">
              Click <span className="text-purple-400 font-medium">Organise</span> on a torrent folder to start.
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-2 items-start rounded-lg px-2 py-1.5 hover:bg-zinc-800/30">
                <LogBadge action={log.action} />
                <span className="text-sm text-zinc-400 break-all leading-relaxed">{log.detail}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

function LogBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    START: "bg-blue-600/20 text-blue-400",
    SCAN: "bg-indigo-600/20 text-indigo-400",
    LIST: "bg-zinc-700/50 text-zinc-400",
    MKDIR: "bg-amber-600/20 text-amber-400",
    MOVE: "bg-emerald-600/20 text-emerald-400",
    COPY: "bg-cyan-600/20 text-cyan-400",
    SKIP: "bg-zinc-600/20 text-zinc-500",
    RENAME: "bg-cyan-600/20 text-cyan-400",
    DELETE: "bg-red-600/20 text-red-400",
    COMPLETE: "bg-emerald-600/30 text-emerald-300",
    DONE: "bg-emerald-600/30 text-emerald-300",
    ERROR: "bg-red-600/30 text-red-300",
    INFO: "bg-zinc-700/50 text-zinc-400",
  };

  return (
    <span className={`shrink-0 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles[action] ?? "bg-zinc-700 text-zinc-400"}`}>
      {action}
    </span>
  );
}

function TreeItem({
  item,
  depth,
  expandedDirs,
  onToggleDir,
}: {
  item: StorageItem;
  depth: number;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
}) {
  const isDir = item.type === "directory";
  const expanded = expandedDirs.has(item.path);
  const hasChildren = isDir && item.children && item.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-2 rounded-lg py-1.5 text-sm transition ${
          isDir ? "cursor-pointer hover:bg-zinc-800/40" : ""
        }`}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={isDir ? () => onToggleDir(item.path) : undefined}
      >
        {isDir ? (
          <>
            <svg
              className={`h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <svg className="h-4 w-4 shrink-0 text-amber-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
            <span className="truncate font-medium text-zinc-200">{item.name}/</span>
            {item.children && (
              <span className="text-xs text-zinc-600">{item.children.length}</span>
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <FileIcon name={item.name} />
            <span className="truncate text-zinc-400">{item.name}</span>
            {item.size && (
              <span className="ml-auto shrink-0 text-xs text-zinc-600">
                {item.size}
              </span>
            )}
          </>
        )}
      </div>
      {isDir && expanded && hasChildren && (
        <div>
          {item.children!.map((child) => (
            <TreeItem
              key={child.path}
              item={child}
              depth={depth + 1}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  const videoExts = ["mkv", "mp4", "avi", "m4v", "wmv"];
  const subExts = ["srt", "sub", "ass", "ssa", "vtt", "smi"];

  if (videoExts.includes(ext || "")) {
    return (
      <svg className="h-4 w-4 shrink-0 text-blue-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
      </svg>
    );
  }
  if (subExts.includes(ext || "")) {
    return (
      <svg className="h-4 w-4 shrink-0 text-emerald-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 shrink-0 text-zinc-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}
