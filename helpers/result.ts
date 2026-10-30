import fs from 'fs';
import path from 'path';
import { Page } from '@playwright/test';
import { config } from './config';

/** What one robot run produced. Written to <runDir>/result.json for check-run.ps1 and the agent. */
export type RunResult = {
  target: string;
  appBaseUrl: string;
  startedAt: string;
  finishedAt?: string;
  outcome: 'success' | 'declined' | 'statement-failed' | 'stuck' | 'error' | 'running';
  finalUrl?: string;
  applicant?: { name: string; email: string };
  statementFile: string;
  sourceContract?: string;
  verificationCode?: string;
  coreSlug?: string;
  albertContractId?: number;
  outcomeStatus?: unknown;
  lastStage?: string;
  error?: string;
};

export class ResultRecorder {
  readonly result: RunResult;
  private readonly file: string;

  constructor() {
    this.file = path.join(config.runDir, 'result.json');
    this.result = {
      target: config.target,
      appBaseUrl: config.appBaseUrl,
      startedAt: new Date().toISOString(),
      outcome: 'running',
      statementFile: config.statementFile,
      sourceContract: config.sourceContract || undefined,
    };
    this.save();
  }

  /** GET /loan/outcome/{slug} returns 200 with payload.contractId once Albert has the contract. */
  watch(page: Page): void {
    page.on('response', async (r) => {
      const match = /\/loan\/outcome\/([0-9a-f-]{36})/i.exec(r.url());
      if (!match) return;
      this.result.coreSlug = match[1];
      if (r.status() !== 200) return;
      const body = await r.json().catch(() => null);
      const payload = body?.payload ?? {};
      if (payload.contractId) {
        this.result.albertContractId = Number(payload.contractId);
        this.result.outcomeStatus = payload.status;
        console.log(`[result] Albert contract ${payload.contractId} (status ${JSON.stringify(payload.status)})`);
        this.save();
      }
    });
  }

  update(values: Partial<RunResult>): void {
    Object.assign(this.result, values);
    this.save();
  }

  finish(outcome: RunResult['outcome'], finalUrl: string, error?: string): void {
    this.update({ outcome, finalUrl, error, finishedAt: new Date().toISOString() });
    console.log(`[result] ${outcome} → ${this.file}`);
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.result, null, 2));
  }
}
