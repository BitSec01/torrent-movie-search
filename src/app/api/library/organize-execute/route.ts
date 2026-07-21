import { NextRequest } from "next/server";
import { executePlans } from "@/lib/library/execute";
import type { FolderPlan } from "@/lib/library/types";

/**
 * POST /api/library/organize-execute
 * Executes reviewed plans, streaming progress back via SSE.
 * Body: { plans: FolderPlan[] }
 */
export async function POST(req: NextRequest) {
  let plans: FolderPlan[];
  try {
    const body = await req.json();
    plans = body.plans;
    if (!Array.isArray(plans) || plans.length === 0) {
      return Response.json({ error: "plans array is required" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      executePlans(plans, send)
        .catch((err) => send("error", { error: err instanceof Error ? err.message : String(err) }))
        .finally(() => controller.close());
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
