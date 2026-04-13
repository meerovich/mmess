import { chromium, webkit, devices } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:5173';
const USE_WEBKIT = process.env.BROWSER === 'webkit';
const iPhone = devices['iPhone 14'];

const engine = USE_WEBKIT ? webkit : chromium;
console.log(`Using ${USE_WEBKIT ? 'WebKit (Safari)' : 'Chromium'}`);
const browser = await engine.launch({ headless: true });
const context = await browser.newContext({ ...iPhone, ignoreHTTPSErrors: true });
const page = await context.newPage();

page.on('console', msg => {
  const t = msg.text();
  if (t.startsWith('[longpress]') || msg.type() === 'error') console.log('  CONSOLE:', msg.type(), t.slice(0, 200));
});

// Login
await page.goto(`${BASE_URL}/login`);
await page.fill('input[type="email"]', 'admin@chatboris.local');
await page.fill('input[type="password"]', 'AdminPass123!');
await page.click('button[type="submit"]');
try {
  await page.waitForURL('**/', { timeout: 10000 });
} catch {
  // WebKit may not auto-navigate — check current URL
  console.log('Current URL after login:', page.url());
  await page.waitForTimeout(3000);
  if (page.url().includes('/login')) {
    // Try navigating manually
    await page.goto(`${BASE_URL}/`);
    await page.waitForTimeout(2000);
  }
}
console.log('Logged in, URL:', page.url());

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

  // Long-press via touchscreen tap-and-hold using CDP or mouse fallback
  if (USE_WEBKIT) {
    // WebKit doesn't allow `new Touch()`. Use Playwright touchscreen API.
    // Tap to generate touchstart, hold, then we can't hold with tap...
    // Use CDP-like approach: dispatch via page.evaluate with initTouchEvent fallback
    await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const b = el?.closest('[class*="bubble"]') || el;
      if (!b) return;
      // Safari fallback: use MouseEvent to trigger the same handler
      // Our native listener is on touchstart — try dispatching touchstart without Touch constructor
      try {
        const evt = new TouchEvent('touchstart', { bubbles: true, cancelable: true });
        // Monkey-patch touches
        Object.defineProperty(evt, 'touches', { value: [{ identifier: 1, target: b, clientX: x, clientY: y }] });
        Object.defineProperty(evt, 'targetTouches', { value: [{ identifier: 1, target: b, clientX: x, clientY: y }] });
        Object.defineProperty(evt, 'changedTouches', { value: [{ identifier: 1, target: b, clientX: x, clientY: y }] });
        b.dispatchEvent(evt);
      } catch(e) { console.log('touchstart fallback failed:', e.message); }
    }, { x, y });
    await page.waitForTimeout(700);
    await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const b = el?.closest('[class*="bubble"]') || el;
      if (!b) return;
      try {
        const evt = new TouchEvent('touchend', { bubbles: true, cancelable: true });
        Object.defineProperty(evt, 'touches', { value: [] });
        Object.defineProperty(evt, 'changedTouches', { value: [{ identifier: 1, target: b, clientX: x, clientY: y }] });
        b.dispatchEvent(evt);
      } catch(e) { console.log('touchend fallback failed:', e.message); }
    }, { x, y });
  } else {
    // Chromium: use synthetic Touch events
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
    await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const b = el?.closest('[class*="bubble"]') || el;
      if (!b) return;
      b.dispatchEvent(new TouchEvent('touchend', {
        bubbles: true, cancelable: true, touches: [], targetTouches: [],
        changedTouches: [new Touch({ identifier: 1, target: b, clientX: x, clientY: y })]
      }));
    }, { x, y });
  }

  await page.waitForTimeout(300);
  await page.screenshot({ path: `E:/dev/mmess/.screenshots/test-ctx-${name}.png` });
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
