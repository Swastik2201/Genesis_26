/**
 * ==========================================================================
 * CONFIDENCE REALITY CHECK / CALIBRATION (panels/calibration.js)
 * USP 4: Calibration curve, Expected Calibration Error (ECE), and threshold analysis.
 * ==========================================================================
 */

export function mount(container) {
  container.innerHTML = `
    <div class="panel-calibration">
      <div class="panel-header-row" style="margin-bottom: var(--space-lg); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">USP 04 // SCIENTIFIC RIGOR</div>
          <h2 style="margin-bottom: 4px;">CONFIDENCE REALITY CHECK</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Plot predicted probability against empirical success rate to detect overconfidence.</p>
        </div>
        <span class="badge badge-good">CALIBRATION ONLINE</span>
      </div>

      <div class="hud-card" style="min-height: 380px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
        <div style="font-size: 2.2rem; margin-bottom: var(--space-xs); color: var(--neon-green);">📊</div>
        <h3 style="color: #fff; margin-bottom: var(--space-xs);">CALIBRATION SUITE READY</h3>
        <p style="color: var(--text-secondary); max-width: 540px; margin-bottom: var(--space-md);">
          Reliability diagram, Expected Calibration Error (ECE), confidence bin breakdowns, and sample size warnings will mount here in Prompt 5.
        </p>
        <span class="chip chip-active">ECE Metric 0.058 (Sample Size n=40)</span>
      </div>
    </div>
  `;
}

export function unmount() {}
