import { NextRequest } from "next/server";
import { runDemoReplay } from "@/demo/scenario";
import { withAdvisoryLock } from "@/db/sql";

const DEMO_LOCK_ID = 4242001;

export async function POST(request: NextRequest) {
  void request;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        const lock = await withAdvisoryLock(DEMO_LOCK_ID, async () =>
          runDemoReplay({
            onStage: async (line) => {
              controller.enqueue(encoder.encode(`${line}\n`));
              await new Promise((resolve) => setTimeout(resolve, 180));
            },
          }),
        );

        if (!lock.acquired) {
          controller.enqueue(
            encoder.encode("ERROR: Demo replay already running. Please retry in a moment.\n"),
          );
          controller.close();
          return;
        }

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `ERROR: ${error instanceof Error ? error.message : "Unknown replay error"}\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
