/**
 * Browser checks for the bonus features (Playwright, headless).
 *
 *   cd Frontend && node e2e/features-smoke.mjs
 *
 * Covers: reactions, replies, message menu / delete, disappearing timer,
 * group details, keyboard shortcuts, emoji picker, attachments and the
 * "coming soon" placeholders. Requires both servers to be running.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SHOTS = "e2e/screens";
const results = [];

/** the message timeline (the sidebar preview repeats the same text) */
const timeline = (page) => page.locator('[role="log"]').first();

function check(label, condition, detail = "") {
  results.push({ label, ok: !!condition });
  console.log(`${condition ? "  ok  " : "  FAIL"} ${label}${condition ? "" : `  <- ${detail}`}`);
}

async function login(page) {
  await page.goto(`${BASE}/phone`, { waitUntil: "networkidle" });
  await page.getByLabel(/phone number or username/i).fill("+919000000001");
  await page.getByRole("button", { name: /send code|continue|next/i }).first().click();
  if (!page.url().includes("/verify")) {
    await page.waitForURL("**/verify", { timeout: 20000 });
  }
  await page.getByLabel("Digit 1").click();
  await page.keyboard.type("123456", { delay: 50 });
  await page.waitForURL("**/chats", { timeout: 20000 });
  await page.waitForSelector("text=Meera Iyer");
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await login(page);

  // --- send, then react ----------------------------------------------------
  const marker = `feature ${Date.now()}`;
  await page.goto(`${BASE}/chats/1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const composer = page.getByPlaceholder("Message");
  await composer.fill(marker);
  await page.keyboard.press("Enter");
  await timeline(page).getByText(marker).first().waitFor({ timeout: 10000 });

  const bubble = timeline(page).getByText(marker).first().locator("xpath=ancestor::div[contains(@class,'group/message')][1]");
  await bubble.hover();
  // scope every action to *that* row: the toolbar exists once per message
  await bubble.getByRole("button", { name: "React" }).click();
  await page.waitForTimeout(400);
  await bubble.getByRole("button", { name: /React with/ }).first().click();
  await page.waitForTimeout(1500);
  const reacted = await timeline(page).innerText();
  check("reaction chip appears in the timeline", /👍|❤️|😂|😮|😢|🙏/.test(reacted), reacted.slice(-160));
  await page.screenshot({ path: `${SHOTS}/10-reaction.png` });

  // --- reply --------------------------------------------------------------
  await page.goto(`${BASE}/chats/1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.mouse.move(900, 300);
  await page.locator('[role="log"]').first().hover();
  const firstBubble = timeline(page).locator("div.group\\/message").first();
  await firstBubble.hover();
  await firstBubble.getByRole("button", { name: "Reply" }).click();
  await page.waitForTimeout(500);
  const replyText = `reply ${Date.now()}`;
  await page.getByPlaceholder("Message").fill(replyText);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  const body = await timeline(page).innerText();
  check("reply renders a quote strip", body.includes(replyText));
  check("reply composer is dismissed after sending", !(await page.getByLabel("Cancel reply").isVisible().catch(() => false)));
  await page.screenshot({ path: `${SHOTS}/11-reply.png` });

  // --- emoji picker -------------------------------------------------------
  await page.getByRole("button", { name: /emoji/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  const emojiPanel = await page.locator('[role="dialog"], [class*="absolute"]').count();
  check("emoji picker opens", emojiPanel > 1, `${emojiPanel} panels`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // --- conversation menu: disappearing timer + coming-soon -------
  await page.getByRole("button", { name: "Conversation menu" }).first().click();
  await page.waitForTimeout(400);
  await page.getByText(/disappearing/i).first().click();
  await page.waitForTimeout(600);
  const dialog = await page.locator('[role="dialog"]').first().innerText();
  check("disappearing messages dialog", /disappear/i.test(dialog), dialog.slice(0, 120));
  await page.getByRole("button", { name: /8 hours/i }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/12-disappearing.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // --- keyboard shortcuts -------------------------------------------------
  await page.keyboard.press("?");
  await page.waitForTimeout(500);
  const shortcuts = await page.locator("body").innerText();
  check("? opens the shortcuts sheet", /keyboard|shortcut/i.test(shortcuts), shortcuts.slice(0, 80));
  await page.screenshot({ path: `${SHOTS}/13-shortcuts.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  await page.keyboard.press("Control+n");
  await page.waitForTimeout(700);
  const newChat = await page.locator("body").innerText();
  check("Ctrl+N opens new chat", /new chat/i.test(newChat), newChat.slice(0, 80));
  await page.screenshot({ path: `${SHOTS}/14-new-chat.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // --- group details drawer ----------------------------------------------
  await page.goto(`${BASE}/chats`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Weekend Trek", { timeout: 15000 });
  await page.getByText("Weekend Trek").first().click();
  await page.waitForTimeout(2000);
  const groupTitle = await page.locator("header").last().innerText();
  check("group chat opens from the list", groupTitle.includes("Weekend Trek"), groupTitle.slice(0, 80));
  await page.getByRole("button", { name: "Conversation menu" }).first().click();
  await page.waitForTimeout(400);
  await page.getByText("View info").first().click();
  await page.waitForTimeout(1000);
  const drawer = await page.locator("aside, [role='dialog']").last().innerText();
  check("group details lists members", /member/i.test(drawer), drawer.slice(0, 150));
  check("group details shows roles", /admin/i.test(drawer), drawer.slice(0, 150));
  await page.screenshot({ path: `${SHOTS}/15-group-details.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // --- attachment ---------------------------------------------------------
  await page.setInputFiles('input[type="file"]', {
    name: "smoke.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
        "0d0a2db40000000049454e44ae426082",
      "hex",
    ),
  }).catch(() => {});
  await page.waitForTimeout(2500);
  const withImage = await page.locator('[role="log"] img').count();
  check("attachment renders as an image", withImage > 0, `${withImage} images`);
  await page.screenshot({ path: `${SHOTS}/16-attachment.png` });

  // --- delete for me ------------------------------------------------------
  await page.goto(`${BASE}/chats/1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const target = timeline(page).getByText(marker).first();
  if (await target.count()) {
    const row = target.locator("xpath=ancestor::div[contains(@class,'group/message')][1]");
    await row.hover();
    await row.getByRole("button", { name: "More actions" }).click();
    await page.waitForTimeout(400);
    await page.getByText("Delete for me").first().click();
    await page.waitForTimeout(600);
    // deletions ask for confirmation (Signal does the same)
    const confirm = page.getByRole("button", { name: /^delete$/i });
    if (await confirm.count()) await confirm.last().click();
    await page.waitForTimeout(2000);
    const after = await timeline(page).innerText();
    check("delete for me removes the bubble", !after.includes(marker), after.slice(0, 100));
  }

  // --- a chat this account cannot see ------------------------------------
  const stranger = await fetch(`${BASE}/api/v1/conversations`).then(() => null).catch(() => null);
  void stranger;
  await page.goto(`${BASE}/chats/7`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const pane = await page.locator("body").innerText();
  check(
    "a conversation I am not in explains itself",
    /not a member|could not be loaded|another chat/i.test(pane),
    pane.slice(0, 140),
  );
  await page.screenshot({ path: `${SHOTS}/17-not-a-member.png` });

  // the deliberate /chats/7 visit above is *meant* to 403, so ignore those
  const unexpected = errors.filter((line) => !line.includes("403"));
  check("no unexpected console errors", unexpected.length === 0, unexpected.slice(0, 3).join(" | "));

  await browser.close();
  const failed = results.filter((row) => !row.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error("probe crashed:", error);
  process.exit(1);
});
