/**
 * ==========================================================================
 * QUESTION LAB PANEL PLACEHOLDER (panels/lab.js)
 * USP 2: A/B testing question formulations on identical seeds.
 * ==========================================================================
 */

export function mount(container) {
  container.innerHTML = `
    <div class="panel-lab">
      <div class="panel-header-row" style="margin-bottom: var(--space-lg); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">USP 02 // EMPIRICAL BENCHMARKS</div>
          <h2 style="margin-bottom: 4px;">QUESTION LAB</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Compare perception-first formulations against direct-action controls on identical seeds.</p>
        </div>
        <span class="badge badge-demo">A/B EXPERIMENT DATA</span>
      </div>

      <div class="hud-card card-magenta" style="min-height: 380px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
        <div style="font-size: 2.2rem; margin-bottom: var(--space-xs); color: var(--neon-magenta);">🧪</div>
        <h3 style="color: #fff; margin-bottom: var(--space-xs);">QUESTION LAB SUITE READY</h3>
        <p style="color: var(--text-secondary); max-width: 540px; margin-bottom: var(--space-md);">
          Variant comparison matrices, delta charts, completion rates, and latency comparisons will mount here in Prompt 5.
        </p>
        <span class="chip chip-active">Endpoint /api/lab Ready</span>
      </div>
    </div>
  `;
}

export function unmount() {}
