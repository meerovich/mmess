import { chromium, devices } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5173';
const iPhone = devices['iPhone 14'];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...iPhone, ignoreHTTPSErrors: true });
const page = await context.newPage();

page.on('console', msg => {
  if (msg.text().startsWith('[longpress]')) console.log('  LOG:', msg.text());
});

// Login
await page.goto(`${BASE_URL}/login`);
await page.fill('input[type="email"]', 'admin@chatboris.local');
await page.fill('input[type="password"]', 'AdminPass123!');
await page.click('button[type="submit"]');
await page.waitForURL('**/');
console.log('Logged in');

await page.click('text=tester');
await page.waitForTimeout(2000);
const convUrl = page.url();

// Helper: long-press bubble N from end, take screenshot
async function testMessage(fromEnd, name) {
  await page.goto(convUrl);
  await page.waitForTimeout(2000);

  const bubbles = await page.$$('[class*="bubble"]');
  const idx = bubbles.length - fromEnd;
  if (idx < 0) { console.log(`  ${name}: skip`); return; }

  const bubble = bubbles[idx];
  await bubble.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  const box = await bubble.boundingBox();
  if (!box) { console.log(`  ${name}: no bbox`); return; }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // touchstart
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const b = el?.closest('[class*="bubble"]') || el;
    if (!b) return;
    const t = new Touch({ identifier: 1, target: b, clientX: x, clientY: y });
    b.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true, cancelable: true,
      touches: [t], targetTouches: [t], changedTouches: [t]
    }));
  }, { x, y });

  await page.waitForTimeout(700);

  // touchend
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const b = el?.closest('[class*="bubble"]') || el;
    if (!b) return;
    b.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true, cancelable: true, touches: [], targetTouches: [],
      changedTouches: [new Touch({ identifier: 1, target: b, clientX: x, clientY: y })]
    }));
  }, { x, y });

  await page.waitForTimeout(300);
  await page.screenshot({ path: `E:/dev/mmess/test-ctx-${name}.png` });
  console.log(`  ${name}: saved (bubble ${idx}/${bubbles.length}, pos ${Math.round(box.y)})`);
}

// Test 7 messages from end (7=last, 1=7th from end)
await testMessage(7, 'msg1-short');
await testMessage(6, 'msg2-medium');
await testMessage(5, 'msg3-long');
await testMessage(4, 'msg4-tiny');
await testMessage(3, 'msg5-emoji');
await testMessage(2, 'msg6-markdown');
await testMessage(1, 'msg7-bottom');

await browser.close();
console.log('All done');
