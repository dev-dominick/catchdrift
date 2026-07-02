import "dotenv/config";
import { getEnv } from "@/lib/env";
import { processPendingJobs } from "@/domain/engine";

async function runWorkerLoop() {
  const env = getEnv();

  while (true) {
    try {
      const processed = await processPendingJobs(env.WORKER_ID, 50);
      if (processed === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } catch (error) {
      console.error("Worker loop failed", error instanceof Error ? error.message : error);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

runWorkerLoop().catch((error) => {
  console.error("Worker failed", error instanceof Error ? error.message : error);
  process.exit(1);
});
