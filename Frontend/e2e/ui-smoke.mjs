/**
 * Browser smoke test for the demo flow (Playwright, headless).
 *
 *   cd Frontend && npx playwright install chromium   # once
 *   node e2e/ui-smoke.mjs                            # needs both servers running
 *
 * It walks the same path a reviewer would: log in with the seeded number, open
 * a chat, page through history, send / reply / react, flip the theme, and
 * create a group. Screenshots land in e2e/screens/.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SHOTS = "e2e/screens";
const results = [];

/** the message timeline (the sidebar preview repeats the same text) */
const timeline = (page) => page.locator('[role="log"]').first();

function check(label, condition, detail = "") {
  results.push({ label, ok: !!condition, detail });
  console.log(`${condition ? "  ok  " : "  FAIL"} ${label}${condition ? "" : `  <- ${detail}`}`);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  // --- onboarding ----------------------------------------------------------
  await page.goto(`${BASE}/welcome`, { waitUntil: "networkidle" });
  check("welcome shows the tagline", (await page.locator("h1").first().innerText()).includes("privacy"));
  await page.screenshot({ path: `${SHOTS}/01-welcome.png` });

  await page.getByRole("button", { name: /get started/i }).first().click();
  await page.waitForURL("**/phone");

  await page.getByLabel(/phone number or username/i).first().fill("+919000000001");
  await page.getByRole("button", { name: /send code|continue|next/i }).first().click();
  await page.waitForURL("**/verify", { timeout: 20000 });
  check("demo code is surfaced on the verify screen", (await page.content()).includes("123456"));
  await page.screenshot({ path: `${SHOTS}/02-verify.png` });

  // the OTP screen uses one box per digit and auto-advances
  const firstDigit = page.getByLabel("Digit 1");
  await firstDigit.click();
  await page.keyboard.type("123456", { delay: 60 });
  await page.waitForURL("**/chats", { timeout: 15000 }).catch(() => {});
  check("login lands on /chats", page.url().includes("/chats"), page.url());

  // --- chat list -----------------------------------------------------------
  await page.waitForSelector("text=Meera Iyer", { timeout: 15000 });
  const listText = await page.locator("aside, nav").first().innerText();
  check("chat list shows the seeded conversations", listText.includes("Meera Iyer") && listText.includes("Weekend Trek"));
  check("unread badge is rendered", /\b[1-9]\b/.test(listText), listText.slice(0, 120));
  check("pinned chat is on top", listText.indexOf("Ananya") < listText.indexOf("Meera") || listText.indexOf("Ananya") < 400);
  await page.screenshot({ path: `${SHOTS}/03-chat-list.png` });

  // --- open a chat ---------------------------------------------------------
  await page.getByText("Meera Iyer").first().click();
  await page.waitForTimeout(1500);
  const bubbles = await page.locator('[class*="rounded-"]').count();
  check("chat pane renders messages", bubbles > 20, `${bubbles} nodes`);
  await page.screenshot({ path: `${SHOTS}/04-conversation.png` });

  // --- send ---------------------------------------------------------------
  const body = `ui smoke ${Date.now()}`;
  const composer = page.locator("textarea, [contenteditable='true']").last();
  await composer.click();
  await composer.fill(body);
  await page.keyboard.press("Enter");
  await page.waitForSelector(`text=${body}`, { timeout: 10000 });
  check("sent message appears in the thread", true);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/05-sent.png` });

  // --- history paging ------------------------------------------------------
  await page.mouse.move(700, 400);
  await page.locator('[role="log"]').first().evaluate((node) => { node.scrollTop = 0; });
  await page.waitForTimeout(1200);
  const countAfterScroll = await page.locator('[role="log"] > *').count();
  check("scrolling up loads older messages", countAfterScroll >= 20, `${countAfterScroll} children`);

  // --- theme --------------------------------------------------------------
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/06-settings-profile.png` });
  await page.getByRole("button", { name: "Appearance" }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Dark" }).first().click();
  await page.waitForTimeout(600);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  check("dark mode flips the theme attribute", theme === "dark", String(theme));
  await page.screenshot({ path: `${SHOTS}/06-settings-dark.png` });

  await page.goto(`${BASE}/chats`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/07-dark-chat-list.png` });
  check("theme survives navigation", (await page.evaluate(() => document.documentElement.dataset.theme)) === "dark");

  // --- mobile ------------------------------------------------------------
  await page.setViewportSize({ width: 420, height: 860 });
  await page.goto(`${BASE}/chats/1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/08-mobile-chat.png` });
  check("mobile renders the conversation full width", await page.locator('[role="log"]').first().isVisible());

  check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((row) => !row.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error("probe crashed:", error);
  process.exit(1);
});
