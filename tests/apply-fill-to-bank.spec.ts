import { test, expect, Page } from '@playwright/test';
import { config } from '../helpers/config';
import { makeApplicant } from '../helpers/test-data';
import { postBankStatement } from '../helpers/statement';
import { Hud } from '../helpers/hud';
import { STAGES, stageIndexForUrl } from '../helpers/stages';
import { WizardHelpers } from '../pages/wizard.helpers';
import { WizardFlow } from '../pages/flow';

/**
 * Beta / localhost desk-case robot.
 *
 * Drives the whole mini-loan wizard with a fresh random identity each run
 * (new name every time → never hits the anti-duplicate policy), shows an
 * on-screen red/white progress tracker (desktop only), injects the bank
 * statement at the bank step (Postman replacement), then continues to a
 * successful submit — which is what triggers the AI-assessment HTML email.
 */
test.describe('Online Apps — desk-case robot', () => {
  test('random fill → bank code → inject statement → submit → AI mail', async ({ page, request }) => {
    test.setTimeout(25 * 60_000);

    const applicant = makeApplicant();
    const bar = hud(page);
    const flow = new WizardFlow(page, bar, applicant);
    const wizard = new WizardHelpers(page);

    console.log(`Target: ${config.target}  |  ${config.appBaseUrl}`);
    console.log(`Applicant: ${applicant.firstName} ${applicant.lastName} <${applicant.email}>`);

    await bar.install();

    await page.goto(config.startPath);
    await expect(page.locator('body')).toBeVisible();
    await bar.banner(`${applicant.firstName} ${applicant.lastName}`);

    // Begin listening for the bank verification code BEFORE we reach the bank step.
    const codePromise = wizard.waitForVerificationCode().catch(() => '');

    // --- Drive to the bank step -------------------------------------------------
    let reachedBank = false;
    for (let i = 0; i < 45; i++) {
      const idx = stageIndexForUrl(page.url());
      await bar.setStage(idx);
      await bar.gate(idx); // Click a stage in the tracker to freeze here.

      console.log(`[stage] ${flow.label()}`);
      const before = page.url();
      const result = await flow.step();

      if (result === 'bank') {
        reachedBank = true;
        break;
      }
      if (result === 'done' || result === 'rejected') {
        await bar.finish(result === 'done');
        return;
      }
      await waitNav(page, before);
    }

    if (!reachedBank) {
      await bar.banner('Did not reach the bank step — see console');
      console.log('Current URL:', page.url());
      test.skip(true, 'Wizard did not reach the bank step; a selector likely needs updating for this build.');
      return;
    }

    // --- Capture the verification code -----------------------------------------
    const verificationCode = await codePromise;
    if (!verificationCode) {
      console.log('No verification code captured (bank step differs on this target).');
    } else {
      console.log(`Verification code: ${verificationCode}`);
      console.log(`Body reference will be: ${config.bankReferencePrefix}-${verificationCode}`);
    }

    if (config.stopAtBank) {
      await bar.banner('Reached bank + captured code (demo stop).');
      console.log('STOP_AT_BANK=1 — stopping cleanly at the bank step.');
      await page.waitForTimeout(4000);
      return;
    }

    if (config.pauseAtBank) {
      await bar.banner('Paused at bank — Postman your statement, then resume.');
      await page.pause();
    } else if (verificationCode) {
      // --- Inject the statement (replaces Postman) ------------------------------
      // Log every bank poll so the terminal shows exactly what the server returns.
      page.on('response', async (r) => {
        if (r.url().includes('/bank/check-new-statement')) {
          const txt = await r.text().catch(() => '');
          console.log(`[poll] check-new-statement ${r.status()} → ${txt.slice(0, 200)}`);
        }
      });

      await postBankStatement(request, verificationCode);
      console.log('Statement posted. Advancing to the polling screen…');

      // API injection doesn't fire the iframe "complete" postMessage, so the app
      // stays on /budget/start. The beta dev button (devSubmit) moves us onto
      // /budget/loading-statement, where check-new-statement polls and picks up
      // the statement we just posted.
      if (await wizard.clickButton(/send via postman/i)) {
        console.log('Clicked "Send via Postman" (devSubmit) → loading-statement.');
      } else {
        console.log('WARNING: "Send via Postman" button not found — cannot advance to the poll screen.');
      }
      await bar.banner('Waiting for the statement to process…');

      // The app itself navigates to confirm-accounts once the statement lands —
      // the most reliable signal (more than guessing the poll response shape).
      await page
        .waitForURL(/\/budget\/(confirm-accounts|income-accounts)/i, { timeout: 6 * 60_000 })
        .catch(() => undefined);

      if (/\/budget\/(confirm-accounts|income-accounts)/i.test(page.url())) {
        await bar.banner('Statement received — continuing.');
      } else {
        await bar.banner('Statement not picked up — see [poll] logs.');
        console.log('Still on:', page.url());
      }
    }

    // --- Continue through budget → submit (triggers AI mail on success) --------
    if (config.continueToSubmit) {
      for (let i = 0; i < 70; i++) {
        if (/\/loan\/(success|reject)/i.test(page.url())) break;
        const idx = stageIndexForUrl(page.url());
        await bar.setStage(idx);
        await bar.gate(idx);

        console.log(`[stage] ${flow.label()}`);
        const before = page.url();
        const result = await flow.step();
        if (result === 'done' || result === 'rejected') break;
        await waitNav(page, before);
      }

      if (/\/loan\/success/i.test(page.url())) {
        await bar.finish(true);
        await bar.banner('SUCCESS — AI assessment email should now send.');
        console.log(
          'SUCCESS → AI assessment triggers after the (Albert) submit. ' +
            'Check inbox (Tarun.Gudapati@safefinancial.com.au) for "AI Questions".',
        );
        await expect(page).toHaveURL(/\/loan\/success/i, { timeout: 5_000 });
      } else if (/\/loan\/reject/i.test(page.url())) {
        await bar.finish(false);
        await bar.banner('Application declined.');
      } else {
        await bar.banner('Did not reach success — see console.');
        console.log('Final URL:', page.url());
      }
    }
  });
});

/**
 * Wait until the URL changes away from `before` (navigation happened), or fall
 * through after a short grace period for screens that stay on the same URL
 * (polling screens, multi-part sub-forms). Prevents re-entering a step while it
 * is still transitioning.
 */
async function waitNav(page: Page, before: string): Promise<void> {
  await page
    .waitForURL((u) => u.toString() !== before, { timeout: 9_000 })
    .catch(() => undefined);
  await page.waitForTimeout(500);
}

/** One HUD per page (cached on the page object). */
function hud(page: Page): Hud {
  const anyPage = page as any;
  if (!anyPage.__hud) {
    anyPage.__hud = new Hud(page, {
      enabled: (process.env.SHOW_HUD ?? '1') !== '0',
      hosts: ['beta2.safefinancial', 'localhost', '127.0.0.1'],
      minWidth: 900,
      stages: [...STAGES],
    });
  }
  return anyPage.__hud;
}
