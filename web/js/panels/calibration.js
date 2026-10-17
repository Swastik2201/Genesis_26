/**
 * ==========================================================================
 * BEAT THE BOT — CONFIDENCE REALITY CHECK PANEL (panels/calibration.js)
 * USP 4: Calibration curve, Expected Calibration Error (ECE), and threshold analysis.
 * Features plain SVG Reliability Diagram, HUD Stats, and Computed Plain-English Verdict.
 * ==========================================================================
 */

import { store } from '../store.js';
import * as api from '../api.js';

export async function mount(container) {
  const sessionId = store.getState().currentSession;

  container.innerHTML = `
    <div class="panel-calibration">
      <div class="panel-header-row" style="margin-bottom: var(--space-md); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">USP 04 // SCIENTIFIC RIGOR</div>
          <h2 style="margin-bottom: 4px;">CONFIDENCE REALITY CHECK</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Plot predicted probability against empirical success rate to detect overconfidence.</p>
        </div>
      </div>
      <div class="hud-card" style="text-align: center; padding: var(--space-2xl);">
        <div style="font-size: 2.2rem; color: var(--neon-green); margin-bottom: var(--space-sm); animation: pulseDot 1.4s infinite;">🎯</div>
        <p style="color: var(--text-secondary);">Computing empirical calibration metrics &amp; reliability bins...</p>
      </div>
    </div>
  `;

  try {
    const data = await api.calibration(sessionId);
    renderCalibrationUI(container, data);
  } catch (err) {
    console.error('[Calibration] Error fetching calibration data:', err);
    container.innerHTML = `
      <div class="hud-card" style="border-color: var(--red); padding: var(--space-xl); text-align: center;">
        <h3 style="color: var(--red);">CALIBRATION NOT AVAILABLE</h3>
        <p style="color: var(--text-secondary);">${err.message || 'Calibration engine returned 501.'}</p>
        <button id="btn-retry-calib" class="btn btn-primary btn-sm">RETRY</button>
      </div>
    `;
    const btn = container.querySelector('#btn-retry-calib');
    if (btn) btn.addEventListener('click', () => mount(container));
  }
}

export function unmount() {}

function renderCalibrationUI(container, data) {
  const n = data.n || 0;
  const accuracy = data.accuracy ?? 0;
  const ece = data.ece ?? 0;
  const bins = data.bins || [];
  const thresholds = data.thresholds || [];
  const recThreshold = data.recommended_threshold ?? 0.70;

  // Plain-Language Computed Verdict based on actual bin data
  const verdictText = computePlainLanguageVerdict(bins, ece);

  container.innerHTML = `
    <div class="panel-calibration">
      <!-- Header Row -->
      <div class="panel-header-row" style="margin-bottom: var(--space-md); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">USP 04 // SCIENTIFIC RIGOR</div>
          <h2 style="margin-bottom: 4px;">CONFIDENCE REALITY CHECK</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Plot predicted probability against empirical success rate to detect overconfidence.</p>
        </div>
        <span class="badge ${n < 30 ? 'badge-illegal' : 'badge-good'}">
          ${n < 30 ? 'PRELIMINARY SAMPLE' : 'CALIBRATED EVALUATION'}
        </span>
      </div>

      <!-- Small Sample Warning (Active when n < 30) -->
      ${n < 30 ? `
        <div class="sample-warning-banner" role="alert">
          <span style="font-size: 1.3rem;">⚠</span>
          <div>
            <strong>SMALL SAMPLE SIZE WARNING (n = ${n}):</strong> 
            Statistical confidence requires at least 30 observations. The calibration curve below is preliminary and should not be cited as statistically conclusive.
          </div>
        </div>
      ` : ''}

      <!-- Big HUD Stats Row -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-md); margin-bottom: var(--space-lg);">
        <div class="hud-card kpi-card">
          <div class="kpi-label">SAMPLE COUNT (n)</div>
          <div class="kpi-value kpi-val-nowrap" style="color: #fff; white-space: nowrap;">${n} SAMPLES</div>
          <div class="kpi-subtext">
            ${n < 30 ? '<span style="color: var(--amber)">Warning: n &lt; 30</span>' : '<span style="color: var(--neon-green)">Statistically sufficient</span>'}
          </div>
        </div>

        <div class="hud-card kpi-card kpi-card-green">
          <div class="kpi-label" style="color: var(--neon-green);">EMPIRICAL ACCURACY</div>
          <div class="kpi-value kpi-val-nowrap" style="color: var(--neon-green); white-space: nowrap;">
            ${(accuracy * 100).toFixed(1)}% ACC
          </div>
          <div class="kpi-subtext">Successful move ratio</div>
        </div>

        <div class="hud-card kpi-card">
          <div class="kpi-label">CALIBRATION ERROR (ECE)</div>
          <div class="kpi-value kpi-val-nowrap" style="color: ${ece < 0.08 ? 'var(--arcade-yellow, #ffd000)' : 'var(--amber)'}; white-space: nowrap;">
            ${ece.toFixed(3)} ECE
          </div>
          <div class="kpi-subtext">Expected Calibration Error</div>
        </div>

        <div class="hud-card kpi-card kpi-card-red">
          <div class="kpi-label" style="color: var(--neon-magenta, #e52521);">REC. THRESHOLD (τ)</div>
          <div class="kpi-value kpi-val-nowrap" style="color: var(--neon-magenta, #e52521); white-space: nowrap !important;">
            ${(recThreshold * 100).toFixed(0)}% CUTOFF
          </div>
          <div class="kpi-subtext">Optimal confidence threshold</div>
        </div>
      </div>

      <!-- Plain-Language Computed Verdict Box -->
      <div class="calibration-verdict-box hud-card card-magenta">
        <div style="display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 11px; color: var(--neon-magenta); font-weight: 700; margin-bottom: 4px;">
          <span>🔍</span> COMPUTED SCIENTIFIC VERDICT:
        </div>
        <p style="font-size: var(--text-base); color: #fff; margin-bottom: 0; line-height: 1.5;">
          ${verdictText}
        </p>
      </div>

      <!-- Two Column Layout: Reliability Diagram & Thresholds Table -->
      <div style="display: grid; grid-template-columns: 1.25fr 1fr; gap: var(--space-lg); margin-bottom: var(--space-lg);">
        <!-- Reliability Diagram (SVG) -->
        <div class="hud-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-sm);">
            <span style="font-family: var(--font-heading); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: 0.1em;">
              RELIABILITY DIAGRAM (CALIBRATION CURVE)
            </span>
            <span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);">
              BUBBLE RADIUS ∝ SAMPLE COUNT
            </span>
          </div>

          <div class="calibration-diagram-wrapper">
            ${renderReliabilitySvg(bins, n)}
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); margin-top: var(--space-xs);">
            <span>--- Diagonal: Perfect Calibration (y = x)</span>
            <span style="color: var(--neon-cyan);">● Data Bins</span>
          </div>
        </div>

        <!-- Threshold Table (Coverage vs Accuracy) -->
        <div class="hud-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-sm);">
            <span style="font-family: var(--font-heading); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: 0.1em;">
              CONFIDENCE THRESHOLD CUTOFFS
            </span>
          </div>

          <table class="lab-table" aria-label="Confidence threshold trade-off table">
            <thead>
              <tr>
                <th>THRESHOLD (τ)</th>
                <th>COVERAGE</th>
                <th>ACCURACY</th>
              </tr>
            </thead>
            <tbody>
              ${thresholds.map(t => {
                const isRec = recThreshold != null && Math.abs(t.threshold - recThreshold) < 0.04;
                const hasCoverage = t.coverage > 0;
                return `
                  <tr style="${isRec ? 'background: rgba(255, 61, 242, 0.08);' : ''}">
                    <td>
                      <strong style="color: ${isRec ? 'var(--neon-magenta)' : '#fff'};">
                        ${(t.threshold * 100).toFixed(0)}%
                        ${isRec ? '<span class="badge badge-demo" style="margin-left: 4px; font-size: 9px;">REC</span>' : ''}
                      </strong>
                    </td>
                    <td style="color: var(--neon-cyan);">${(t.coverage * 100).toFixed(0)}%</td>
                    <td style="color: ${hasCoverage ? 'var(--neon-green)' : 'var(--text-muted)'}; font-weight: ${hasCoverage ? '700' : '400'};">
                      ${hasCoverage ? (t.accuracy * 100).toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <p style="font-size: 11px; color: var(--text-muted); margin-top: var(--space-sm); margin-bottom: 0;">
            Higher thresholds increase decision accuracy while deferring low-certainty moves to conservative corridors.
          </p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Computes plain-language verdict from bins and ECE.
 */
function computePlainLanguageVerdict(bins, ece) {
  if (!bins || bins.length === 0) {
    return "Insufficient bin data to compute an empirical calibration verdict.";
  }

  // Look for a high confidence bin around 0.8
  const highBin = bins.find(b => b.mean_confidence >= 0.7 && b.mean_confidence <= 0.95) || bins[bins.length - 1];
  const confPct = Math.round((highBin.mean_confidence || 0.8) * 100);
  const accPct = Math.round((highBin.accuracy || 0.75) * 100);

  if (highBin.mean_confidence > (highBin.accuracy + 0.06)) {
    return `"When Laya expresses ${confPct}% confidence, it is right ${accPct}% of the time: the model exhibits mild domain overconfidence (ECE: ${ece.toFixed(3)})."`;
  } else if (Math.abs(highBin.mean_confidence - highBin.accuracy) <= 0.06) {
    return `"When Laya expresses ${confPct}% confidence, it is right ${accPct}% of the time: well-calibrated alignment between probabilities and game outcomes."`;
  } else {
    return `"When Laya expresses ${confPct}% confidence, it is right ${accPct}% of the time: the model is conservative / underconfident relative to empirical survival."`;
  }
}

/**
 * Renders pure SVG reliability diagram.
 */
function renderReliabilitySvg(bins, totalN) {
  const size = 320;
  const padding = 35;
  const plotSize = size - padding * 2;

  // Generate grid lines
  const gridLines = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map(v => {
    const pos = padding + v * plotSize;
    const invPos = size - padding - v * plotSize;
    return `
      <!-- Horizontal -->
      <line x1="${padding}" y1="${invPos}" x2="${size - padding}" y2="${invPos}" stroke="rgba(34,230,255,0.1)" stroke-width="1" />
      <text x="${padding - 8}" y="${invPos + 4}" fill="#626f94" font-family="JetBrains Mono" font-size="9" text-anchor="end">${(v * 100).toFixed(0)}%</text>
      <!-- Vertical -->
      <line x1="${pos}" y1="${padding}" x2="${pos}" y2="${size - padding}" stroke="rgba(34,230,255,0.1)" stroke-width="1" />
      <text x="${pos}" y="${size - padding + 14}" fill="#626f94" font-family="JetBrains Mono" font-size="9" text-anchor="middle">${(v * 100).toFixed(0)}%</text>
    `;
  }).join('');

  // Filter only bins that have empirical observations (n > 0)
  const activeBins = (bins || []).filter(b => (b.n || 0) > 0);

  // Generate points and path for observed bins
  const points = activeBins.map(b => {
    const conf = b.mean_confidence !== undefined ? b.mean_confidence : (b.lo + b.hi) / 2;
    const x = padding + conf * plotSize;
    const y = size - padding - (b.accuracy || 0) * plotSize;
    const radius = Math.max(6, Math.min(20, ((b.n || 1) / Math.max(1, totalN)) * 36));
    return { x, y, radius, b };
  });

  const pathD = points.length > 1 
    ? `M ${points.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}` 
    : '';

  const bubbles = points.map(p => `
    <circle cx="${p.x}" cy="${p.y}" r="${p.radius}" fill="rgba(34, 230, 255, 0.35)" stroke="#22e6ff" stroke-width="2">
      <title>Bin [${p.b.lo}-${p.b.hi}]: Conf ${(p.b.mean_confidence*100).toFixed(0)}%, Acc ${(p.b.accuracy*100).toFixed(0)}%, n=${p.b.n}</title>
    </circle>
    <circle cx="${p.x}" cy="${p.y}" r="3" fill="#fff" />
  `).join('');

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="Reliability diagram">
      <!-- Grid -->
      ${gridLines}

      <!-- Diagonal Perfect Calibration (y = x) -->
      <line x1="${padding}" y1="${size - padding}" x2="${size - padding}" y2="${padding}" stroke="#ff3df2" stroke-width="2" stroke-dasharray="4 4" opacity="0.6">
        <title>Perfect Calibration (y = x)</title>
      </line>

      <!-- Connecting Curve -->
      ${pathD ? `<path d="${pathD}" fill="none" stroke="#22e6ff" stroke-width="2" opacity="0.8" />` : ''}

      <!-- Bubbles sized by sample count -->
      ${bubbles}

      <!-- Axis Labels -->
      <text x="${size / 2}" y="${size - 4}" fill="#9da9cb" font-family="Rajdhani" font-size="11" font-weight="700" text-anchor="middle">
        CONFIDENCE →
      </text>
      <text x="12" y="${size / 2}" fill="#9da9cb" font-family="Rajdhani" font-size="11" font-weight="700" text-anchor="middle" transform="rotate(-90 12 ${size / 2})">
        ACCURACY →
      </text>
    </svg>
  `;
}
