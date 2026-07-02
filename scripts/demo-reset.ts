import "dotenv/config";

async function main() {
  const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
  const response = await fetch(`${baseUrl}/api/demo/reset`, {
    method: "POST",
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Demo reset failed (${response.status}): ${errorBody}`);
  }

  console.log("✓ Demo workspace reset");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
