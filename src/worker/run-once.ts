import "dotenv/config";
import { getEnv } from "@/lib/env";
import { processPendingJobs } from "@/domain/engine";

async function main() {
  const env = getEnv();
  const processed = await processPendingJobs(env.WORKER_ID, 500);
  console.log(`Processed ${processed} jobs`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
