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
      await page.evaluate(() => {
        const r = document.querySelectorAll('#rulesList .rule');
        for (let i = 0; i < r.length - 1; i++) r[i].click();
      });
      await settle(page, 200);
      const s = await page.evaluate(() => ({
        count: document.getElementById('rulesCount').textContent.trim(),
        ack:   document.getElementById('vSafetyAck').disabled
      }));
      if (!/^4 \/ 5$/.test(s.count)) throw new Error('counter reads ' + s.count);
      if (!s.ack) throw new Error('acknowledgement unlocked with a section unread');
    });

    await R.check('reading every section unlocks the acknowledgement', async () => {
      await page.evaluate(() => document.querySelectorAll('#rulesList .rule').forEach(r => r.click()));
      await settle(page, 200);
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
