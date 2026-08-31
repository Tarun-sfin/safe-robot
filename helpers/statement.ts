import fs from 'fs';
import { APIRequestContext } from '@playwright/test';
import { config } from './config';

/**
 * Keep ONE static statement file. Only customer.reference must match the current
 * page verification code: SFPM-{code}. Top-level "reference" is a BankFeeds
 * submission UUID — leave it alone.
 */
export function loadStatementForCode(verificationCode: string): string {
  if (!fs.existsSync(config.statementFile)) {
    throw new Error(
      `Statement file not found: ${config.statementFile}\n` +
        `Paste your real Postman JSON into fixtures/bank-statement.json.`,
    );
  }

  const raw = fs.readFileSync(config.statementFile, 'utf8');
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Statement file is not valid JSON: ${config.statementFile}\n${e}`);
  }

  const customer = (json.customer as Record<string, unknown> | undefined) ?? {};
  const previous = (customer.reference as string | undefined) ?? '(none)';
  const next = `${config.bankReferencePrefix}-${verificationCode}`;

  customer.reference = next;
  json.customer = customer;

  console.log(`customer.reference: ${previous}  →  ${next}`);
  console.log(`top-level reference left as: ${json.reference}`);
  return JSON.stringify(json);
}

/** Same as Postman: POST the statement JSON to the submission-response endpoint. */
export async function postBankStatement(
  request: APIRequestContext,
  verificationCode: string,
): Promise<void> {
  const body = loadStatementForCode(verificationCode);
  const url = config.statementPostUrl;

  const response = await request.post(url, {
    headers: { 'Content-Type': 'application/json' },
    data: body,
  });

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(
      `submission-response failed (${response.status()}): ${url}\n` +
        `customer.reference used: ${config.bankReferencePrefix}-${verificationCode}\n` +
        `${text.slice(0, 500)}`,
    );
  }

  console.log(`Posted statement to ${url}`);
}
