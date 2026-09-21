/* ══════════════════════════════════════════════════════════════════════
   /api/strategy-call is RETIRED · this suite guards the retirement
   ──────────────────────────────────────────────────────────────────────
   Superseded by iClosed on 21 Sep 2026. The endpoint answers 410 and the
   page no longer posts to it.

   The old 33-check suite is in git history at 8df65d4. It is not kept
   running here: a passing test against a retired endpoint is worse than
   no test, because it implies the path is supported.

   What these checks defend is the retirement itself. If someone
   reinstates the handler without reinstating the funnel, this fails.
   ══════════════════════════════════════════════════════════════════════ */

const { default: handler } = await import('../api/strategy-call.js');
const res = () => { const r = { statusCode: 0, payload: null, headers: {} };
  r.status = c => (r.statusCode = c, r); r.json = p => (r.payload = p, r);
  r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? '\x1b[32m\u2713\x1b[0m' : '\x1b[31m\u2717\x1b[0m'} ${label}${detail ? ' · ' + detail : ''}`);
  if (!cond) failures++;
};

console.log('\n\x1b[1mSTRATEGY CALL IS RETIRED\x1b[0m');

for (const method of ['POST', 'GET']) {
  const r = res();
  await handler({ method, body: { name: 'x', email: 'a@b.co' } }, r);
  check(`${method} answers 410 Gone`, r.statusCode === 410, String(r.statusCode));
}

const r = res();
await handler({ method: 'POST', body: {} }, r);
check('says where bookings go now', /\/strategy-call/.test(r.payload?.error || ''), r.payload?.error);

// The page must not post here any more, and must not fire our own Lead.
const fs = await import('node:fs/promises');
const page = await fs.readFile(new URL('../strategy-call.html', import.meta.url), 'utf8');
// Strip comments first. The page explains in a comment that it no longer
// posts here, and matching that explanation would fail on its own docs.
const code = page.replace(/<!--[\s\S]*?-->/g, '');
check('page does not post to the retired endpoint', !code.includes('/api/strategy-call'));
check('page fires NO custom Lead event', !/'Lead'/.test(page));
check('page still fires ViewContent', /ntc\.track\('ViewContent'/.test(page));
check('page still carries the Meta pixel', /fbq\('init'/.test(page));
check('scheduler slot is present', /id="scheduler"/.test(page));

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · the retirement holds and no Lead fires from this page'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
