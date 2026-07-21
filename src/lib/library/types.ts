export interface FileOperation {
  sourceAbsPath: string;
  destRelPath: string;
}

/**
 * "replace" wipes the destination folder first, giving a clean slate after a
 * bad plan. "merge" leaves whatever is already there and copies alongside it —
 * required for series, where seasons and episodes arrive over separate
 * downloads and a wipe would destroy the ones already filed.
 */
export type ExecuteMode = "replace" | "merge";

export interface FolderPlan {
  folderName: string;
  downloadId?: string;
  mediaType?: "movie" | "series";
  destinationBase: string;
  rootFolder: string;
  metadata?: { title: string; year: string | null };
  operations: FileOperation[];
  /** Chosen per folder in the review modal; falls back to the caller's default */
  mode?: ExecuteMode;
}

export interface DestinationInfo {
  exists: boolean;
  /** Top-level names already in the destination, e.g. ["Season 01", "Season 02"] */
  entries: string[];
  fileCount: number;
}

/** A plan attempt either produced a plan or explains why it couldn't */
export type PlanResult = FolderPlan | { folderName: string; downloadId?: string; error: string };

export function isPlan(result: PlanResult): result is FolderPlan {
  return !("error" in result);
}

export interface ExecuteEvent {
  event: "log" | "progress" | "folder-complete" | "folder-error" | "complete" | "error";
  data: Record<string, unknown>;
}

export interface FolderOutcome {
  folderName: string;
  downloadId?: string;
  destination?: string;
  copied: number;
  failed: number;
  error?: string;
}
