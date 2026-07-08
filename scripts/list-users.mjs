// READ-ONLY: list users (no password hashes) so we can see who can log in.
import { readFile } from "node:fs/promises";
import { MongoClient } from "mongodb";
function envVal(t,k){const m=t.match(new RegExp(`^\\s*${k}\\s*=\\s*(.*)$`,"mi"));return m?m[1].trim():undefined;}
async function main(){
  const env=await readFile(".env.local","utf8");
  const client=new MongoClient(envVal(env,"MONGODB_URI"),{serverSelectionTimeoutMS:15000});
  await client.connect();
  const store=(await client.db(envVal(env,"MONGODB_DB")||"inventory").collection("app").findOne({_id:"store"})).data;
  const users = store.users ?? [];
  console.log(`users: ${users.length}`);
  for (const u of users) {
    const fmt = /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(u.passwordHash || "") ? "scrypt ok" : "MALFORMED";
    console.log(`  username=${u.username} | role=${u.role} | active=${u.active} | warehouseId=${u.warehouseId ?? "-"} | hash=${fmt} | created=${u.createdAt}`);
  }
  await client.close();
}
main().catch(e=>{console.error("✗",e.message);process.exit(1);});
