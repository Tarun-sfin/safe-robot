import { Page, Response } from '@playwright/test';

/** Shared wizard helpers used across loan + budget steps. */
export class WizardHelpers {
  constructor(private page: Page) {}

  /** Click the first visible primary/advance button on the current screen. */
  async clickPrimary(): Promise<boolean> {
    const names = [
      /^Next$/i,
      /^Continue$/i,
      /^Confirm$/i,
      /^Save And Continue$/i,
      /^Get started$/i,
      /^Submit$/i,
    ];
    for (const name of names) {
      const btn = this.page.getByRole('button', { name }).first();
      if (await btn.isVisible().catch(() => false)) {
        if (await btn.isEnabled().catch(() => false)) {
          await btn.click().catch(() => undefined);
          return true;
        }
      }
    }
    return false;
  }

  async clickButton(name: RegExp): Promise<boolean> {
    const btn = this.page.getByRole('button', { name }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => undefined);
      return true;
    }
    return false;
  }

  /** Click a selectable "std-block" tile by visible text (loan purpose, family, etc.). */
  async clickChoice(text: string | RegExp): Promise<boolean> {
    const tile = this.page.locator('.std-block', { hasText: text }).first();
    if (await tile.isVisible().catch(() => false)) {
      await tile.click().catch(() => undefined);
      return true;
    }
    return false;
  }

  /** Click the first visible clickable tile on the screen. */
  async clickFirstTile(): Promise<boolean> {
    const tile = this.page.locator('.jump.std-block, .std-block').first();
    if (await tile.isVisible().catch(() => false)) {
      await tile.click().catch(() => undefined);
      return true;
    }
    return false;
  }

  /**
   * Wait for POST /bank/load-for-app and return payload.code (verification id).
   * Start this BEFORE navigating into the bank step so you don't miss the response.
   */
  waitForVerificationCode(): Promise<string> {
    return this.page
      .waitForResponse(
        (r: Response) =>
          r.url().includes('/bank/load-for-app') && r.request().method() === 'POST' && r.ok(),
        { timeout: 5 * 60_000 },
      )
      .then(async (r) => {
        const body = await r.json();
        const code = body?.payload?.code as string | undefined;
        if (!code) {
          throw new Error(`load-for-app returned no payload.code: ${JSON.stringify(body)}`);
        }
        return code;
      });
  }

  /** Wait until the wizard poll reports a new bank response arrived. */
  waitForStatementReceived(): Promise<void> {
    return this.page
      .waitForResponse(
        async (r: Response) => {
          if (!r.url().includes('/bank/check-new-statement') || !r.ok()) return false;
          try {
            const body = await r.json();
            return body?.payload?.new_received === true;
          } catch {
            return false;
          }
        },
        { timeout: 5 * 60_000 },
      )
      .then(() => undefined);
  }
}
