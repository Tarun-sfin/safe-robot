import { Page } from '@playwright/test';
import { STAGES } from './stages';

export interface HudOptions {
  /** Show the HUD only when the page host matches one of these (beta / localhost). */
  hosts: string[];
  /** Hide the HUD below this viewport width so it never shows on mobile. */
  minWidth: number;
  /** Master switch — when false the HUD is never injected. */
  enabled: boolean;
  /** Ordered stage labels drawn left-to-right. */
  stages: string[];
  /** Start paused (robot waits for Resume before it moves). */
  startPaused: boolean;
}

/**
 * On-screen, brand-coloured control bar injected into the app by Playwright.
 *
 * - A prominent, always-visible Pause / Resume button on the left (never covered).
 * - A progress tracker of every stage (Start -> ... -> Done); finished stages go
 *   solid red, the current one pulses.
 * - Pause freezes the robot between steps so you can drive a tricky screen (e.g.
 *   the address) by hand, then Resume. You can also click a specific stage to
 *   hand over exactly there.
 * - Desktop-only (hidden on mobile widths) and only on the allowed hosts.
 *
 * Nothing here touches the real Angular app — it is layered on at runtime.
 */
export class Hud {
  constructor(private page: Page, private opts: HudOptions) {}

  async install(): Promise<void> {
    if (!this.opts.enabled) return;
    await this.page.addInitScript(hudInitScript, this.opts);
    this.page.on('load', () => {
      this.page.evaluate(hudInitScript, this.opts).catch(() => undefined);
    });
  }

  async setStage(index: number): Promise<void> {
    if (!this.opts.enabled || index < 0) return;
    await this.page.evaluate((i) => (window as any).__robot?.setStage?.(i), index).catch(() => undefined);
  }

  async finish(ok: boolean): Promise<void> {
    if (!this.opts.enabled) return;
    await this.page.evaluate((v) => (window as any).__robot?.finish?.(v), ok).catch(() => undefined);
  }

  async banner(text: string): Promise<void> {
    if (!this.opts.enabled) return;
    await this.page.evaluate((t) => (window as any).__robot?.setBanner?.(t), text).catch(() => undefined);
  }

  private async pauseState(): Promise<{ paused: boolean; handoverAt: number | null }> {
    if (!this.opts.enabled) return { paused: false, handoverAt: null };
    return this.page
      .evaluate(() => ({
        paused: !!(window as any).__robot?.paused,
        handoverAt: (window as any).__robot?.handoverAt ?? null,
      }))
      .catch(() => ({ paused: false, handoverAt: null as number | null }));
  }

  /**
   * Called before driving the stage at `index`. Freezes if the operator pressed
   * Pause, or clicked a stage at/after which to hand over. Resumes when they
   * press Resume (or un-arm the stage).
   */
  async gate(index: number): Promise<void> {
    if (!this.opts.enabled) return;
    const frozen = (s: { paused: boolean; handoverAt: number | null }) =>
      s.paused || (s.handoverAt !== null && index >= s.handoverAt);

    if (!frozen(await this.pauseState())) return;

    await this.banner('Paused — drive this screen yourself, then press Resume.');
    console.log(`[hud] paused at "${STAGES[index] ?? index}" — waiting for Resume…`);
    for (;;) {
      await this.page.waitForTimeout(400);
      if (!frozen(await this.pauseState())) break;
    }
    await this.banner('Running…');
    console.log('[hud] resumed.');
  }
}

/**
 * Runs INSIDE the browser. Builds the control bar and exposes `window.__robot`.
 * Self-contained (no external refs) because it is serialized into the page.
 */
function hudInitScript(opts: HudOptions): void {
  const w = window as any;
  if (!opts || !opts.enabled) return;
  if (w.__robotInstalled) return;

  const host = location.hostname;
  const allowed = (opts.hosts || []).some((h) => host.indexOf(h) !== -1);
  if (!allowed) return;

  w.__robotInstalled = true;
  const RED = '#EF4035';
  const RED_DARK = '#C2180E';
  const GREEN = '#2FB84D';
  const GRAY = '#90979A';

  w.__robot = w.__robot || {
    current: -1,
    handoverAt: null as number | null,
    paused: !!opts.startPaused,
    stages: opts.stages,
    setStage(_i: number) {},
    setBanner(_t: string) {},
    finish(_ok: boolean) {},
    togglePause() {},
  };

  const build = () => {
    if (document.getElementById('__robot_hud')) return;
    const root = document.body || document.documentElement;
    if (!root) return;

    const style = document.createElement('style');
    style.textContent =
      '@keyframes robotPulse{0%{box-shadow:0 0 0 0 rgba(239,64,53,.55)}70%{box-shadow:0 0 0 8px rgba(239,64,53,0)}100%{box-shadow:0 0 0 0 rgba(239,64,53,0)}}' +
      '#__robot_track::-webkit-scrollbar{height:6px}#__robot_track::-webkit-scrollbar-thumb{background:#ddd;border-radius:3px}';
    document.head?.appendChild(style);

    const bar = document.createElement('div');
    bar.id = '__robot_hud';
    bar.setAttribute(
      'style',
      [
        'position:fixed',
        'left:0',
        'right:0',
        'bottom:0',
        'z-index:2147483647',
        'font-family:Roboto,Segoe UI,Arial,sans-serif',
        'font-size:12px',
        'color:#434956',
        'background:#ffffff',
        'border-top:3px solid ' + RED,
        'box-shadow:0 -6px 24px rgba(0,0,0,0.12)',
        'display:flex',
        'align-items:center',
        'gap:12px',
        'padding:8px 14px',
      ].join(';'),
    );

    // --- Pause / Resume button (prominent, first, never covered) ---
    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.id = '__robot_pause';
    const paintPause = () => {
      const paused = !!w.__robot.paused;
      pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
      pauseBtn.setAttribute(
        'style',
        [
          'flex:0 0 auto',
          'cursor:pointer',
          'border:none',
          'border-radius:8px',
          'padding:8px 16px',
          'font-weight:800',
          'font-size:13px',
          'color:#fff',
          'min-width:104px',
          'background:' + (paused ? GREEN : RED),
        ].join(';'),
      );
    };
    pauseBtn.onclick = () => {
      w.__robot.paused = !w.__robot.paused;
      paintPause();
      banner.textContent = w.__robot.paused
        ? 'Paused — drive this screen yourself, then press Resume.'
        : 'Running…';
    };

    const brand = document.createElement('div');
    brand.innerHTML =
      '<span style="font-weight:800;letter-spacing:1px;color:' +
      RED +
      '">SAFE</span><span style="font-weight:800;letter-spacing:1px;color:#434956"> ROBOT</span>';
    brand.setAttribute('style', 'white-space:nowrap;flex:0 0 auto');

    const banner = document.createElement('div');
    banner.id = '__robot_banner';
    banner.setAttribute(
      'style',
      'white-space:nowrap;flex:0 1 auto;color:' + GRAY + ';max-width:200px;overflow:hidden;text-overflow:ellipsis',
    );
    banner.textContent = w.__robot.paused ? 'Paused' : 'Starting…';

    const divider = document.createElement('span');
    divider.setAttribute('style', 'width:1px;height:22px;background:#e5e7eb;flex:0 0 auto');

    const track = document.createElement('div');
    track.id = '__robot_track';
    track.setAttribute(
      'style',
      'display:flex;align-items:center;gap:6px;overflow-x:auto;flex:1 1 auto;padding-bottom:2px',
    );

    const pills: HTMLElement[] = [];
    (opts.stages || []).forEach((name, i) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.textContent = name;
      pill.title = 'Click to hand over from this stage';
      pill.dataset.i = String(i);
      pill.onclick = () => {
        w.__robot.handoverAt = w.__robot.handoverAt === i ? null : i;
        paint();
      };
      pills.push(pill);
      track.appendChild(pill);
      if (i < opts.stages.length - 1) {
        const arrow = document.createElement('span');
        arrow.textContent = '›';
        arrow.setAttribute('style', 'color:#cbd5e1;flex:0 0 auto');
        track.appendChild(arrow);
      }
    });

    const basePill =
      'flex:0 0 auto;cursor:pointer;border-radius:999px;padding:5px 12px;font-weight:700;font-size:12px;white-space:nowrap;transition:all .15s ease;';

    const paint = () => {
      const cur = w.__robot.current;
      const ho = w.__robot.handoverAt;
      pills.forEach((p, i) => {
        let s = basePill;
        if (i < cur) {
          s += 'background:' + RED + ';color:#fff;border:1px solid ' + RED + ';';
        } else if (i === cur) {
          s += 'background:#fff;color:' + RED + ';border:2px solid ' + RED + ';animation:robotPulse 1.4s infinite;';
        } else {
          s += 'background:#F3F4F6;color:' + GRAY + ';border:1px solid #E5E7EB;';
        }
        if (ho === i) {
          s += 'outline:2px dashed ' + RED_DARK + ';outline-offset:2px;';
        }
        p.setAttribute('style', s);
      });
      const curPill = pills[cur];
      if (curPill) curPill.scrollIntoView({ inline: 'center', block: 'nearest' });
    };

    bar.appendChild(pauseBtn);
    bar.appendChild(brand);
    bar.appendChild(banner);
    bar.appendChild(divider);
    bar.appendChild(track);
    root.appendChild(bar);

    w.__robot.setStage = (i: number) => {
      w.__robot.current = i;
      paint();
    };
    w.__robot.setBanner = (t: string) => {
      banner.textContent = t;
    };
    w.__robot.togglePause = () => pauseBtn.click();
    w.__robot.finish = (ok: boolean) => {
      w.__robot.current = opts.stages.length - 1;
      paint();
      const last = pills[pills.length - 1];
      if (last) {
        last.setAttribute(
          'style',
          basePill +
            'color:#fff;border:1px solid ' +
            (ok ? '#4DCD2A' : RED_DARK) +
            ';background:' +
            (ok ? '#4DCD2A' : RED_DARK) +
            ';',
        );
        last.textContent = ok ? '✓ Done' : '✗ Stopped';
      }
    };

    paintPause();
    paint();

    const applyVisibility = () => {
      bar.style.display = window.innerWidth >= opts.minWidth ? 'flex' : 'none';
    };
    applyVisibility();
    window.addEventListener('resize', applyVisibility);
  };

  if (document.body) {
    build();
  } else {
    document.addEventListener('DOMContentLoaded', build);
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (document.getElementById('__robot_hud') || tries > 40) {
        clearInterval(iv);
        return;
      }
      build();
    }, 250);
  }
}
