import { Page, Locator, expect } from '@playwright/test';
import { Hud } from '../helpers/hud';
import { ApplicantData } from '../helpers/test-data';
import { PersonalPage } from './personal.page';
import { WizardHelpers } from './wizard.helpers';

export type StepResult = 'continue' | 'bank' | 'submitted' | 'done' | 'rejected' | 'unknown';

/**
 * URL-keyed wizard driver. Each screen is matched by its route and driven with
 * the mapped selectors; unknown screens fall back to "pick first tile + primary
 * button" so the robot keeps moving even when a step changes.
 */
export class WizardFlow {
  private personal: PersonalPage;
  private w: WizardHelpers;

  constructor(
    private page: Page,
    private hud: Hud,
    private applicant: ApplicantData,
  ) {
    this.personal = new PersonalPage(page);
    this.w = new WizardHelpers(page);
  }

  /** A short, human label for the current screen. */
  label(): string {
    const u = this.page.url();
    const map: [RegExp, string][] = [
      [/mini-loan/i, 'Landing / calculator'],
      [/\/loan\/eligible/i, 'Eligibility'],
      [/\/loan\/warning/i, 'Borrowing warning'],
      [/\/loan\/source/i, 'How did you find us'],
      [/\/loan\/purpose/i, 'Loan purpose'],
      [/\/loan\/personal/i, 'Personal details'],
      [/\/loan\/family/i, 'Marital status'],
      [/\/loan\/identity/i, 'Identity (licence)'],
      [/\/budget\/start/i, 'Bank statement check'],
      [/\/budget\/loading-statement/i, 'Processing statement'],
      [/\/budget\/confirm-accounts/i, 'Confirm bank accounts'],
      [/\/budget\/income-accounts/i, 'Review income'],
      [/\/budget\/benefit-review/i, 'Benefit review'],
      [/\/loan\/benefit-review/i, 'Benefit review'],
      [/\/budget\/no-income/i, 'No statement income'],
      [/\/budget\/employment-income/i, 'Employment income'],
      [/\/budget\/additional-income/i, 'Additional income'],
      [/\/budget\/expense-list/i, 'Review expenses'],
      [/\/budget\/expense-bnpl/i, 'BNPL balances'],
      [/\/budget\/expense-credit-cards/i, 'Credit card balances'],
      [/\/budget\/additional-expenses/i, 'Additional expenses'],
      [/\/budget\/failed-statement/i, 'Statement failed'],
      [/\/loan\/address(?:$|[#/?])/i, 'Residential address'],
      [/\/loan\/previous-address/i, 'Previous address'],
      [/\/loan\/postal-address/i, 'Postal address'],
      [/\/loan\/living-details/i, 'Occupancy'],
      [/\/loan\/discretionary-spending/i, 'Discretionary spending'],
      [/\/loan\/loan-security/i, 'Loan security'],
      [/\/loan\/references/i, 'Reference contact'],
      [/\/loan\/submit/i, 'Submit application'],
      [/\/loan\/loading-outcome/i, 'Awaiting outcome'],
      [/\/loan\/success/i, 'Success'],
      [/\/loan\/reject/i, 'Declined'],
    ];
    for (const [re, name] of map) if (re.test(u)) return name;
    return `Unknown (${u.split('/').slice(3).join('/')})`;
  }

  /** Drive whatever screen is currently shown. */
  async step(): Promise<StepResult> {
    const u = this.page.url();
    await this.page.waitForTimeout(400); // let Angular settle

    if (/\/budget\/start/i.test(u)) return 'bank';
    if (/\/loan\/success/i.test(u)) return 'done';
    if (/\/loan\/reject/i.test(u) || /\/budget\/failed-statement/i.test(u)) return 'rejected';

    if (/mini-loan/i.test(u)) return this.landing();
    if (/\/loan\/eligible/i.test(u)) return this.tapAdvance(/^Get started$/i);
    if (/\/loan\/warning/i.test(u)) return this.tapAdvance(/^Continue$/i);
    if (/\/loan\/source/i.test(u)) return this.tileThenNext();
    if (/\/loan\/purpose/i.test(u)) return this.purpose();
    if (/\/loan\/personal/i.test(u)) return this.personalStep();
    if (/\/loan\/family/i.test(u)) return this.family();
    if (/\/loan\/identity/i.test(u)) return this.identity();
    if (/\/budget\/loading-statement/i.test(u)) return this.waitScreen();
    if (/\/budget\/confirm-accounts/i.test(u)) return this.tapAdvance(/^Next$/i);
    if (/\/budget\/income-accounts/i.test(u)) return this.reviewList(/^Confirm$/i, 'app-income-details');
    if (/\/budget\/benefit-review/i.test(u) || /\/loan\/benefit-review/i.test(u)) return this.benefitReview();
    if (/\/budget\/no-income/i.test(u)) return this.noIncome();
    if (/\/budget\/employment-income/i.test(u)) return this.employmentIncome();
    if (/\/budget\/additional-income/i.test(u)) return this.reviewOpenForms(/^Next$/i, 'app-income-details');
    if (/\/budget\/expense-list/i.test(u)) return this.reviewList(/^Next$/i, 'app-expense-details');
    if (/\/budget\/expense-(bnpl|credit-cards)/i.test(u)) return this.creditorBalances();
    if (/\/budget\/additional-expenses/i.test(u)) return this.generalExpenses();
    if (/\/loan\/address(?:$|[#/?])/i.test(u)) return this.residentialAddress();
    if (/\/loan\/(previous-address|postal-address)/i.test(u)) return this.extraAddress();
    if (/\/loan\/living-details/i.test(u)) return this.occupancy();
    if (/\/loan\/discretionary-spending/i.test(u)) return this.discretionary();
    if (/\/loan\/loan-security/i.test(u)) return this.loanSecurity();
    if (/\/loan\/references/i.test(u)) return this.references();
    if (/\/loan\/submit/i.test(u)) return this.submit();
    if (/\/loan\/loading-outcome/i.test(u)) return this.waitScreen();

    await this.w.clickFirstTile();
    await this.w.clickPrimary();
    return 'unknown';
  }

  // ---- individual step handlers -------------------------------------------

  private async landing(): Promise<StepResult> {
    await this.w.clickFirstTile().catch(() => undefined);
    const apply = this.page.getByRole('button', { name: /apply now|apply|get started/i }).first();
    const link = this.page.locator('a[role="button"]', { hasText: /apply now/i }).first();
    if (await apply.isVisible().catch(() => false)) {
      await apply.click().catch(() => undefined);
    } else if (await link.isVisible().catch(() => false)) {
      await link.click().catch(() => undefined);
    }
    return 'continue';
  }

  private async tapAdvance(name: RegExp): Promise<StepResult> {
    if (!(await this.w.clickButton(name))) await this.w.clickPrimary();
    return 'continue';
  }

  private async tileThenNext(): Promise<StepResult> {
    await this.w.clickFirstTile();
    await this.page.waitForTimeout(300);
    await this.w.clickPrimary();
    return 'continue';
  }

  private async purpose(): Promise<StepResult> {
    // Group tiles carry an <img>; sub-category tiles are ".jump.std-block.h-20".
    const group = this.page.locator('.jump.std-block:has(img)').first();
    if (await group.isVisible().catch(() => false)) {
      await group.click().catch(() => undefined);
    }
    const sub = this.page.locator('.jump.std-block.h-20').first();
    await sub.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
    await sub.click().catch(() => undefined);
    await this.page.waitForTimeout(300);
    await this.w.clickButton(/^Next$/i);
    return 'continue';
  }

  private async personalStep(): Promise<StepResult> {
    // Guard against re-entry racing with navigation (which makes #first vanish).
    if (!(await this.page.locator('#first').isVisible().catch(() => false))) {
      return 'continue';
    }
    await this.personal.fill(this.applicant);
    await this.page.waitForTimeout(300);
    await this.personal.next();
    // Wait to actually leave the personal screen before the loop continues.
    await this.page.waitForURL(/\/loan\/(family|identity|purpose)/i, { timeout: 20_000 }).catch(() => undefined);
    return 'continue';
  }

  private async family(): Promise<StepResult> {
    await this.w.clickChoice(/single/i);
    await this.page.waitForTimeout(300);
    const zero = this.page.locator('.jump.std-block', { hasText: /^\s*0\s*$/ }).first();
    if (await zero.isVisible().catch(() => false)) await zero.click().catch(() => undefined);
    await this.page.waitForTimeout(200);
    await this.w.clickPrimary();
    return 'continue';
  }

  private async identity(): Promise<StepResult> {
    const stateTile = this.page
      .locator('.std-block', { hasText: new RegExp(this.applicant.licenceState, 'i') })
      .first();
    if (await stateTile.isVisible().catch(() => false)) {
      await stateTile.click().catch(() => undefined);
    }
    const dl = this.page.locator('#dl');
    if (await dl.isVisible().catch(() => false)) {
      await dl.fill(this.applicant.licenceNo).catch(() => undefined);
    }
    await this.page.waitForTimeout(200);
    await this.w.clickPrimary();
    return 'continue';
  }

  private async waitScreen(): Promise<StepResult> {
    await this.page.waitForTimeout(3000);
    return 'continue';
  }

  /**
   * "Review" lists (income-accounts / expense-list): each raw item shows a
   * "provide more details" link that opens a detail sub-form. Open each, fill
   * it, confirm it, then advance with the page-level button when all are done.
   */
  private async reviewList(advance: RegExp, detailSel: string): Promise<StepResult> {
    for (let i = 0; i < 30; i++) {
      const more = this.page.locator('text=/provide more details/i').first();
      if (!(await more.isVisible().catch(() => false))) break;
      await more.click().catch(() => undefined);
      await this.page.waitForTimeout(600);
      const detail = this.page.locator(detailSel).first();
      await this.confirmOpenDetail(detail);
      await this.page.waitForTimeout(900);
    }
    if (!(await this.w.clickButton(advance))) await this.w.clickPrimary();
    return 'continue';
  }

  /**
   * Pages where detail sub-forms are already open (general expenses / additional
   * income): fill and confirm each open form until the page-level button appears.
   */
  private async reviewOpenForms(advance: RegExp, detailSel: string): Promise<StepResult> {
    for (let i = 0; i < 30; i++) {
      const detail = this.page.locator(detailSel).first();
      const confirm = detail.getByRole('button', { name: /^Confirm$/i });
      if (!(await confirm.isVisible().catch(() => false))) break;
      await this.confirmOpenDetail(detail);
      await this.page.waitForTimeout(900);
    }
    if (!(await this.w.clickButton(advance))) await this.w.clickPrimary();
    return 'continue';
  }

  /** Click the first ".std-block" tile in the group following a heading. */
  private async clickTileUnder(root: Locator, headingRe: RegExp): Promise<boolean> {
    const heading = root.locator('p', { hasText: headingRe }).last();
    if (!(await heading.isVisible().catch(() => false))) return false;
    const tile = heading.locator('xpath=following-sibling::div[1]').locator('.std-block').first();
    if (await tile.isVisible().catch(() => false)) {
      await tile.click().catch(() => undefined);
      return true;
    }
    return false;
  }

  /** ngx-mask numeric field — type digits so the mask commits. */
  private async typeMoney(root: Locator, sel: string, value: string): Promise<void> {
    const el = root.locator(sel).first();
    if (!(await el.isVisible().catch(() => false))) return;
    await el.click().catch(() => undefined);
    await el.pressSequentially(value, { delay: 30 }).catch(() => undefined);
    await el.blur().catch(() => undefined);
  }

  /**
   * Fill and confirm a single open income/expense detail sub-form (scoped to
   * that form so multiple open forms don't cross-fill).
   */
  private async confirmOpenDetail(root: Locator): Promise<boolean> {
    await this.clickTileUnder(root, /type of expense/i);
    await this.clickTileUnder(root, /type of income/i);
    await this.page.waitForTimeout(400);
    await this.clickTileUnder(root, /Type of wage/i);

    for (const sel of ['#busname', '#empname']) {
      const name = root.locator(sel).first();
      if (await name.isVisible().catch(() => false)) {
        await name.fill('Employer Pty Ltd').catch(() => undefined);
      }
    }
    await this.typeMoney(root, '#abn', '51824753556');
    await this.typeMoney(root, '#ammend', '200');

    await this.clickTileUnder(root, /Frequency/i);

    await this.typeMoney(root, '#cardlimit', '5000');
    await this.clickTileUnder(root, /purpose of this loan/i);
    await this.typeMoney(root, '#balance', '5000');

    for (const sel of ['#month', '#year', '#lastPayDay', '#lastPayMonth']) {
      const dd = root.locator(sel).first();
      if (await dd.isVisible().catch(() => false)) {
        await dd.selectOption({ index: 1 }).catch(() => undefined);
      }
    }
    await this.clickTileUnder(root, /deposited into|paid into/i);

    await this.page.waitForTimeout(200);
    const confirm = root.getByRole('button', { name: /^Confirm$/i }).first();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click().catch(() => undefined);
      return true;
    }
    return false;
  }

  /**
   * Address entry via the Google Places dropdown: type a partial address, wait
   * for the ".pac-item" prediction list, then pick the first with the keyboard
   * (ArrowDown + Enter) — exactly what a person does. Falls back to the app's
   * manual street/state/postcode/suburb fields only if no predictions appear.
   */
  private async fillAddress(): Promise<void> {
    // New build: custom lookup input #oa-street-search with an .oa-places-list
    // dropdown (selectPrediction fires on mousedown). Old/iOS build: #address
    // (Google Places, .pac-container). Support both.
    const addr = this.page.locator('#oa-street-search, #address').first();
    const alreadyFilled = (await addr.inputValue().catch(() => '')) !== '';
    if ((await addr.isVisible().catch(() => false)) && !alreadyFilled) {
      await addr.click().catch(() => undefined);
      await addr.fill('').catch(() => undefined);
      // Type slowly so the autocomplete has time to surface predictions.
      await addr.pressSequentially('1 Martin Place, Sydney', { delay: 150 }).catch(() => undefined);

      const oaItem = this.page.locator('.oa-places-list .oa-places-item').first();
      const pacItem = this.page.locator('.pac-container .pac-item').first();
      const gotOa = await oaItem
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (gotOa) {
        // Click fires mousedown -> selectPrediction before the input's blur.
        await oaItem.click().catch(() => undefined);
        await this.page.waitForTimeout(1200);
        console.log('[address] selected an oa-places prediction.');
      } else {
        const gotPac = await pacItem
          .waitFor({ state: 'visible', timeout: 8000 })
          .then(() => true)
          .catch(() => false);
        if (gotPac) {
          await this.page.waitForTimeout(400);
          // Keyboard select is the most reliable with ngx-google-places.
          await this.page.keyboard.press('ArrowDown').catch(() => undefined);
          await this.page.keyboard.press('Enter').catch(() => undefined);
          await this.page.waitForTimeout(1500);
          console.log('[address] selected a Google prediction.');
        } else {
          console.log('[address] no predictions appeared — using manual fields.');
        }
      }
    }

    // Manual fallback (needManualEntry -> #street visible).
    const street = this.page.locator('#street').first();
    if (await street.isVisible().catch(() => false)) {
      await street.fill('1 Martin Place').catch(() => undefined);
      const state = this.page.locator('#state').first();
      await state.selectOption('NSW').catch(async () => {
        await state.selectOption({ label: 'NSW' }).catch(() => undefined);
      });
      const postcode = this.page.locator('#postcode').first();
      await postcode.click().catch(() => undefined);
      await postcode.pressSequentially('2000', { delay: 60 }).catch(() => undefined);
      await postcode.blur().catch(() => undefined);

      const suburb = this.page.locator('#suburb').first();
      for (let i = 0; i < 20; i++) {
        const opts = await suburb.locator('option').count().catch(() => 0);
        if (opts > 0) break;
        await this.page.waitForTimeout(400);
      }
      const sydney = suburb.locator('option', { hasText: /sydney/i }).first();
      if (await sydney.count().catch(() => 0)) {
        const val = await sydney.getAttribute('value').catch(() => null);
        if (val) await suburb.selectOption(val).catch(() => undefined);
      } else {
        await suburb.selectOption({ index: 0 }).catch(() => undefined);
      }
      await suburb.dispatchEvent('change').catch(() => undefined);
      await this.page.waitForTimeout(600);
    }
  }

  /**
   * Residential address (/loan/address, ReduceSpending's predecessor). The app
   * split address entry out of occupancy into its own page: fill the address
   * lookup, then the Confirm button turns valid and advances to living-details.
   */
  private async residentialAddress(): Promise<StepResult> {
    await this.fillAddress();

    // Confirm goes red (enabled) once isAddressEntryComplete() is true.
    const confirmReady = async (): Promise<boolean> => {
      const cls =
        (await this.page
          .getByRole('button', { name: /^(Confirm|Next)$/i })
          .last()
          .getAttribute('class')
          .catch(() => '')) || '';
      return cls.includes('bg-red-500');
    };
    for (let i = 0; i < 12 && !(await confirmReady()); i++) {
      await this.page.waitForTimeout(400);
    }

    await this.page.getByRole('button', { name: /^(Confirm|Next)$/i }).last().click().catch(() => undefined);
    await this.page
      .waitForURL((u) => !/\/loan\/address(?:$|[#/?])/i.test(u.href), { timeout: 8000 })
      .catch(() => undefined);
    return 'continue';
  }

  /** Previous / postal address pages still use address-edit's own Next button. */
  private async extraAddress(): Promise<StepResult> {
    await this.fillAddress();
    if (!(await this.w.clickButton(/^(Confirm|Next)$/i))) await this.w.clickPrimary();
    await this.page.waitForTimeout(800);
    return 'continue';
  }

  /**
   * Benefit review (/budget/benefit-review). Each card must be confirmed before
   * "Save And Continue" enables. Prefer a status that needs no amount/date
   * follow-up ("Has Finished" / "Not in my name" / "Finished / not mine").
   */
  private async benefitReview(): Promise<StepResult> {
    for (let i = 0; i < 15; i++) {
      const pending = this.page
        .locator('.white-block')
        .filter({ has: this.page.getByRole('button', { name: /^Confirm$/i }) })
        .first();
      if (!(await pending.isVisible().catch(() => false))) break;

      const easy = pending
        .locator('.std-block, button.std-block')
        .filter({ hasText: /has finished|finished \/ not mine|one-off|not in my name/i })
        .first();
      if (await easy.isVisible().catch(() => false)) {
        await easy.click().catch(() => undefined);
      } else {
        await pending.locator('.std-block, button.std-block').first().click().catch(() => undefined);
        await this.page.waitForTimeout(300);
        const amt = pending.locator('input[type="tel"]').first();
        if ((await amt.isVisible().catch(() => false)) && !(await amt.inputValue().catch(() => ''))) {
          await amt.click().catch(() => undefined);
          await amt.pressSequentially('400', { delay: 25 }).catch(() => undefined);
          await amt.blur().catch(() => undefined);
        }
        const selects = pending.locator('select');
        const sn = await selects.count().catch(() => 0);
        for (let s = 0; s < sn; s++) {
          await selects.nth(s).selectOption({ index: 1 }).catch(() => undefined);
        }
      }

      await pending.getByRole('button', { name: /^Confirm$/i }).click().catch(() => undefined);
      await this.page.waitForTimeout(900);
    }

    if (!(await this.w.clickButton(/^Save And Continue$/i))) await this.w.clickPrimary();
    return 'continue';
  }

  /**
   * No wages found on the statement. "Add Work Income" opens the employment
   * form so the application can still proceed.
   */
  private async noIncome(): Promise<StepResult> {
    const add = this.page.getByText(/add work income/i).first();
    if (await add.isVisible().catch(() => false)) {
      await add.click().catch(() => undefined);
      await this.page
        .waitForURL(/\/budget\/employment-income/i, { timeout: 8_000 })
        .catch(() => undefined);
      return 'continue';
    }
    if (!(await this.w.clickButton(/^Next$/i))) await this.w.clickPrimary();
    return 'continue';
  }

  /** Manual wage / self-employed entry after the no-income page. */
  private async employmentIncome(): Promise<StepResult> {
    await this.page
      .locator('app-income-employment-details')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => undefined);

    for (let i = 0; i < 10; i++) {
      const detail = this.page.locator('app-income-employment-details').first();
      const confirm = detail.getByRole('button', { name: /^Confirm$/i });
      if (!(await confirm.isVisible().catch(() => false))) break;
      await this.confirmOpenDetail(detail);
      await this.page.waitForTimeout(1200);
    }

    const next = this.page.getByRole('button', { name: /^Next$/i }).first();
    for (let i = 0; i < 20; i++) {
      if (await next.isEnabled().catch(() => false)) break;
      await this.page.waitForTimeout(400);
    }
    if (!(await this.w.clickButton(/^Next$/i))) await this.w.clickPrimary();
    return 'continue';
  }

  /**
   * BNPL / credit-card balance capture. Each creditor needs ownership + amounts
   * confirmed before "Save And Continue" enables.
   */
  private async creditorBalances(): Promise<StepResult> {
    for (let i = 0; i < 12; i++) {
      const pending = this.page
        .locator('.white-block')
        .filter({ has: this.page.getByRole('button', { name: /^Confirm$/i }) })
        .first();
      if (!(await pending.isVisible().catch(() => false))) break;

      await pending.locator('.std-block', { hasText: /this is my account/i }).first().click().catch(() => undefined);
      await this.page.waitForTimeout(300);

      const inputs = pending.locator('input[type="tel"]');
      const n = await inputs.count().catch(() => 0);
      for (let j = 0; j < n; j++) {
        const el = inputs.nth(j);
        if (!(await el.isVisible().catch(() => false))) continue;
        if (await el.inputValue().catch(() => 'x')) continue;
        await el.click().catch(() => undefined);
        const id = (await el.getAttribute('id').catch(() => '')) || '';
        await el.pressSequentially(id.includes('cardLimit') ? '5000' : '500', { delay: 25 }).catch(() => undefined);
        await el.blur().catch(() => undefined);
      }

      await pending.getByRole('button', { name: /^Confirm$/i }).click().catch(() => undefined);
      await this.page.waitForTimeout(700);
    }

    if (!(await this.w.clickButton(/^Save And Continue$/i))) await this.w.clickPrimary();
    return 'continue';
  }

  /**
   * Additional / general expenses is now a table of amount + frequency rows
   * with a "Continue" button (no more per-item expense-details forms).
   */
  private async generalExpenses(): Promise<StepResult> {
    const amounts = this.page.locator('input[id^="amount-"]');
    const n = await amounts.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = amounts.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      if (await el.inputValue().catch(() => '')) continue;
      await el.click().catch(() => undefined);
      await el.pressSequentially('50', { delay: 25 }).catch(() => undefined);
      await el.blur().catch(() => undefined);
    }

    const freqs = this.page.locator('select[id^="frequency-"]');
    const fn = await freqs.count().catch(() => 0);
    for (let i = 0; i < fn; i++) {
      await freqs.nth(i).selectOption({ index: 1 }).catch(() => undefined);
    }

    if (!(await this.w.clickButton(/^Continue$/i))) await this.w.clickPrimary();
    await this.page
      .waitForURL((u) => !/\/budget\/additional-expenses/i.test(u.href), { timeout: 15_000 })
      .catch(() => undefined);
    return 'continue';
  }

  private async loanSecurity(): Promise<StepResult> {
    await this.w.clickChoice(/^No$/i);
    await this.page.waitForTimeout(200);
    await this.w.clickPrimary();
    return 'continue';
  }

  private async occupancy(): Promise<StepResult> {
    // If you filled the address by hand (hand-over), don't overwrite it.
    const addrVal = await this.page.locator('#oa-street-search, #address').first().inputValue().catch(() => '');
    if (!addrVal) {
      await this.fillAddress();
    }

    const fromMonth = this.page.locator('#from-month').first();
    if (await fromMonth.isVisible().catch(() => false)) {
      await fromMonth.selectOption({ index: 1 }).catch(() => undefined);
    }
    // Skip the empty option + current year so the "lived here since" date is
    // clearly in the past (avoids the future-date error).
    const fromYear = this.page.locator('#from-year').first();
    if (await fromYear.isVisible().catch(() => false)) {
      await fromYear.selectOption({ index: 4 }).catch(async () => {
        await fromYear.selectOption({ index: 1 }).catch(() => undefined);
      });
    }

    // Occupancy group: select only if none is chosen yet (avoid re-toggling).
    const groupWrap = this.page.locator('#occupancy-groups').locator('xpath=..');
    if ((await groupWrap.locator('.selected-block').count().catch(() => 0)) === 0) {
      if (!(await this.w.clickChoice(/renting|rent/i))) {
        await groupWrap.locator('.jump.std-block').first().click().catch(() => undefined);
      }
      await this.page.waitForTimeout(700);
    }

    // Subtype: select only if none is chosen yet.
    const subs = this.page.locator('.jump.std-block.h-20');
    if ((await subs.count().catch(() => 0)) > 0 &&
        (await this.page.locator('.jump.std-block.h-20.selected-block').count().catch(() => 0)) === 0) {
      await subs.first().click().catch(() => undefined);
      await this.page.waitForTimeout(700);
    }

    // Dynamic flow steps: answer EVERY unanswered tile-group, fill amounts/dates,
    // until the Confirm button actually turns valid (red, not gray).
    const flow = () => this.page.locator('#accommodation').locator('xpath=..');
    const confirmValid = async (): Promise<boolean> => {
      const cls =
        (await this.page.getByRole('button', { name: /^(Confirm|Next|Save)$/i }).last().getAttribute('class').catch(() => '')) ||
        '';
      return cls.includes('bg-red-500') && !cls.includes('bg-lightgray-600');
    };

    for (let pass = 0; pass < 10; pass++) {
      // Amount / text inputs.
      const inputs = flow().locator('input[id^="step-"]');
      const n = await inputs.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const el = inputs.nth(i);
        if ((await el.isVisible().catch(() => false)) && !(await el.inputValue().catch(() => 'x'))) {
          await el.click().catch(() => undefined);
          await el.pressSequentially('200', { delay: 25 }).catch(() => undefined);
          await el.blur().catch(() => undefined);
        }
      }
      // Date selects.
      const selects = flow().locator('select[id^="step-"]');
      const sn = await selects.count().catch(() => 0);
      for (let i = 0; i < sn; i++) await selects.nth(i).selectOption({ index: 1 }).catch(() => undefined);

      // Each tile-group (flex-wrap container): if it has no selected tile, pick the first.
      const groups = flow().locator('div.flex.flex-wrap');
      const gc = await groups.count().catch(() => 0);
      for (let i = 0; i < gc; i++) {
        const g = groups.nth(i);
        if ((await g.locator('.std-block').count().catch(() => 0)) === 0) continue;
        if ((await g.locator('.std-block.selected-block').count().catch(() => 0)) === 0) {
          await g.locator('.std-block').first().click().catch(() => undefined);
          await this.page.waitForTimeout(250);
        }
      }

      if (await confirmValid()) break;
      await this.page.waitForTimeout(400);
    }

    const nextBtn = this.page.getByRole('button', { name: /^(Confirm|Next|Save)$/i }).last();
    await nextBtn.click().catch(() => undefined);
    await this.page.waitForTimeout(400);
    return 'continue';
  }

  private async discretionary(): Promise<StepResult> {
    // Discretionary spending is a set of tick boxes. "Next" only advances once at
    // least one is selected. Beta's markup can differ from the local source, so we
    // try several ways to tick a box and verify it actually registered.
    const checkboxes = this.page.locator('input[type="checkbox"]');
    await checkboxes.first().waitFor({ state: 'attached', timeout: 10_000 }).catch(() => undefined);

    const checkedCount = () =>
      this.page.locator('input[type="checkbox"]:checked').count().catch(() => 0);

    // Prefer a concrete, non-"I'm not willing" option label.
    const optionLabel = this.page
      .locator('label', { hasText: /dining out|gambling|bnpl|subscriptions|online retail|dining|entertainment/i })
      .first();

    const tryTick = async (): Promise<void> => {
      if (await optionLabel.isVisible().catch(() => false)) {
        await optionLabel.click().catch(() => undefined);
        if ((await checkedCount()) > 0) return;
      }
      // Click the checkbox itself (some builds don't wire the label click).
      const cb = checkboxes.first();
      if (await cb.isVisible().catch(() => false)) {
        await cb.click({ force: true }).catch(() => undefined);
        if ((await checkedCount()) > 0) return;
      }
      // Click the checkbox's parent (label/row) as a last resort.
      await cb.locator('xpath=..').click({ force: true }).catch(() => undefined);
    };

    for (let i = 0; i < 5 && (await checkedCount()) === 0; i++) {
      await tryTick();
      await this.page.waitForTimeout(350);
    }

    if ((await checkedCount()) === 0) {
      // One-time diagnostic dump so we can see beta's actual markup.
      const cbCount = await checkboxes.count().catch(() => 0);
      const lbls = (await this.page.locator('label').allInnerTexts().catch(() => []))
        .map((t) => t.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 12);
      console.log(`[discretionary] NOT ticked. checkboxes=${cbCount} labels=${JSON.stringify(lbls)}`);
      const html = await this.page.locator('.sm-container, form').first().innerHTML().catch(() => '');
      console.log(`[discretionary] container HTML: ${html.replace(/\s+/g, ' ').slice(0, 1800)}`);
    } else {
      console.log('[discretionary] a tick box is selected; advancing.');
    }

    await this.page.getByRole('button', { name: /^(Next|Confirm)$/i }).first().click().catch(() => undefined);
    await this.page
      .waitForURL((u) => !/\/loan\/discretionary-spending/i.test(u.href), { timeout: 8_000 })
      .catch(() => undefined);
    return 'continue';
  }

  private async references(): Promise<StepResult> {
    const r = this.applicant.reference;
    const scope = this.page.locator('.white-block').first();
    const root = (await scope.count()) ? scope : this.page.locator('body');
    await root.locator('#first').first().fill(r.firstName).catch(() => undefined);
    await root.locator('#last').first().fill(r.lastName).catch(() => undefined);
    const phone = root.locator('#mobile').first();
    if (await phone.count()) {
      await phone.fill(r.phone).catch(() => undefined);
    } else {
      await root.locator('input[formcontrolname="phone"]').first().fill(r.phone).catch(() => undefined);
    }
    await this.page.waitForTimeout(200);
    await this.w.clickPrimary();
    return 'continue';
  }

  private async submit(): Promise<StepResult> {
    // Scope to the real page button: the injected HUD tracker also has a "Submit"
    // stage button, which otherwise makes getByRole(/^Submit$/) ambiguous.
    const btn = this.page.locator('app-submit-app').getByRole('button', { name: /^Submit$/i }).first();
    await expect(btn).toBeVisible({ timeout: 30_000 });
    await btn.click().catch(() => undefined);
    return 'submitted';
  }
}
