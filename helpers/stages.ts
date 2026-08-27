/**
 * The high-level stages shown in the on-screen tracker. Many wizard screens
 * collapse into one friendly stage (e.g. confirm-accounts + income-list both
 * live under "Income"). The order here is the order drawn left-to-right.
 */
export const STAGES = [
  'Start',
  'Purpose',
  'Personal',
  'About You',
  'Identity',
  'Bank',
  'Income',
  'Expenses',
  'Living',
  'References',
  'Submit',
  'Done',
] as const;

export type StageName = (typeof STAGES)[number];

/** Map a wizard URL to its stage index (or -1 if not recognised). */
export function stageIndexForUrl(url: string): number {
  const rules: [RegExp, StageName][] = [
    [/\/loan\/purpose/i, 'Purpose'],
    [/\/loan\/personal/i, 'Personal'],
    [/\/loan\/family/i, 'About You'],
    [/\/loan\/identity/i, 'Identity'],
    [/\/budget\/(start|loading-statement)/i, 'Bank'],
    [/\/budget\/(confirm-accounts|income-accounts|additional-income)/i, 'Income'],
    [/\/loan\/benefit-review/i, 'Income'],
    [/\/budget\/(expense-list|expense-bnpl|expense-credit-cards|additional-expenses)/i, 'Expenses'],
    [/\/loan\/(living-details|discretionary-spending)/i, 'Living'],
    [/\/loan\/references/i, 'References'],
    [/\/loan\/(submit|loading-outcome)/i, 'Submit'],
    [/\/loan\/(success|reject)/i, 'Done'],
    // Everything before purpose (landing, eligible, warning, source) = Start.
    [/mini-loan|\/loan\/(eligible|warning|source)/i, 'Start'],
  ];
  for (const [re, name] of rules) {
    if (re.test(url)) return STAGES.indexOf(name);
  }
  return -1;
}
