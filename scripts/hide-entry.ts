import { openDatabase } from "../server/database.ts";
import { allEntries, hideEntry } from "../server/leaderboard.ts";

// Moderation without an admin UI (#67). Run on the machine that holds the data:
//   DATA_DIR=/data node scripts/hide-entry.ts --list
//   DATA_DIR=/data node scripts/hide-entry.ts <voyage id>
// A hidden entry leaves the public Leaderboard on the next read.
const arg = process.argv[2];
const db = openDatabase(process.env.DATA_DIR ?? "/data");

if (arg === "--list") {
  for (const e of allEntries(db)) console.log(`${e.voyageId}\t${e.hidden ? "hidden" : "shown"}\t${e.scoreMs}\t${e.players}`);
} else if (!arg) {
  console.error("usage: hide-entry.ts --list | <voyage id>");
  process.exitCode = 2;
} else if (hideEntry(db, arg)) {
  console.log(`hid ${arg}`);
} else {
  console.error(`no Leaderboard entry for ${arg}`);
  process.exitCode = 1;
}
db.close();
