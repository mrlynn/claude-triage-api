/**
 * Give a workshop cohort more free credit.
 *
 *   cd storefront
 *   MONGODB_URI=... npx tsx scripts/grant.mts --usd 5 octocat hubot
 *
 * Learners must have signed in once, so their account exists. The grant is
 * RAISED to the amount, never lowered and never added to: `$max` makes running
 * the script twice a no-op, which is the property you want from something a
 * facilitator runs from a terminal ten minutes before a session starts.
 *
 * Plain driver, no app imports: this runs outside Next, and reaching into lib/
 * would drag `server-only` along with it.
 */
import { MongoClient } from "mongodb";

const args = process.argv.slice(2);
const usdIndex = args.indexOf("--usd");
const usd = usdIndex >= 0 ? Number(args[usdIndex + 1]) : NaN;
const logins = args.filter((_, i) => i !== usdIndex && i !== usdIndex + 1);

if (!process.env.MONGODB_URI || !Number.isFinite(usd) || usd <= 0 || usd > 100 || logins.length === 0) {
  console.error("Usage: MONGODB_URI=... npx tsx scripts/grant.mts --usd <1-100> <github-login>...");
  process.exit(1);
}

const client = await new MongoClient(process.env.MONGODB_URI).connect();
try {
  const users = client.db(process.env.MONGODB_DB ?? "northwind_support").collection("users");
  for (const login of logins) {
    const result = await users.findOneAndUpdate(
      { login },
      { $max: { grantMicros: Math.round(usd * 1_000_000) } },
      { returnDocument: "after" },
    );
    if (!result) console.log(`${login}: not found (they need to sign in once first)`);
    else console.log(`${login}: grant $${(result.grantMicros / 1e6).toFixed(2)}, used $${(result.spentMicros / 1e6).toFixed(2)}`);
  }
} finally {
  await client.close();
}
