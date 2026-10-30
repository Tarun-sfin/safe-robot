import { Page, expect, Locator } from '@playwright/test';
import { ApplicantData } from '../helpers/test-data';

/** Personal details step — selectors match personal.component.html. */
export class PersonalPage {
  constructor(private page: Page) {}

  /** ngx-mask fields ignore .fill(); type digit-by-digit and blur to commit. */
  private async typeMasked(sel: string, value: string) {
    const el = this.page.locator(sel);
    await el.click();
    await el.fill('').catch(() => undefined);
    await el.pressSequentially(value, { delay: 40 });
    await el.blur().catch(() => undefined);
  }

  async fill(data: ApplicantData) {
    await expect(this.page.locator('#first')).toBeVisible({ timeout: 60_000 });

    // Title is a clickable tile that sets a hidden control.
    await this.page
      .locator('.jump.std-block', { hasText: new RegExp(`^\\s*${data.title}\\s*$`, 'i') })
      .first()
      .click()
      .catch(() => undefined);

    await this.page.locator('#first').fill(data.firstName);
    if (data.middleName) {
      await this.page.locator('#middle').fill(data.middleName).catch(() => undefined);
    }
    await this.page.locator('#last').fill(data.lastName);

    // DOB + phone are ngx-mask inputs — must be typed to fire (input)/(blur).
    await this.typeMasked('#dobDay', data.dobDay);
    await this.typeMasked('#dobMonth', data.dobMonth);
    await this.typeMasked('#dobYear', data.dobYear);
    await this.typeMasked('#mobile', data.phone);

    await this.page.locator('#email').click();
    await this.page.locator('#email').fill(data.email);
    await this.page.locator('#email').blur().catch(() => undefined);

    // Tick the required consent (wrapper handles the click; input is opacity-0).
    // Mini-loan / CC copy is "I agree and consent"; DA/brokered still say "acknowledge".
    const consent = this.page
      .locator('.cursor-pointer')
      .filter({ hasText: /agree and consent|acknowledge|I consent/i })
      .first();
    if (await consent.count()) {
      const box = consent.locator('input[type="checkbox"]').first();
      const checked = (await box.count()) ? await box.isChecked().catch(() => false) : false;
      if (!checked) await consent.click().catch(() => undefined);
    }
  }

  /** Wait for the async email/domain validation to settle and Next to enable. */
  async waitForNextEnabled(timeoutMs = 20_000): Promise<Locator> {
    const next = this.page.getByRole('button', { name: /^Next$/i }).first();
    await expect(next).toBeEnabled({ timeout: timeoutMs });
    return next;
  }

  async next() {
    const next = await this.waitForNextEnabled().catch(() => null);
    if (next) {
      await next.click();
    } else {
      await this.page.getByRole('button', { name: /^Next$/i }).click({ force: true }).catch(() => undefined);
    }
  }
}
