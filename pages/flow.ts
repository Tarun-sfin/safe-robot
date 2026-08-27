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

  /** A short, human label for the current screen (for the HUD). */
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
      [/\/loan\/benefit-review/i, 'Benefit review'],
      [/\/budget\/additional-income/i, 'Additional income'],
      [/\/budget\/expense-list/i, 'Review expenses'],
      [/\/budget\/expense-bnpl/i, 'BNPL balances'],
      [/\/budget\/expense-credit-cards/i, 'Credit card balances'],
      [/\/budget\/additional-expenses/i, 'Additional expenses'],
      [/\/loan\/living-details/i, 'Address & occupancy'],
      [/\/loan\/discretionary-spending/i, 'Discretionary spending'],
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
    if (/\/loan\/reject/i.test(u)) return 'rejected';

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
    if (/\/loan\/benefit-review/i.test(u)) return this.tapAdvance(/^Save And Continue$/i);
    if (/\/budget\/additional-income/i.test(u)) return this.reviewOpenForms(/^Next$/i, 'app-income-details');
    if (/\/budget\/expense-list/i.test(u)) return this.reviewList(/^Next$/i, 'app-expense-details');
    if (/\/budget\/expense-(bnpl|credit-cards)/i.test(u)) return this.tapAdvance(/^Next$/i);
    if (/\/budget\/additional-expenses/i.test(u)) return this.reviewOpenForms(/^Next$/i, 'app-expense-details');
    if (/\/loan\/living-details/i.test(u)) return this.occupancy();
    if (/\/loan\/discretionary-spending/i.test(u)) return this.discretionary();
    if (/\/loan\/references/i.test(u)) return this.references();
    if (/\/loan\/submit/i.test(u)) return this.submit();
    if (/\/loan\/loading-outcome/i.test(u)) return this.waitScreen();

    // Unknown screen: best-effort.
    await this.w.clickFirstTile();
    await this.w.clickPrimary();
    return 'unknown';
  }

  // ---- individual step handlers -------------------------------------------

  private async landing(): Promise<StepResult> {
    // Pick a repayment term tile if present, then the "Apply Now" CTA.
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
    // Sub-category tiles render only after a group is chosen.
    const sub = this.page.locator('.jump.std-block.h-20').first();
    await sub.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
    await sub.click().catch(() => undefined);
    await this.page.waitForTimeout(300);
    await this.w.clickButton(/^Next$/i);
    return 'continue';
  }

  private async personalStep(): Promise<StepResult> {
    await this.personal.fill(this.applicant);
    await this.page.waitForTimeout(300);
    await this.personal.next();
    return 'continue';
  }

  private async family(): Promise<StepResult> {
    await this.w.clickChoice(/single/i);
    await this.page.waitForTimeout(300);
    // Dependants = 0 (first tile).
    const zero = this.page.locator('.jump.std-block', { hasText: /^\s*0\s*$/ }).first();
    if (await zero.isVisible().catch(() => false)) await zero.click().catch(() => undefined);
    await this.page.waitForTimeout(200);
    await this.w.clickPrimary();
    return 'continue';
  }

  private async identity(): Promise<StepResult> {
    // Driver-licence path is the default.
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
    // Polling screens: just wait for navigation away.
    await this.page.waitForTimeout(3000);
    return 'continue';
  }

  /**
   * "Review" lists (confirm-accounts income / expense-list): each raw item shows
   * a "provide more details" link that opens a detail sub-form. Open each, fill
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
      await this.page.waitForTimeout(900); // save round-trip + re-render
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
   * that form so multiple open forms don't cross-fill). Handles: expense type,
   * wage type + business name, amount, Frequency, card limit, loan purpose +
   * balance, and recurring month/year.
   */
  private async confirmOpenDetail(root: Locator): Promise<boolean> {
    await this.clickTileUnder(root, /type of expense/i);
    await this.clickTileUnder(root, /Type of wage/i);

    const bus = root.locator('#busname').first();
    if (await bus.isVisible().catch(() => false)) {
      await bus.fill('Employer Pty Ltd').catch(() => undefined);
    }
    await this.typeMoney(root, '#abn', '51824753556');
    // Manual/general amount ("How much do you pay?" / income amount).
    await this.typeMoney(root, '#ammend', '200');

    // Frequency — required for most income & expense items.
    await this.clickTileUnder(root, /Frequency/i);

    // Expense specifics.
    await this.typeMoney(root, '#cardlimit', '5000');
    await this.clickTileUnder(root, /purpose of this loan/i);
    await this.typeMoney(root, '#balance', '5000');

    // Recurring "since" month/year dropdowns + manual deposit destination.
    for (const sel of ['#month', '#year']) {
      const dd = root.locator(sel).first();
      if (await dd.isVisible().catch(() => false)) {
        await dd.selectOption({ index: 1 }).catch(() => undefined);
      }
    }
    await this.clickTileUnder(root, /deposited into/i);

    await this.page.waitForTimeout(200);
    const confirm = root.getByRole('button', { name: /^Confirm$/i }).first();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click().catch(() => undefined);
      return true;
    }
    return false;
  }

  private async occupancy(): Promise<StepResult> {
    // 1. Address via Google Places autocomplete — type, then pick the first hit.
    const addr = this.page.locator('#address').first();
    if (await addr.isVisible().catch(() => false)) {
      await addr.click().catch(() => undefined);
      await addr.fill('').catch(() => undefined);
      await addr.pressSequentially(this.applicant.address, { delay: 70 }).catch(() => undefined);
      await this.page.waitForTimeout(2000); // wait for Google predictions
      await this.page.keyboard.press('ArrowDown').catch(() => undefined);
      await this.page.keyboard.press('Enter').catch(() => undefined);
      await this.page.waitForTimeout(700);
    }

    // 2. "Lived here since" month/year.
    for (const sel of ['#from-month', '#from-year']) {
      const dd = this.page.locator(sel).first();
      if (await dd.isVisible().catch(() => false)) {
        await dd.selectOption({ index: 1 }).catch(() => undefined);
      }
    }

    // 3. Occupancy group (prefer Renting) then subtype.
    if (!(await this.w.clickChoice(/renting|rent/i))) {
      const grp = this.page.locator('#occupancy-groups').locator('xpath=..').locator('.jump.std-block').first();
      await grp.click().catch(() => undefined);
    }
    await this.page.waitForTimeout(700);
    const subtype = this.page.locator('.jump.std-block.h-20').first();
    if (await subtype.isVisible().catch(() => false)) {
      await subtype.click().catch(() => undefined);
      await this.page.waitForTimeout(700);
    }

    // 4. Dynamic flow steps appear progressively as each is answered.
    const flow = () => this.page.locator('#accommodation').locator('xpath=..');
    for (let r = 0; r < 10; r++) {
      // Amount / text inputs.
      const inputs = flow().locator('input[id^="step-"]');
      const n = await inputs.count().catch(() => 0);
      for (let i = 0; i < n; i++) {
        const el = inputs.nth(i);
        if (await el.isVisible().catch(() => false)) {
          const val = await el.inputValue().catch(() => '');
          if (!val) {
            await el.click().catch(() => undefined);
            await el.pressSequentially('200', { delay: 25 }).catch(() => undefined);
            await el.blur().catch(() => undefined);
          }
        }
      }
      // Date selects.
      const selects = flow().locator('select[id^="step-"]');
      const sn = await selects.count().catch(() => 0);
      for (let i = 0; i < sn; i++) {
        await selects.nth(i).selectOption({ index: 1 }).catch(() => undefined);
      }
      // Answer one tile group per pass (reveals the next step).
      const tile = flow().locator('.std-block:not(.selected-block)').first();
      if (await tile.isVisible().catch(() => false)) {
        await tile.click().catch(() => undefined);
      }
      await this.page.waitForTimeout(500);

      const next = this.page.getByRole('button', { name: /^(Next|Confirm|Save)$/i }).last();
      if (await next.isEnabled().catch(() => false)) break;
    }

    await this.page.waitForTimeout(200);
    // Diagnostic: the button is always enabled (disabled only while saving), so
    // capture the screen + any visible validation errors before clicking.
    const addrVal = await this.page.locator('#address').first().inputValue().catch(() => '(n/a)');
    const errors = await this.page
      .locator('.text-red-500')
      .allInnerTexts()
      .catch(() => [] as string[]);
    console.log(`[occupancy] address="${addrVal}" errors=${JSON.stringify(errors.filter((e) => e.trim()))}`);
    await this.page.screenshot({ path: 'test-results/occupancy-stuck.png', fullPage: true }).catch(() => undefined);

    const nextBtn = this.page.getByRole('button', { name: /^(Next|Confirm|Save)$/i }).last();
    if (!(await nextBtn.click().then(() => true).catch(() => false))) {
      await this.w.clickPrimary();
    }
    return 'continue';
  }

  private async discretionary(): Promise<StepResult> {
    const opt = this.page.locator('label', { hasText: /gambling|not willing|entertainment/i }).first();
    if (await opt.isVisible().catch(() => false)) {
      await opt.click().catch(() => undefined);
    } else {
      await this.page.locator('input[type="checkbox"]').first().check().catch(() => undefined);
    }
    await this.page.waitForTimeout(200);
    await this.w.clickPrimary();
    return 'continue';
  }

  private async references(): Promise<StepResult> {
    const r = this.applicant.reference;
    await this.page.locator('#first').fill(r.firstName).catch(() => undefined);
    await this.page.locator('#last').fill(r.lastName).catch(() => undefined);
    const phone = this.page.locator('#mobile');
    if (await phone.count()) {
      await phone.fill(r.phone).catch(() => undefined);
    } else {
      await this.page.locator('input[formcontrolname="phone"]').fill(r.phone).catch(() => undefined);
    }
    await this.page.waitForTimeout(200);
    await this.w.clickPrimary();
    return 'continue';
  }

  private async submit(): Promise<StepResult> {
    await expect(this.page.getByRole('button', { name: /^Submit$/i })).toBeVisible({ timeout: 30_000 });
    await this.w.clickButton(/^Submit$/i);
    return 'submitted';
  }
}
