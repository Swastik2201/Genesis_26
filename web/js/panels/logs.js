/**
 * ==========================================================================
 * BEAT THE BOT — LIVE LOGS VIEWER (panels/logs.js)
 * High-frequency monospace telemetry terminal with live-tailing,
 * multi-criteria outcome filters, regex/text search, pause/resume lock,
 * and immutable .jsonl session export.
 * ==========================================================================
 */

import { store } from '../store.js';
import * as api from '../api.js';

let unsubscribe = null;
let isTailPaused = false;
let currentFilter = 'all'; // 'all' | 'good' | 'miss' | 'illegal' | 'over'
let searchQuery = '';
let terminalEl = null;
let virtualScrollHandler = null;
let currentFilteredEvents = [];

export async function mount(container, params = {}) {
  const state = store.getState();
  let sessionId = params.session || state.currentSession;

  if (!sessionId || sessionId === 'latest') {
    try {
      const health = await api.health();
      sessionId = health.latest_session_id || 'demo-runner-20261013-001';
    } catch (e) {
      sessionId = 'demo-runner-20261013-001';
    }
  }

  let allRunsList = [];
  try {
    const runsRes = await api.runs();
    allRunsList = runsRes?.runs || [];
  } catch (e) {}

  // Render Skeleton Shell
  container.innerHTML = `
    <div class="panel-logs">
      <div class="panel-header-row" style="margin-bottom: var(--space-md); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">TELEMETRY // AUDIT STREAM</div>
          <h2 style="margin-bottom: 4px;">SYSTEM &amp; RUN LOGS</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Immutable, single-line telemetry records for every decision step.</p>
        </div>
        <div style="display: flex; gap: var(--space-sm); align-items: center; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <label for="logs-session-selector" style="font-size: 11px; font-weight: 700; color: #a855f7;">SESSION:</label>
            <select id="logs-session-selector" style="background: #0f172a; border: 1px solid rgba(168, 85, 247, 0.4); color: #fff; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 11px; max-width: 260px;">
              ${allRunsList.map(r => `
                <option value="${r.session_id}" ${r.session_id === sessionId ? 'selected' : ''}>
                  [${(r.game_id || 'game').toUpperCase()}] ${r.session_id.slice(0, 16)}... (${r.steps} steps)
                </option>
              `).join('')}
            </select>
          </div>
          <button id="btn-toggle-tail" class="btn btn-secondary btn-sm" title="Toggle autoscroll to new events">
            <span id="tail-status-indicator" class="pulse-indicator" style="background: var(--neon-green);"></span>
            <span id="tail-btn-label">TAIL: ACTIVE</span>
          </button>
          <a href="${api.downloadUrl(sessionId)}" download="${sessionId}.jsonl" id="btn-download-jsonl" class="btn btn-primary btn-sm" title="Download session as .jsonl" style="text-decoration: none;">
            <span>⤓ DOWNLOAD .JSONL</span>
          </a>
        </div>
      </div>

      <!-- Filter & Search Toolbar -->
      <div class="log-toolbar">
        <div style="display: flex; gap: var(--space-xs); align-items: center; flex-wrap: wrap;">
          <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-right: 4px;">OUTCOME:</span>
          <button class="chip chip-sm log-filter-chip ${currentFilter === 'all' ? 'chip-active' : ''}" data-filter="all">ALL</button>
          <button class="chip chip-sm log-filter-chip ${currentFilter === 'good' ? 'chip-active' : ''}" data-filter="good">GOOD (+PTS)</button>
          <button class="chip chip-sm log-filter-chip ${currentFilter === 'miss' ? 'chip-active' : ''}" data-filter="miss">PENALTY / MISS</button>
          <button class="chip chip-sm log-filter-chip ${currentFilter === 'illegal' ? 'chip-active' : ''}" data-filter="illegal">EXCLUSIONS</button>
          <button class="chip chip-sm log-filter-chip ${currentFilter === 'over' ? 'chip-active' : ''}" data-filter="over">GAME OVER</button>
        </div>

        <div style="display: flex; gap: var(--space-sm); align-items: center;">
          <input 
            type="search" 
            id="log-search-input" 
            class="log-search-input" 
            placeholder="Search action, step, note..." 
            value="${searchQuery}"
            autocomplete="off"
            spellcheck="false"
          />
          <span id="log-count-indicator" style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); white-space: nowrap;">
            0 events
          </span>
        </div>
      </div>

      <!-- Terminal Container -->
      <div class="log-terminal-wrapper" style="position: relative;">
        <!-- Terminal Column Headers -->
        <div class="log-terminal-header">
          <div class="log-col-time">TIMESTAMP</div>
          <div class="log-col-step">STEP</div>
          <div class="log-col-action">ACTION</div>
          <div class="log-col-prob">CONF / PROB</div>
          <div class="log-col-outcome">OUTCOME / RESULT</div>
        </div>

        <!-- Scrollable Log Stream -->
        <div id="log-stream-terminal" class="log-terminal" role="region" aria-label="Live logs terminal">
          <div style="padding: var(--space-xl); text-align: center; color: var(--text-muted); font-family: var(--font-mono);">
            Loading log events for ${sessionId}...
          </div>
        </div>

        <!-- Jump to Bottom floating chip when scrolled up -->
        <button id="btn-jump-bottom" class="log-jump-pill" style="display: none;">
          ⬇ Jump to latest event
        </button>
      </div>

      <!-- Footer Info -->
      <div style="margin-top: var(--space-sm); display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">
        <div>SESSION: <span style="color: var(--neon-cyan);">${sessionId}</span></div>
        <div>FORMAT: <span style="color: #fff;">1 EVENT PER LINE (NDJSON/JSONL)</span></div>
      </div>
    </div>
  `;

  terminalEl = container.querySelector('#log-stream-terminal');

  // Load events
  let events = [];
  try {
    const evRes = await api.events(sessionId, 0, 1000);
    events = evRes?.events || (Array.isArray(evRes) ? evRes : []);
    store.setEvents(events);
  } catch (e) {
    console.warn('[Logs] Falling back to state events:', e);
    events = state.events || [];
  }

  // Session selector binding
  const sessionSelector = container.querySelector('#logs-session-selector');
  if (sessionSelector) {
    sessionSelector.addEventListener('change', (e) => {
      const newSid = e.target.value;
      store.setState({ currentSession: newSid });
      mount(container, { session: newSid });
    });
  }

  // Setup Event Listeners
  setupEventListeners(container);

  // Render initial logs
  renderLogLines();

  // Subscribe to store updates for real-time live events streaming
  unsubscribe = store.subscribe((newState) => {
    if (newState.events && newState.events.length !== (events ? events.length : 0)) {
      events = newState.events;
      renderLogLines();
      if (!isTailPaused && terminalEl) {
        scrollToBottom();
      }
    }
  });

  // Initial scroll to bottom if tail is active
  if (!isTailPaused) {
    scrollToBottom();
  }
}

export function unmount() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (virtualScrollHandler && terminalEl) {
    terminalEl.removeEventListener('scroll', virtualScrollHandler);
    virtualScrollHandler = null;
  }
  terminalEl = null;
  currentFilteredEvents = [];
}

function setupEventListeners(container) {
  // 1. Toggle Tail / Pause Button
  const toggleBtn = container.querySelector('#btn-toggle-tail');
  const tailIndicator = container.querySelector('#tail-status-indicator');
  const tailLabel = container.querySelector('#tail-btn-label');
  const jumpBtn = container.querySelector('#btn-jump-bottom');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      isTailPaused = !isTailPaused;
      updateTailUI();
      if (!isTailPaused) {
        scrollToBottom();
      }
    });
  }

  // 2. Jump to Bottom
  if (jumpBtn) {
    jumpBtn.addEventListener('click', () => {
      isTailPaused = false;
      updateTailUI();
      scrollToBottom();
    });
  }

  // 3. User manual scroll detector
  if (terminalEl) {
    terminalEl.addEventListener('scroll', () => {
      const isAtBottom = terminalEl.scrollHeight - terminalEl.scrollTop - terminalEl.clientHeight <= 25;
      if (!isAtBottom) {
        if (!isTailPaused) {
          isTailPaused = true;
          updateTailUI();
        }
        if (jumpBtn) jumpBtn.style.display = 'flex';
      } else {
        if (jumpBtn) jumpBtn.style.display = 'none';
      }
    });
  }

  // 4. Download .jsonl
  const downloadBtn = container.querySelector('#btn-download-jsonl');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      downloadSessionJsonl();
    });
  }

  // 5. Search Query Input
  const searchInput = container.querySelector('#log-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderLogLines();
    });
  }

  // 6. Outcome Filter Chips
  const filterChips = container.querySelectorAll('.log-filter-chip');
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('chip-active'));
      chip.classList.add('chip-active');
      currentFilter = chip.dataset.filter;
      renderLogLines();
    });
  });

  function updateTailUI() {
    if (tailIndicator && tailLabel) {
      if (isTailPaused) {
        tailIndicator.style.background = 'var(--amber)';
        tailLabel.textContent = 'TAIL: PAUSED';
        if (toggleBtn) toggleBtn.classList.add('btn-warning');
      } else {
        tailIndicator.style.background = 'var(--neon-green)';
        tailLabel.textContent = 'TAIL: ACTIVE';
        if (toggleBtn) toggleBtn.classList.remove('btn-warning');
        if (jumpBtn) jumpBtn.style.display = 'none';
      }
    }
  }
}

function renderLogLines() {
  if (!terminalEl) return;
  const state = store.getState();
  const allEvents = state.events || [];

  // Filter events
  const filtered = allEvents.filter(ev => {
    // Outcome category filter
    if (currentFilter === 'good') {
      const isGood = ev.game_response?.good === true || (ev.game_response?.score_after > ev.game_response?.score_before);
      if (!isGood) return false;
    } else if (currentFilter === 'miss') {
      const isMiss = ev.game_response?.good === false || (ev.game_response?.score_after <= ev.game_response?.score_before);
      if (!isMiss) return false;
    } else if (currentFilter === 'illegal') {
      const hasExclusion = (ev.validator?.rejections && ev.validator.rejections.length > 0) ||
                           ev.laya_calls?.some(c => c.excluded);
      if (!hasExclusion) return false;
    } else if (currentFilter === 'over') {
      if (!ev.state?.done && !ev.game_response?.done) return false;
    }

    // Text Search filter
    if (searchQuery) {
      const stepStr = `step ${ev.step} ${ev.step}`.toLowerCase();
      const actionStr = (ev.final_action || '').toLowerCase();
      const outcomeStr = (ev.outcome || ev.game_response?.message || '').toLowerCase();
      const stateStr = (ev.state?.state_text || '').toLowerCase();
      if (!stepStr.includes(searchQuery) &&
          !actionStr.includes(searchQuery) &&
          !outcomeStr.includes(searchQuery) &&
          !stateStr.includes(searchQuery)) {
        return false;
      }
    }

    return true;
  });

  // Update count indicator
  const countEl = document.getElementById('log-count-indicator');
  if (countEl) {
    countEl.textContent = `Showing ${filtered.length} of ${allEvents.length} events`;
  }

  if (filtered.length === 0) {
    terminalEl.innerHTML = `
      <div style="padding: var(--space-2xl); text-align: center; color: var(--text-muted); font-family: var(--font-mono);">
        <div style="font-size: 1.5rem; margin-bottom: var(--space-xs);">🔍</div>
        <div>No matching events found for current filters.</div>
      </div>
    `;
    return;
  }

  currentFilteredEvents = filtered;

  if (filtered.length > 500) {
    renderVirtualizedLogLines();
  } else {
    // Normal rendering for standard lengths
    renderStandardLogLines(filtered);
  }
}

function renderStandardLogLines(filtered) {
  const linesHtml = filtered.map(ev => renderSingleLogLineHtml(ev)).join('');
  terminalEl.innerHTML = linesHtml;
  bindLogLineClickListeners(terminalEl);
}

function renderVirtualizedLogLines() {
  const ROW_HEIGHT = 28;
  const totalHeight = currentFilteredEvents.length * ROW_HEIGHT;
  const scrollTop = terminalEl.scrollTop;
  const viewportHeight = terminalEl.clientHeight || 500;
  
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT);
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 15);
  const endIndex = Math.min(currentFilteredEvents.length, startIndex + visibleCount + 30);
  
  const slice = currentFilteredEvents.slice(startIndex, endIndex);
  const sliceHtml = slice.map(ev => renderSingleLogLineHtml(ev)).join('');

  terminalEl.innerHTML = `
    <div class="virtual-scroll-spacer" style="height: ${totalHeight}px; position: relative;">
      <div class="virtual-scroll-content" style="position: absolute; top: ${startIndex * ROW_HEIGHT}px; left: 0; right: 0;">
        ${sliceHtml}
      </div>
    </div>
  `;

  bindLogLineClickListeners(terminalEl);

  // Attach rAF-throttled scroll listener if not already attached
  if (!virtualScrollHandler) {
    let ticking = false;
    virtualScrollHandler = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (currentFilteredEvents.length > 500 && terminalEl) {
            renderVirtualizedLogLines();
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    terminalEl.addEventListener('scroll', virtualScrollHandler);
  }
}

function renderSingleLogLineHtml(ev) {
  const tsStr = formatTime(ev.ts);
  const stepLabel = `S${String(ev.step).padStart(2, '0')}`;
  const actionLabel = ev.final_action || 'none';

  const primaryCall = ev.laya_calls?.[0];
  let prob = null;
  if (primaryCall) {
    if (primaryCall.action_scores && primaryCall.action_scores[ev.final_action] !== undefined) {
      prob = primaryCall.action_scores[ev.final_action];
    } else if (primaryCall.raw?.probabilities) {
      prob = Math.max(...primaryCall.raw.probabilities);
    }
  }
  const probStr = prob !== null ? `${(prob * 100).toFixed(1)}%` : '--';

  const hasRejection = (ev.validator?.rejections && ev.validator.rejections.length > 0) ||
                       ev.laya_calls?.some(c => c.excluded);
  const isGood = ev.game_response?.good === true;
  const isGameOver = ev.state?.done || ev.game_response?.done;
  
  let outcomeClass = 'outcome-neutral';
  let outcomePrefix = 'ℹ ';
  if (isGameOver) {
    outcomeClass = 'outcome-gameover';
    outcomePrefix = '🏁 ';
  } else if (hasRejection) {
    outcomeClass = 'outcome-rejection';
    outcomePrefix = '⚠ RETRIED: ';
  } else if (isGood) {
    outcomeClass = 'outcome-good';
    outcomePrefix = '✓ ';
  } else {
    outcomeClass = 'outcome-miss';
    outcomePrefix = '✗ ';
  }

  const outcomeText = ev.outcome || ev.game_response?.message || 'Action executed';

  return `
    <div class="log-line" data-step="${ev.step}" title="Click to inspect decision step ${ev.step} in Replay">
      <span class="log-col-time log-time">${tsStr}</span>
      <span class="log-col-step log-step">${stepLabel}</span>
      <span class="log-col-action log-action">
        <span class="action-tag">${actionLabel}</span>
      </span>
      <span class="log-col-prob log-prob">${probStr}</span>
      <span class="log-col-outcome log-outcome ${outcomeClass}">
        ${outcomePrefix}${outcomeText}
      </span>
    </div>
  `;
}

function bindLogLineClickListeners(container) {
  container.querySelectorAll('.log-line').forEach(line => {
    line.addEventListener('click', () => {
      const step = line.dataset.step;
      const state = store.getState();
      const sessionId = state.currentSession || 'demo-runner-20261013-001';
      window.location.hash = `#/replay?session=${sessionId}&step=${step}`;
    });
  });
}

function scrollToBottom() {
  if (terminalEl) {
    terminalEl.scrollTop = terminalEl.scrollHeight;
  }
}

function formatTime(isoStr) {
  if (!isoStr) return '--:--:--';
  try {
    const d = new Date(isoStr);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    const ms = String(d.getUTCMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  } catch {
    return isoStr.slice(11, 23) || isoStr;
  }
}

function downloadSessionJsonl() {
  const state = store.getState();
  const sessionId = state.currentSession || 'session-telemetry';
  const events = state.events || [];

  if (events.length === 0) {
    alert('No events loaded in current session to export.');
    return;
  }

  // Format as strict NDJSON / JSONL
  const jsonlContent = events.map(e => JSON.stringify(e)).join('\n') + '\n';
  const blob = new Blob([jsonlContent], { type: 'application/x-ndjson;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sessionId}.jsonl`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
