# Safe Robot — automated desk-case tester

Drives the whole mini-loan wizard automatically with a **fresh random applicant
every run** (new name/email each time, so the anti-duplicate policy never blocks
it), shows an **on-screen red/white progress tracker**, injects the bank
statement at the bank step (Postman replacement), and continues to a successful
submit — which is what triggers the **AI-assessment HTML email**.

## Quick start (one click)

- **`SafeRobot.exe`** — double-click it. It asks **Beta or Local**, sets itself
  up on first run (installs Node, dependencies and Chromium automatically), then
  drives the wizard. Share it by zipping this whole folder.
- **`run-robot.bat`** — same thing without the exe (needs the folder present).
- Rebuild the exe after code changes: `powershell -ExecutionPolicy Bypass -File build-exe.ps1`

Command-line options (exe or `run-robot.ps1`):

```powershell
run-robot.ps1 -Target beta            # test beta
run-robot.ps1 -Target local           # test localhost
run-robot.ps1 -Target beta -StopAtBank  # quick demo: stop at the bank step
run-robot.ps1 -Target beta -Headless    # no visible browser (report only)
```

## The on-screen tracker

A brand-coloured bar pins to the bottom of the page (desktop only — hidden on
mobile, and only on the beta/localhost hosts):

`Start › Purpose › Personal › About You › Identity › Bank › Income › Expenses › Living › References › Submit › Done`

- Finished stages go **solid red**, the current one **pulses**, upcoming ones are pale.
- **Click any stage to take over**: the robot drives up to that stage, then
  freezes so you can drive manually. Click the same stage again to resume.

## Beta vs Local

`TARGET` chooses the environment (the launcher sets it for you):

| Target | Front-end | Statement inject URL | Start path |
|---|---|---|---|
| `beta`  | `https://beta2.safefinancial.com.au` | `https://safe-api-beta.azurewebsites.net/bank-feed/submission-response` | `/apply/mini-loan` |
| `local` | `http://localhost:4200` | `http://localhost:5000/bank-feed/submission-response` | `/mini-loan` |

Override any of these in `.env` (`APP_BASE_URL`, `STATEMENT_POST_URL`, `START_PATH`).

## To run a full end-to-end (AI email) test

The email is produced by the **backend**, so the whole chain must be alive:

1. **Front-end running** — for `local`, start the Angular dev server:
   `cd ../app/online-app && npm start` (serves `http://localhost:4200`).
   *(Currently port 4200 is not running; port 5000/API is.)*
2. **Statement fixture** — paste your real Postman body into
   `fixtures/bank-statement.json`. The robot stamps `customer.reference` with
   `SFPM-{code}` before posting. Without a real statement the wizard can't build
   a budget and won't reach submit.
3. **Local inject URL** — confirm which local service exposes
   `/bank-feed/submission-response` (on beta it's Safe.API). If it's not
   `localhost:5000`, set `STATEMENT_POST_URL` in `.env`.
4. On success the AI email goes to the internal recipients (incl.
   `Tarun.Gudapati@safefinancial.com.au`), subject contains **"AI Questions"**.

## How it works (mental model)

```
Browser (Playwright)                         API
────────────────────                         ───
goto /mini-loan
fill wizard (faker random applicant)
  │  POST /bank/load-for-app
  │◄──── payload.code ─────────────────┤  (robot intercepts this)
  │  stamp statement.customer.reference = SFPM-{code}
  │  POST /bank-feed/submission-response ─►│  (same as Postman)
  │  poll check-new-statement ──► new_received:true
click through budget → Submit → success → AI email
```

## Folder map

| Path | Role |
|---|---|
| `tests/apply-fill-to-bank.spec.ts` | Main robot (stage-driven state machine) |
| `pages/flow.ts` | URL-keyed screen handlers (landing → submit) |
| `pages/personal.page.ts` | Personal step (masked DOB/phone + consent) |
| `pages/wizard.helpers.ts` | Generic tile/button clicks + bank network waits |
| `helpers/stages.ts` | Ordered tracker stages + URL→stage mapping |
| `helpers/hud.ts` | Injected red/white tracker + click-to-hand-over |
| `helpers/test-data.ts` | Random Australian applicant (unique email/run) |
| `helpers/statement.ts` | Patch reference + POST statement |
| `helpers/config.ts` | Target (beta/local) + settings |
| `run-robot.ps1` / `.bat` / `SafeRobot.exe` | One-click launchers |
| `fixtures/bank-statement.json` | Your statement (gitignored — you provide it) |

## Common gotchas

- **Stuck before the bank step** → a screen changed; the handler for that stage
  in `pages/flow.ts` needs a selector tweak. Run headed and watch which stage
  repeats in the tracker.
- **Wrong prefix** → API returns `Invalid reference`. Beta `OnlineAppCode` is `SFPM`.
- **Local run does nothing** → the Angular dev server (`:4200`) isn't running.
- Creates **real applications** on whichever target — that's intentional for a robot.
