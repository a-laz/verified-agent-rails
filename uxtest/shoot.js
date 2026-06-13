// VAR dashboard screenshot harness.
// Drives the demo arc through the backend API and screenshots the live dashboard
// between states, so usability evaluators (and the operator) can SEE each beat.
//
// Usage:  node shoot.js [outDir]
// Env:    FRONT (default http://localhost:3001)  API (default http://localhost:8000)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const FRONT = process.env.FRONT || "http://localhost:3001";
const API = process.env.API || "http://localhost:8000";
const OUT = path.resolve(process.argv[2] || path.join(__dirname, "shots"));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(ep, body) {
  try {
    const r = await fetch(`${API}/api/var/${ep}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    return await r.json();
  } catch (e) {
    console.error(`  api ${ep} failed:`, e.message);
    return { error: String(e) };
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  console.log(`Navigating ${FRONT}`);
  await page.goto(FRONT, { waitUntil: "networkidle" });
  await wait(3000); // let the 2s box poll land

  async function shot(name) {
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log("  shot", name);
  }

  // The judge-facing arc, beat by beat.
  await shot("01_initial");                                   // first impression (no mandate yet)
  await post("check", { amount: 10 }); await wait(2800); await shot("02_rejected");   // NO_PASSPORT
  await post("grant", { spendCap: 50, expiryMinutes: 60 }); await wait(2800); await shot("03_granted");
  await post("pay", { amount: 10 }); await wait(2800); await shot("04_paid");
  await post("pay", { amount: 999 }); await wait(2800); await shot("04b_overcap_blocked"); // cap enforcement
  await post("park", { amount: 20 }); await wait(2800); await shot("05_parked");
  await post("revoke", {}); await wait(1500); await post("check", { amount: 10 }); await wait(2800);
  await shot("06_revoked_lockedout");

  if (errors.length) {
    console.log("PAGE ERRORS:");
    for (const e of errors.slice(0, 20)) console.log("  -", e);
  }
  await browser.close();
  console.log("DONE ->", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
