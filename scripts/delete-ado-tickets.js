import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deleteWorkItem } from "../lib/ado.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.resolve(__dirname, "../ticket-sync.txt");

const CONCURRENCY = 3;

const raw = fs.readFileSync(filePath, "utf8");
const json = JSON.parse(raw);
const ids = (json.link || json.links || [])
  .map((link) => {
    const m = link.match(/\/edit\/(\d+)(?:[/?#].*)?$/);
    return m ? Number(m[1]) : null;
  })
  .filter(Boolean);

console.log(`Found ${ids.length} work item IDs.`);

const results = { success: [], failed: [] };

async function worker(queue) {
  while (queue.length) {
    const id = queue.shift();
    try {
      await deleteWorkItem(id);
      console.log(`✓ deleted ${id}`);
      results.success.push(id);
    } catch (e) {
      const status = e.response?.status;
      console.error(`✗ failed ${id}: ${status ?? ""} ${e.message}`);
      results.failed.push({ id, status, message: e.message });
    }
  }
}

const queue = [...ids];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

console.log("\n=== Summary ===");
console.log(`success: ${results.success.length}`);
console.log(`failed:  ${results.failed.length}`);
if (results.failed.length) console.log(JSON.stringify(results.failed, null, 2));
process.exit(results.failed.length ? 1 : 0);
