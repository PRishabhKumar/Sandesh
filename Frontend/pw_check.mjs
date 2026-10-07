import { chromium } from "playwright";
try {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:3000/welcome", { waitUntil: "domcontentloaded", timeout: 30000 });
  console.log("TITLE:", await page.title());
  console.log("H1:", (await page.locator("h1").first().innerText().catch(() => "none")).slice(0, 80));
  await browser.close();
} catch (e) {
  console.log("LAUNCH FAILED:", String(e).split("\n").slice(0, 4).join(" | "));
}
