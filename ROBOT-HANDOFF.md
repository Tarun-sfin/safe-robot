# Safe Robot — Work Handoff / Resume Notes

_Last updated: 2026-08-27. Purpose: capture full context so we can resume without re-discovery._

## The goal (what we're building)

A one-click "desk-case robot": a Playwright script that drives the whole Safe
Financials mini-loan wizard on **beta** with a fresh random applicant, injects
the bank statement (Postman replacement), and continues all the way to **Submit
→ success**, which triggers the AI-assessment email. Then package it so anyone
on the team can just double-click and run it.

> Note on "APK": it can't literally be an Android `.apk` — it's a desktop
> browser robot. The real deliverable is a Windows **`.exe`** one-click launcher.

## Single source of truth = THIS repo (`c:\Work\Safe-Financials\safe-robot\`)

As of 2026-08-31 we **consolidated to one copy**. The old duplicate dev copy at
`OnlineAppsV2\playwright-tests\` has been **deleted**. From now on, **edit here**
(`safe-robot`) — it's both the source you run and the source the exe uses.

This repo (standalone git repo, branch `main`, **NO remote yet → never pushed**)
contains everything:
- `pages/`, `helpers/`, `tests/` — the robot logic (now includes the occupancy +
  discretionary fixes, synced from the old dev copy)
- `SafeRobot.exe` (compiled launcher), `run-robot.bat`, `run-robot.ps1`,
  `build-exe.ps1` (rebuild script)
- `README.md` (Beta/Local prompt, auto-installs Node/deps/Chromium)
- `.env` + `fixtures/bank-statement.json` (real, git-ignored — do not share)

## Progress so far

- [x] **Occupancy stage fixed** (`/loan/living-details`). Was infinite-looping
  with `[occupancy] errors=["Back"]`. Fixed handler in `pages/flow.ts`
  (`occupancy()`) — dynamic-flow loop that answers every tile-group, fills
  amounts/dates, and clicks Confirm only once it turns valid. **Verified passing**
  in run `298404`.
- [x] **Discretionary spending stage fixed** (`/loan/discretionary-spending`,
  Angular component = `ReduceSpendingComponent`). Was the new infinite loop
  (`[stage] Discretionary spending` x60, never advanced). See root cause below.
  Fix applied to `discretionary()` in `pages/flow.ts`. **Verification run was
  in progress when these notes were written** (see "Where we stopped").
- [ ] Verify a full headed run reaches `/loan/success`.
- [ ] Sync fixed source `playwright-tests` → `safe-robot`.
- [ ] Rebuild `SafeRobot.exe` (`build-exe.ps1`) in `safe-robot`.
- [ ] Create a new GitHub remote for `safe-robot` and push.
- [ ] Clean up redundant `Run-Beta-Test.exe` + `run-beta-test.ps1` created in
  `playwright-tests` (superseded by safe-robot's launchers).

## Discretionary spending — root cause & fix (reference)

App source: `app/online-app/src/app/pages/loan/reduce-spending/` (route
`discretionary-spending` → `ReduceSpendingComponent`).

- Options are `<label (click)="toggleOption(i)">` wrapping a **`readonly`**
  `<input type="checkbox">`. So you must **click the label**, not `.check()` the
  box. Options render under `*ngIf="loan"` (loaded async).
- The **Next** button only advances when `getSelectedOptions().length > 0`;
  otherwise `next()` silently sets an inline error and stays on the page → the
  loop. The old handler never verified a selection actually registered.
- **Fix**: wait for options, click a concrete option (prefer "Dining out",
  never the "I'm not willing" opt-out), confirm `input[type="checkbox"]:checked`
  count > 0 (retry up to 4x), then click Next explicitly and `waitForURL` away
  from `/discretionary-spending`.

Flow after this stage: `discretionary-spending → references → submit → success`
(or `loan-security` if `needSecurity`, or straight to `submit` if
`skip_reference`). `references` uses child `app-reference-person` needing valid
first/last/**mobile** (has `invalidMobile` validator; test-data generates
`04` + 8 digits, which is valid). `submit` page has a single **Submit** button.

## How to run (from `playwright-tests`)

```powershell
$env:TARGET="beta"; $env:STOP_AT_BANK="0"; $env:SHOW_HUD="1"; $env:CONTINUE_TO_SUBMIT="1"; $env:PAUSE_AT_BANK="0"; $env:HANDOVER_AT=""; npx playwright test --headed 2>&1
```

Run takes ~4 min headed. Watch the `[stage]` lines; a stage repeating = that
handler needs a selector tweak. Success prints `SUCCESS` / lands on `/loan/success`.

## Key files

| File | Role |
|---|---|
| `pages/flow.ts` | URL-keyed screen handlers (all the stage logic) |
| `tests/apply-fill-to-bank.spec.ts` | Main driver loop (bank inject + submit loop) |
| `pages/wizard.helpers.ts` | Generic tile/button clicks + bank network waits |
| `pages/personal.page.ts` | Personal step (masked DOB/phone + consent) |
| `helpers/stages.ts` | Tracker stages + URL→stage mapping |
| `helpers/hud.ts` | Injected progress tracker + click-to-hand-over |
| `helpers/test-data.ts` | Random AU applicant (unique email/run) |
| `helpers/statement.ts` | Patch reference + POST statement |
| `helpers/config.ts` | Target (beta/local) + settings |

App (for reverse-engineering screens): `app/online-app/src/app/pages/loan/*` and
`.../budget/*`.

## Environment / tooling available

- Node v24.13.1, npm 11.8.0
- `ps2exe` 1.0.18 (compiles a `.ps1` launcher → real `.exe`)
- `winget` 1.29 (launcher can auto-install Node on machines that lack it)

## Where we stopped

Editing was done in `playwright-tests/pages/flow.ts` (occupancy + discretionary).

**Discretionary fix is NOT yet verified end-to-end.** The verification headed run
(terminal `298405`) got stuck at the very first stage: `[hud] paused at "Start" —
waiting for Resume…`, so it never exercised the discretionary change. It was
killed during the pause. `START_PAUSED` defaults to `false` and the two earlier
identical runs (`298403`, `298404`) did NOT pause at Start, so this looks like an
intermittent HUD gate race — not a config change. **Next time: just re-run the
command below; if it pauses at Start again, click Resume in the browser (or dig
into `helpers/hud.ts` gate/startPaused logic).**

### Resume checklist (next session)
1. Re-run the headed command (from `safe-robot`) and confirm it advances past
   `Discretionary spending` → `references` → `submit` → `/loan/success`.
   (Discretionary fix is committed but **not yet verified end-to-end**.)
2. If it pauses at "Start", click Resume in the browser (intermittent HUD gate).
3. Rebuild the exe only if you changed the launcher:
   `powershell -ExecutionPolicy Bypass -File build-exe.ps1`.
4. **Still TODO: create a GitHub repo + push** (`git remote add origin …; git push -u origin main`).
5. To share: package the folder (exe included, secrets excluded) — see "How to
   send it" notes; ship the demo/stop-at-bank flavor unless a real statement is
   provided.

### Done on 2026-08-31
- Synced all source into `safe-robot`, rebuilt `SafeRobot.exe`, committed.
- Deleted the duplicate `OnlineAppsV2\playwright-tests\` copy and its stray
  `Run-Beta-Test.exe` / `run-beta-test.ps1`.
- Left the FE's `questions` feature + `.gitignore` change for the user to commit.
