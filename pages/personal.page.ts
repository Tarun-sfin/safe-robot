import { Page } from '@playwright/test';
import { ApplicantData } from '../helpers/test-data';

/** Personal details step — selectors match personal.component.html. */
export class PersonalPage {
  constructor(private page: Page) {}

  async fill(data: ApplicantData) {
    // Fail-soft: if the personal form isn't actually here (e.g. the page already
    // navigated on), bail out instead of blocking — the driver loop re-evaluates.
    const here = await this.page
      .locator('#first')
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!here) return;

    // Title is a clickable tile, not a <select>.
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

    // DOB + phone are ngx-mask inputs — type digit-by-digit so the mask and the
    // (input)/(blur) validators fire (plain .fill() leaves the form invalid).
    await this.typeMasked('#dobDay', data.dobDay);
    await this.typeMasked('#dobMonth', data.dobMonth);
    await this.typeMasked('#dobYear', data.dobYear);
    // Blur the DOB group to trigger the final date validation.
    await this.page.locator('#last').click().catch(() => undefined);

    await this.typeMasked('#mobile', data.phone);

    await this.page.locator('#email').click();
    await this.page.locator('#email').fill(data.email);
    // Blur to trigger email/domain validation.
    await this.page.locator('#last').click().catch(() => undefined);

    // Credit-check consent: the visible checkbox is opacity-0; the wrapper with
    // "By ticking this box" runs accept(). Without it, Next stays disabled.
    const consent = this.page.getByText(/By ticking this box/i).first();
    if (await consent.isVisible().catch(() => false)) {
      await consent.click().catch(() => undefined);
    }
  }

  private async typeMasked(selector: string, value: string) {
    const el = this.page.locator(selector);
    await el.click().catch(() => undefined);
    await el.fill('').catch(() => undefined);
    await el.pressSequentially(value, { delay: 40 }).catch(() => undefined);
  }

  async next() {
    await this.page.getByRole('button', { name: /^Next$/i }).click();
  }
}
