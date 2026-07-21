export interface FileOperation {
  sourceAbsPath: string;
  destRelPath: string;
}

export interface FolderPlan {
  folderName: string;
  downloadId?: string;
  mediaType?: "movie" | "series";
  destinationBase: string;
  rootFolder: string;
  metadata?: { title: string; year: string | null };
  operations: FileOperation[];
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
