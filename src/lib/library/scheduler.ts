/**
 * Drives the unattended organise sweep on a timer.
 *
 * Runs inside the Next.js server process (ecosystem.config.js pins instances to
 * 1, so there is exactly one timer). Sweeps never overlap: the next tick is
 * scheduled only after the current one settles, and the DB claim guards against
 * an on-demand run racing a scheduled one.
 */

import { runAutoOrganize } from "./auto-organize";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 30 * 1000;

let timer: NodeJS.Timeout | null = null;

function intervalMs(): number {
  const raw = Number(process.env.AUTO_ORGANIZE_INTERVAL_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_INTERVAL_MS;
  return Math.max(raw, MIN_INTERVAL_MS);
}

export function isAutoOrganizeEnabled(): boolean {
  return process.env.AUTO_ORGANIZE !== "false";
}

async function tick(): Promise<void> {
  try {
    const result = await runAutoOrganize((message) => console.log("[Auto-organize]", message));
    if (result.claimed > 0) {
      console.log(
        `[Auto-organize] swept: ${result.organized} organised, ${result.failed} failed, ${result.skipped} skipped`
      );
    }
  } catch (err) {
    // Never let a bad sweep kill the timer — the next one may well succeed
    console.error("[Auto-organize] sweep error:", err);
  }
}

export function startAutoOrganizeScheduler(): void {
  if (timer || !isAutoOrganizeEnabled()) return;

  const period = intervalMs();
  console.log(`[Auto-organize] scheduler started, every ${Math.round(period / 1000)}s`);

  const loop = () => {
    timer = setTimeout(() => {
      void tick().finally(loop);
    }, period);
    // Never hold the process open on shutdown
    timer.unref();
  };

  loop();
}

export function stopAutoOrganizeScheduler(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
