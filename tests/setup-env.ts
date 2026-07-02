import dotenv from "dotenv";
import path from "node:path";

// Ensure integration tests read the same local config as app scripts.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
