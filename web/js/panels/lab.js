/**
 * ==========================================================================
 * BEAT THE BOT — QUESTION LAB PANEL (panels/lab.js)
 * USP 2: Question Lab — A/B benchmark comparing question formulations on identical seeds.
 * Leaderboard, Crown Winner, Plain SVG Metric Charts, and Replay links.
 * ==========================================================================
 */

import * as api from '../api.js';

let selectedVariant = null;

export async function mount(container) {
  container.innerHTML = `
    <div class="panel-lab">
      <div class="panel-header-row" style="margin-bottom: var(--space-md); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">USP 02 // QUESTION LAB EXPERIMENTS</div>
          <h2 style="margin-bottom: 4px;">QUESTION LAB</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Scientific A/B comparison of question formulations on identical game seeds.</p>
        </div>
      </div>
      <div class="hud-card" style="text-align: center; padding: var(--space-2xl);">
        <div style="font-size: 2.2rem; color: var(--neon-magenta); margin-bottom: var(--space-sm); animation: pulseDot 1.4s infinite;">🧪</div>
        <p style="color: var(--text-secondary);">Loading Question Lab experiment benchmarks...</p>
      </div>
    </div>
  `;

  try {
    const experiments = await api.lab();
    const activeExperiment = experiments[0] || {
      name: "mock_runner_perception_vs_direct_v1",
      variants: []
    };

    renderLabUI(container, activeExperiment, experiments);
  } catch (err) {
    console.error('[Question Lab] Failed to load lab results:', err);
    container.innerHTML = `
      <div class="hud-card" style="border-color: var(--red); padding: var(--space-xl); text-align: center;">
        <h3 style="color: var(--red);">FAILED TO LOAD LAB RESULTS</h3>
        <p style="color: var(--text-secondary);">${err.message}</p>
        <button id="btn-retry-lab" class="btn btn-primary btn-sm">RETRY</button>
      </div>
    `;
    const btn = container.querySelector('#btn-retry-lab');
    if (btn) btn.addEventListener('click', () => mount(container));
  }
}

export function unmount() {
  selectedVariant = null;
}

function renderLabUI(container, currentExp, allExps) {
  const variants = [...(currentExp.variants || [])];
  
  // Rank variants by avg_score descending to find winner
  variants.sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0));
  const winner = variants[0];
  if (!selectedVariant && variants.length > 0) {
    selectedVariant = winner;
  }

  container.innerHTML = `
    <div class="panel-lab">
      <!-- Title Row -->
      <div class="panel-header-row" style="margin-bottom: var(--space-md); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">USP 02 // QUESTION LAB EXPERIMENTS</div>
          <h2 style="margin-bottom: 4px;">QUESTION LAB</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Scientific A/B comparison of question formulations on identical game seeds.</p>
        </div>

        <div style="display: flex; gap: var(--space-sm); align-items: center;">
          <label style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">EXPERIMENT:</label>
          <select id="lab-experiment-select" class="session-select-input" style="width: auto;">
            ${allExps.map(exp => `
              <option value="${exp.name}" ${exp.name === currentExp.name ? 'selected' : ''}>${exp.name}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <!-- Explainer Banner -->
      <div class="lab-explainer-banner">
        <div style="font-size: 2rem; color: var(--neon-magenta);" aria-hidden="true">💡</div>
        <div>
          <div style="font-family: var(--font-heading); font-size: var(--text-sm); font-weight: 800; color: #fff; margin-bottom: 2px;">
            "SAME GAME, SAME SEEDS, DIFFERENT WORDING"
          </div>
          <p style="font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 0; line-height: 1.4;">
            We keep the game mechanics, random seeds, and normalizer identical, varying solely how the question is typed and presented to Laya. 
            This measures whether perception-first questions outperform direct action prompting.
          </p>
        </div>
      </div>

      <!-- 1. Leaderboard Table -->
      <div class="hud-card" style="margin-bottom: var(--space-lg);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-sm);">
          <span style="font-family: var(--font-heading); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: 0.1em;">
            VARIANT LEADERBOARD (${variants.length} TESTED CONFIGURATIONS)
          </span>
          <span class="badge badge-cyan">CLICK ROW TO INSPECT SESSIONS</span>
        </div>

        <div class="lab-table-container">
          <table class="lab-table" aria-label="Question Lab variant leaderboard">
            <thead>
              <tr>
                <th>RANK</th>
                <th>QUESTION SET</th>
                <th>GAMES</th>
                <th>AVG SCORE</th>
                <th>BEST SCORE</th>
                <th>INVALID RATE</th>
                <th>AVG LATENCY</th>
                <th>COMPLETION</th>
                <th>AVG CONFIDENCE</th>
              </tr>
            </thead>
            <tbody>
              ${variants.map((v, idx) => {
                const isWinner = v.question_set === winner.question_set;
                const isSelected = selectedVariant && selectedVariant.question_set === v.question_set;
                return `
                  <tr class="${isWinner ? 'winner-row' : ''} ${isSelected ? 'selected-row' : ''}" data-qset="${v.question_set}" style="cursor: pointer;">
                    <td>
                      ${isWinner ? '<span class="crown-badge">👑 #1</span>' : `#${idx + 1}`}
                    </td>
                    <td>
                      <strong style="color: ${isWinner ? 'var(--neon-green)' : '#fff'}; font-family: var(--font-heading);">
                        ${v.question_set}
                      </strong>
                    </td>
                    <td>${v.games}</td>
                    <td style="color: var(--neon-cyan); font-weight: 700;">${v.avg_score.toFixed(0)}</td>
                    <td style="color: var(--neon-green); font-weight: 700;">${v.best_score.toFixed(0)}</td>
                    <td style="color: ${v.invalid_rate > 0.05 ? 'var(--amber)' : 'var(--text-secondary)'};">
                      ${(v.invalid_rate * 100).toFixed(1)}%
                    </td>
                    <td>${v.avg_latency_ms.toFixed(1)} ms</td>
                    <td>${(v.completion_rate * 100).toFixed(0)}%</td>
                    <td style="color: var(--neon-magenta); font-weight: 700;">${(v.avg_confidence * 100).toFixed(0)}%</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 2. Plain SVG Metric Charts Grid (No external libs) -->
      <div class="charts-grid">
        <div class="chart-card">
          <div class="chart-card-title">AVERAGE SCORE COMPARISON (PTS)</div>
          ${renderSvgBarChart(variants, 'avg_score', 'pts', 'var(--neon-cyan)')}
        </div>

        <div class="chart-card">
          <div class="chart-card-title">COMPLETION RATE (%)</div>
          ${renderSvgBarChart(variants, 'completion_rate', '%', 'var(--neon-green)', 100)}
        </div>

        <div class="chart-card">
          <div class="chart-card-title">INVALID MOVE RATE (%) — LOWER IS BETTER</div>
          ${renderSvgBarChart(variants, 'invalid_rate', '%', 'var(--amber)', 100)}
        </div>

        <div class="chart-card">
          <div class="chart-card-title">AVERAGE LATENCY (MS)</div>
          ${renderSvgBarChart(variants, 'avg_latency_ms', 'ms', 'var(--neon-magenta)')}
        </div>
      </div>

      <!-- 3. Selected Variant Detail Drawer -->
      <div id="variant-detail-box" class="hud-card card-magenta">
        <!-- Rendered by renderVariantDetail() -->
      </div>
    </div>
  `;

  // Bind experiment selector
  const expSelect = container.querySelector('#lab-experiment-select');
  if (expSelect) {
    expSelect.addEventListener('change', (e) => {
      const selectedExp = allExps.find(x => x.name === e.target.value);
      if (selectedExp) {
        selectedVariant = null;
        renderLabUI(container, selectedExp, allExps);
      }
    });
  }

  // Bind row clicks
  container.querySelectorAll('.lab-table tr[data-qset]').forEach(row => {
    row.addEventListener('click', () => {
      const qset = row.getAttribute('data-qset');
      selectedVariant = variants.find(v => v.question_set === qset) || variants[0];
      renderVariantDetail(container);
    });
  });

  renderVariantDetail(container);
}

/**
 * Renders the detail drawer for the currently selected variant.
 */
function renderVariantDetail(container) {
  const box = container.querySelector('#variant-detail-box');
  if (!box || !selectedVariant) return;

  const v = selectedVariant;
  const sessions = v.session_ids || [];

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--space-md); margin-bottom: var(--space-md);">
      <div>
        <span class="badge badge-magenta" style="margin-bottom: 4px;">SELECTED VARIANT DETAILS</span>
        <h3 style="font-size: var(--text-lg); color: #fff; margin-bottom: 2px;">${v.question_set}</h3>
        <p style="font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: 0;">
          ${v.description || 'Custom formulation tested under deterministic seeds.'}
        </p>
      </div>

      <div style="display: flex; gap: var(--space-sm);">
        <span class="badge badge-good">AVG SCORE: ${v.avg_score.toFixed(0)}</span>
        <span class="badge badge-cyan">CONFIDENCE: ${(v.avg_confidence * 100).toFixed(0)}%</span>
      </div>
    </div>

    <!-- Question Text Banner -->
    <div style="background: rgba(7, 6, 15, 0.7); border: 1px solid var(--border-subtle); border-radius: var(--radius-xs); padding: var(--space-md); margin-bottom: var(--space-md);">
      <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">
        EXACT TYPED QUESTION PROMPT TO LAYA:
      </div>
      <div style="font-family: var(--font-mono); font-size: var(--text-sm); color: var(--neon-cyan); font-weight: 600;">
        "${v.question_text || 'Which action should we take?'}"
      </div>
    </div>

    <!-- Replay Sessions List -->
    <div>
      <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">
        ASSOCIATED BENCHMARK RUN SESSIONS (${sessions.length}):
      </div>
      <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
        ${sessions.length > 0 ? sessions.map(sId => `
          <a href="#/replay?session=${encodeURIComponent(sId)}" class="chip chip-active" style="padding: 6px 12px; gap: 8px;" aria-label="Open session in replay">
            <span>📼 ${sId}</span>
            <span style="font-size: 10px; color: var(--neon-cyan);">OPEN REPLAY ➔</span>
          </a>
        `).join('') : `
          <span style="color: var(--text-muted); font-size: var(--text-xs); font-family: var(--font-mono);">
            No explicit session recordings archived for this benchmark set.
          </span>
        `}
      </div>
    </div>
  `;
}

/**
 * Generates plain inline SVG horizontal bar charts without external libraries.
 */
function renderSvgBarChart(variants, key, unit, color, multiplier = 1) {
  const maxVal = Math.max(...variants.map(v => (v[key] || 0) * multiplier), 1);
  const rowHeight = 36;
  const chartHeight = variants.length * rowHeight + 10;
  const chartWidth = 320;
  const barMaxW = 180;

  const bars = variants.map((v, i) => {
    const val = (v[key] || 0) * multiplier;
    const barW = Math.max(4, (val / maxVal) * barMaxW);
    const y = i * rowHeight + 10;
    const displayVal = multiplier === 100 ? `${val.toFixed(1)}%` : `${val.toFixed(0)} ${unit}`;

    return `
      <g>
        <text x="0" y="${y + 14}" fill="#9da9cb" font-family="Rajdhani" font-size="12" font-weight="600">
          ${v.question_set.length > 14 ? v.question_set.slice(0, 13) + '…' : v.question_set}
        </text>
        <rect x="105" y="${y}" width="${barW}" height="18" fill="${color}" rx="2" opacity="0.85">
          <title>${v.question_set}: ${displayVal}</title>
        </rect>
        <text x="${110 + barW + 8}" y="${y + 14}" fill="#ffffff" font-family="JetBrains Mono" font-size="11" font-weight="700">
          ${displayVal}
        </text>
      </g>
    `;
  }).join('');

  return `
    <svg width="100%" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}" preserveAspectRatio="xMinYMin meet" aria-hidden="true">
      ${bars}
    </svg>
  `;
}
