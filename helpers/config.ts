import path from 'path';

function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

/** Which environment the robot drives. Set TARGET=local or TARGET=beta. */
export const target = (process.env.TARGET ?? 'beta').toLowerCase() === 'local' ? 'local' : 'beta';

const defaults = {
  beta: {
    appBaseUrl: 'https://beta2.safefinancial.com.au',
    statementPostUrl: 'https://safe-api-beta.azurewebsites.net/bank-feed/submission-response',
    startPath: '/apply/mini-loan',
  },
  local: {
    appBaseUrl: 'http://localhost:4200',
    statementPostUrl: 'http://localhost:5000/bank-feed/submission-response',
    startPath: '/mini-loan',
  },
}[target];

export const config = {
  target,
  appBaseUrl: process.env.APP_BASE_URL || defaults.appBaseUrl,
  /** Full URL that receives the injected bank statement (Postman replacement). */
  statementPostUrl: process.env.STATEMENT_POST_URL || defaults.statementPostUrl,
  bankReferencePrefix: process.env.BANK_REFERENCE_PREFIX ?? 'SFPM',
  statementFile: path.resolve(
    __dirname,
    '..',
    process.env.STATEMENT_FILE ?? 'fixtures/bank-statement.json',
  ),
  startPath: process.env.START_PATH || defaults.startPath,
  pauseAtBank: bool('PAUSE_AT_BANK', false),
  continueToSubmit: bool('CONTINUE_TO_SUBMIT', true),
  /** Stop cleanly once the bank step + verification code are reached (no inject). */
  stopAtBank: bool('STOP_AT_BANK', false),
  /** Auto hand-over (freeze) at this stage so you can drive it by hand. '' = off. */
  handoverStage: process.env.HANDOVER_AT ?? '',
  /** Start paused (press Resume in the HUD to begin). */
  startPaused: bool('START_PAUSED', false),
};

/** Base URL used by Playwright's config too. */
export function resolveBaseUrl(): string {
  return config.appBaseUrl;
}
