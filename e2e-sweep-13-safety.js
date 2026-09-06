/**
 * Suite 13 — Visitor safety induction (SQCDP).
 *
 * The induction is the one part of registration with a compliance consequence:
 * it is what the site relies on to show a visitor was told the rules before
 * being let in. It had NO test coverage at all, which is how vpass came to
 * hardcode its own copy of the rule list and quietly print a different set from
 * the one vreg made people acknowledge.
 *
 * These assert the properties that must hold for the acknowledgement to mean
 * anything: the gate cannot be skipped, both pages show the SAME rules, and the
 * signature records WHICH version was agreed to.
 */
const fs   = require('fs');
const path = require('path');
const { launch, openPage, settle, makeRunner } = require('./e2e-lib');

const I18N = fs.readFileSync(path.join(__dirname, 'src', 'i18n.html'), 'utf8');

/** Opens sections and waits out the per-section minimum reading time. */
async function readSections(page, count) {
  await page.evaluate(n => {
    const r = document.querySelectorAll('#rulesList .rule');
    for (let i = 0; i < n; i++) r[i].click();
  }, count);
  // Longest section is 8 rules; the dwell is ~900ms per rule.
  await page.waitForFunction(
    n => document.querySelectorAll('#rulesList .rule.revealed').length >= n,
    count, { timeout: 15000 });
}

async function run() {
  const browser = await launch();
  const summary = [];

  // ── 13a · vreg: the induction gate ──────────────────────────────────────
  {
    const R = makeRunner('13a · Safety — the induction gate');
    const { page, context } = await openPage(browser, 'vreg');
    await settle(page, 800);

    await R.check('every rule is rendered, grouped into SQCDP sections', async () => {
      const got = await page.evaluate(() => ({
        secs:  document.querySelectorAll('#rulesList .rule').length,
        rules: document.querySelectorAll('#rulesList .rtxt').length,
        heads: [...document.querySelectorAll('#rulesList .rsec')].map(e => e.textContent.trim())
      }));
      if (got.secs !== 5) throw new Error('expected 5 SQCDP sections, got ' + got.secs);
      if (got.rules < 15) throw new Error('only ' + got.rules + ' rules rendered');
      // S, Q, C, D and P must each be present and in order.
      const letters = got.heads.map(h => h.charAt(0)).join('');
      if (letters !== 'SQCDP') throw new Error('sections out of order: ' + JSON.stringify(got.heads));
    });

    await R.check('rules start hidden and the acknowledgement is locked', async () => {
      const s = await page.evaluate(() => ({
        blurred: document.querySelectorAll('#rulesList .rule.blurred').length,
        ack:     document.getElementById('vSafetyAck').disabled,
        btn:     document.getElementById('regBtn').style.display
      }));
      if (s.blurred !== 5) throw new Error(s.blurred + ' of 5 sections blurred at load');
      if (!s.ack)          throw new Error('acknowledgement was enabled before anything was read');
      if (s.btn !== 'none')throw new Error('Register button visible before acknowledgement');
    });

    await R.check('a partly-read induction still cannot be acknowledged', async () => {
      // The gate must hold at 4 of 5 — an off-by-one here would let someone
      // register having never opened the last section.
      await readSections(page, 4);
      const s = await page.evaluate(() => ({
        count: document.getElementById('rulesCount').textContent.trim(),
        ack:   document.getElementById('vSafetyAck').disabled
      }));
      if (!/^4 \/ 5$/.test(s.count)) throw new Error('counter reads ' + s.count);
      if (!s.ack) throw new Error('acknowledgement unlocked with a section unread');
    });

    await R.check('reading every section unlocks the acknowledgement', async () => {
      await readSections(page, 5);
      const s = await page.evaluate(() => ({
        count: document.getElementById('rulesCount').textContent.trim(),
        ack:   document.getElementById('vSafetyAck').disabled
      }));
      if (!/^5 \/ 5$/.test(s.count)) throw new Error('counter reads ' + s.count);
      if (s.ack) throw new Error('acknowledgement still locked after reading everything');
    });

    await R.check('ticking it reveals Register and stamps the rule VERSION', async () => {
      await page.evaluate(() => {
        const cb = document.getElementById('vSafetyAck');
        cb.checked = true; cb.dispatchEvent(new Event('change'));
      });
      await settle(page, 200);
      const s = await page.evaluate(() => ({
        btn: document.getElementById('regBtn').style.display,
        at:  window.vSafetyAckAt || '',
        ver: window.vSafetyVersion || ''
      }));
      if (s.btn === 'none') throw new Error('Register still hidden after acknowledgement');
      if (!s.at)  throw new Error('no acknowledgement timestamp recorded');
      // A timestamp alone cannot say WHICH rules were agreed to once the
      // wording is edited, so the version must travel with it.
      if (!s.ver) throw new Error('no rule version recorded against the acknowledgement');
    });

    await R.check('un-ticking it hides Register and clears the stamp', async () => {
      await page.evaluate(() => {
        const cb = document.getElementById('vSafetyAck');
        cb.checked = false; cb.dispatchEvent(new Event('change'));
      });
      await settle(page, 200);
      const s = await page.evaluate(() => ({
        btn: document.getElementById('regBtn').style.display,
        at:  window.vSafetyAckAt || '', ver: window.vSafetyVersion || ''
      }));
      if (s.btn !== 'none') throw new Error('Register stayed visible after un-ticking');
      if (s.at || s.ver)    throw new Error('a withdrawn acknowledgement left a stamp behind');
    });

    await R.check('a section does not count until it has been open long enough', async () => {
      // Without a dwell, five taps clear the whole induction in ~3 seconds and
      // the acknowledgement stops meaning anything.
      const { page: p2, context: c2 } = await openPage(browser, 'vreg');
      try {
        await settle(p2, 800);
        await p2.evaluate(() => document.querySelectorAll('#rulesList .rule')[0].click());
        const immediate = await p2.evaluate(() => ({
          counted:  document.getElementById('rulesCount').textContent.trim(),
          reading:  document.querySelectorAll('#rulesList .rule.reading').length,
          revealed: document.querySelectorAll('#rulesList .rule.revealed').length
        }));
        if (immediate.revealed !== 0)
          throw new Error('a section counted as read the instant it was tapped');
        if (immediate.reading !== 1)
          throw new Error('tapped section is not in the reading state');
        // ...and it does land, once the time has actually passed.
        await p2.waitForFunction(
          () => document.querySelectorAll('#rulesList .rule.revealed').length === 1,
          null, { timeout: 15000 });
      } finally { await c2.close(); }
    });

    await R.check('an emergency contact can be recorded', async () => {
      const ok = await page.evaluate(() =>
        !!document.getElementById('vEmgName') && !!document.getElementById('vEmgPhone'));
      if (!ok) throw new Error('no emergency-contact fields on the form');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 13b · vreg + vpass show the SAME rules ──────────────────────────────
  {
    const R = makeRunner('13b · Safety — one list, both pages');
    const { page, context } = await openPage(browser, 'vpass');
    await settle(page, 800);

    await R.check('the carried pass lists exactly what was acknowledged', async () => {
      // vpass used to hardcode its own key array; a rule added to the induction
      // would then be acknowledged on vreg and missing from the pass.
      const got = await page.evaluate(() => {
        if (typeof renderSafetyRules !== 'function') return null;
        const d = document.createElement('div');
        d.innerHTML = renderSafetyRules();
        return {
          rules: d.querySelectorAll('.rules-num').length,
          secs:  d.querySelectorAll('.rules-sec').length
        };
      });
      if (!got) throw new Error('renderSafetyRules() not available on vpass');
      const want = await page.evaluate(() =>
        QRATT_SAFETY_SECTIONS.reduce((n, s) => n + s.rules.length, 0));
      if (got.rules !== want)
        throw new Error(`pass lists ${got.rules} rules but the induction has ${want}`);
      if (got.secs !== 5)
        throw new Error('pass shows ' + got.secs + ' SQCDP sections');
    });

    summary.push(R.report());
    await context.close();
  }

  // ── 13d · induction expiry (server-side rule) ───────────────────────────
  {
    const R = makeRunner('13d · Safety — the induction expires');

    // _safetyAckValid_ decides whether a returning visitor may skip the
    // induction. It runs on the server precisely so the page cannot wave
    // itself through, so it is exercised here directly against a stub Config.
    const src  = fs.readFileSync(path.join(__dirname, 'src', 'visitors.js'), 'utf8');
    const body = (src.match(/function _safetyAckValid_[\s\S]*?\n}/) || [])[0];
    let CFG = {};
    const valid = body
      ? new Function('getConfigValue', body + '; return _safetyAckValid_;')(k => CFG[k] === undefined ? '' : CFG[k])
      : null;
    const daysAgo = d => new Date(Date.now() - d * 86400000).toISOString();

    await R.check('an unsigned or unreadable acknowledgement never passes', async () => {
      if (!valid) throw new Error('_safetyAckValid_ not found in src/visitors.js');
      CFG = {};
      if (valid('', ''))            throw new Error('empty acknowledgement accepted');
      if (valid('not-a-date', ''))  throw new Error('unparseable timestamp accepted');
    });

    await R.check('it lapses after the configured window', async () => {
      CFG = {};
      if (!valid(daysAgo(330), '')) throw new Error('11-month-old ack rejected under a 12-month default');
      if (valid(daysAgo(400), ''))  throw new Error('13-month-old ack still accepted');
      CFG = { SafetyInductionMonths: '6' };
      if (!valid(daysAgo(150), '')) throw new Error('5-month-old ack rejected under a 6-month window');
      if (valid(daysAgo(210), ''))  throw new Error('7-month-old ack accepted under a 6-month window');
      CFG = { SafetyInductionMonths: 'abc' };
      if (valid(daysAgo(400), ''))  throw new Error('garbage window did not fall back to 12 months');
    });

    await R.check('a site can switch expiry off deliberately', async () => {
      CFG = { SafetyInductionMonths: '0' };
      if (!valid(daysAgo(4000), '')) throw new Error('0 months should mean never expires');
    });

    await R.check('rewording the rules invalidates every old signature', async () => {
      // The point of the version stamp: if the wording changed, what they
      // agreed to is not what the site now requires, however recent it was.
      CFG = { SafetyRulesVersion: 'v2' };
      if (!valid(daysAgo(0), 'v2')) throw new Error('current-version ack rejected');
      if (valid(daysAgo(0), 'v1'))  throw new Error('ack against the OLD wording still accepted');
      if (valid(daysAgo(0), ''))    throw new Error('ack with no version recorded still accepted');
    });

    summary.push(R.report());
  }

  // ── 13c · both languages ────────────────────────────────────────────────
  {
    const R = makeRunner('13c · Safety — bilingual');

    await R.check('every rule and heading has English AND Hindi', async () => {
      // A rule that exists only in English silently falls back, so a Hindi
      // reader is shown text they may not understand and still has to sign.
      const ctx = {};
      // eslint-disable-next-line no-eval
      eval(I18N.replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '')
               .replace(/\(function\(\)\{[\s\S]*$/, ''));
      const keys = QRATT_SAFETY_SECTIONS
        .reduce((a, s) => a.concat(s.key, s.rules), []);
      const bad = keys.filter(k => {
        const e = QRATT_I18N[k];
        return !e || !e.en || !e.hi || e.en === e.hi;
      });
      if (bad.length) throw new Error('missing/duplicate translation: ' + bad.join(', '));
      if (keys.length < 20) throw new Error('only ' + keys.length + ' keys checked');
    });

    summary.push(R.report());
  }

  await browser.close();
  return summary;
}

if (require.main === module) {
  run().then(r => {
    const t = r.reduce((a, x) => a + x.total, 0), p = r.reduce((a, x) => a + x.pass, 0);
    console.log(`\nSuite 13: ${p}/${t}`);
    process.exit(p === t ? 0 : 1);
  });
}
module.exports = { run };
