/**
 * Next.js startup hook. Starts the unattended organise sweep so completed
 * downloads get filed without the library page being open in a browser.
 */
export async function register() {
  // The edge runtime has no filesystem or sqlite access the sweep depends on
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startAutoOrganizeScheduler } = await import("@/lib/library/scheduler");
  startAutoOrganizeScheduler();
}
