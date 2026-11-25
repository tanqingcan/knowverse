import "./env";
import { setTimeout as sleep } from "node:timers/promises";
import { pool } from "../src/db";
import { backfillChunkConcepts, indexEmbeddings } from "../src/server/retrieval/material-index";

async function main() {
  const watch = process.argv.includes("--watch");
  for (;;) {
    try {
      const concepts = await backfillChunkConcepts();
      const { modelKey, indexed } = await indexEmbeddings({ maxBatches: watch ? 64 : Infinity });
      if (!watch || concepts || indexed) console.log(JSON.stringify({ concepts, indexed, modelKey }));
    } catch (error) {
      if (!watch) throw error;
      console.error("资料索引暂未完成，30 秒后重试", error instanceof Error ? error.message : error);
    }
    if (!watch) return;
    await sleep(30_000);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());
