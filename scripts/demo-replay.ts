import "dotenv/config";

async function main() {
  const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
  const response = await fetch(`${baseUrl}/api/demo/replay`, {
    method: "POST",
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.text();
    throw new Error(`Demo replay failed to start (${response.status}): ${errorBody}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    carry += decoder.decode(chunk.value, { stream: true });
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      console.log(line);

      if (line.startsWith("ERROR:")) {
        throw new Error(line);
      }
    }
  }

  if (carry.trim()) {
    console.log(carry);
    if (carry.startsWith("ERROR:")) {
      throw new Error(carry);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
