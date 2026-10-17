/**
 * ==========================================================================
 * LAYAMIND — API CLIENT & STREAMING DATA LAYER (api.js)
 * Implements HTTP API contract per AGENTS.md section 5.7 with automatic
 * resilient fallback to web/mock/ data when offline or server unreachable.
 * ==========================================================================
 */

import { store } from './store.js';

const urlParams = new URLSearchParams(window.location.search);
let isMockMode = urlParams.get('mock') === '1' || urlParams.get('mock') === 'true';

// Inform store initially if URL forces mock
if (isMockMode) {
  store.setMockMode(true);
}

/**
 * Determines whether mock mode is currently engaged.
 */
export function isMock() {
  return isMockMode;
}

/**
 * Explicitly forces mock mode on or off.
 */
export function setMockMode(active) {
  isMockMode = Boolean(active);
  store.setMockMode(isMockMode);
}

/**
 * Robust fetch wrapper that falls back to static JSON in web/mock/ on failure.
 */
async function apiFetch(endpoint, mockFile) {
  if (isMockMode) {
    return fetchMock(mockFile);
  }

  try {
    const res = await fetch(endpoint);
    if (!res.ok) {
      // If server returns error, switch to mock fallback
      console.warn(`[API] Endpoint ${endpoint} returned ${res.status}. Falling back to mock.`);
      activateMockMode();
      return fetchMock(mockFile);
    }
    return await res.json();
  } catch (err) {
    console.warn(`[API] Network failure on ${endpoint}. Engaging automatic Mock Mode:`, err.message);
    activateMockMode();
    return fetchMock(mockFile);
  }
}

async function fetchMock(mockFile) {
  const mockPath = `mock/${mockFile}`;
  try {
    const res = await fetch(mockPath);
    if (!res.ok) throw new Error(`Failed to load ${mockPath}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error(`[API Mock] Error loading ${mockPath}:`, err);
    throw err;
  }
}

function activateMockMode() {
  if (!isMockMode) {
    isMockMode = true;
    store.setMockMode(true);
  }
}

// --- API Functions per AGENTS.md Section 5.7 ---

/**
 * Service status, log availability, and last-event freshness.
 */
export async function health() {
  if (isMockMode) {
    return {
      status: "ok",
      mode: "mock_demo",
      service: "LayaMind Mock Layer",
      log_available: true,
      freshness_seconds: 0
    };
  }
  return apiFetch('/api/health', 'runs.sample.json').then(data => {
    return data.status ? data : { status: "ok", mode: "live" };
  });
}

/**
 * Available sessions and summaries.
 */
export async function runs() {
  const data = await apiFetch('/api/runs', 'runs.sample.json');
  return data.runs || (Array.isArray(data) ? data : []);
}

/**
 * Ordered event page for a session.
 */
export async function events(id, from = 0, limit = 2500) {
  if (isMockMode) {
    const all = await fetchMock('events.sample.json');
    const filtered = all.filter(e => !id || e.session_id === id || id === 'latest');
    const target = filtered.length > 0 ? filtered : all;
    const page = target.slice(from, from + limit);
    return {
      session_id: id || target[0]?.session_id || 'demo-runner-20261013-001',
      from,
      limit,
      total_events: target.length,
      events: page
    };
  }

  const endpoint = `/api/runs/${encodeURIComponent(id)}/events?from=${from}&limit=${limit}`;
  return apiFetch(endpoint, 'events.sample.json');
}

/**
 * Exact single event at a given step.
 */
export async function event(id, step) {
  const stepNum = Number(step);
  if (isMockMode) {
    const all = await fetchMock('events.sample.json');
    const ev = all.find(e => e.step === stepNum) || all[0];
    return { event: ev, step: stepNum, session_id: id };
  }

  const endpoint = `/api/runs/${encodeURIComponent(id)}/events/${stepNum}`;
  return apiFetch(endpoint, 'events.sample.json');
}

/**
 * Cryptographic SHA-256 verification and move-to-call audit metrics.
 */
export async function verify(id) {
  if (isMockMode) {
    return {
      session_id: id,
      sha256: "4b9e25d8863f6a25b180746e01a1d1d8ef35b6df926c89178adad319de8d98e1",
      summary_sha256: "4b9e25d8863f6a25b180746e01a1d1d8ef35b6df926c89178adad319de8d98e1",
      hash_matches_summary: true,
      event_count: 40,
      laya_call_count: 42,
      steps_contiguous: true,
      every_move_logged: true,
      audit_passed: true,
      verified_label: "DEMO VERIFIED (MOCK)"
    };
  }
  return apiFetch(`/api/runs/${encodeURIComponent(id)}/verify`, 'runs.sample.json');
}

/**
 * Decision Autopsy items for a given run.
 */
export async function autopsy(id) {
  const endpoint = id ? `/api/runs/${encodeURIComponent(id)}/autopsy` : '/api/runs/latest/autopsy';
  return apiFetch(endpoint, 'autopsy.sample.json');
}

/**
 * Calibration result (single run or aggregate).
 */
export async function calibration(id = null) {
  const endpoint = id ? `/api/runs/${encodeURIComponent(id)}/calibration` : '/api/calibration';
  return apiFetch(endpoint, 'calibration.sample.json');
}

/**
 * Validated Question Lab result files.
 */
export async function lab() {
  const data = await apiFetch('/api/lab', 'lab.sample.json');
  return data.experiments || (Array.isArray(data) ? data : []);
}

/**
 * Returns download URL for original .jsonl raw log.
 */
export function downloadUrl(id) {
  if (isMockMode) {
    return 'mock/events.sample.json';
  }
  return `/api/logs/${encodeURIComponent(id)}/download`;
}

/**
 * Live Server-Sent Events stream with automatic Mock Replay fallback.
 * Replays web/mock/events.sample.json at 1 event / 800ms in mock mode.
 * 
 * @param {string} sessionId - Session to stream (or 'latest')
 * @param {Function} onEvent - Callback for received event object
 * @param {Function} [onError] - Callback for stream errors
 * @returns {Object} Stream controller with .close() method
 */
export function stream(sessionId = 'latest', onEvent, onError = null, forceMock = false) {
  store.setStreaming(true);

  if (isMockMode || forceMock) {
    return startMockStream(sessionId, onEvent, onError);
  }

  // Attempt real Server-Sent Events stream from FastAPI backend
  let eventSource = null;
  let fallbackController = null;
  let closed = false;

  const handleEvent = (e) => {
    if (closed || !e.data) return;
    try {
      const eventData = JSON.parse(e.data);
      store.addEvent(eventData);
      if (typeof onEvent === 'function') onEvent(eventData);
    } catch (parseErr) {
      console.error('[SSE] JSON parse error on stream event:', parseErr);
    }
  };

  try {
    const sId = encodeURIComponent(sessionId || 'latest');
    eventSource = new EventSource(`/api/stream?session_id=${sId}`);

    eventSource.onopen = () => {
      console.log(`[SSE] Connected to /api/stream?session_id=${sId}`);
      store.setStreaming(true);
    };

    // FastAPI sends 'event: step', so we must listen for 'step'
    eventSource.addEventListener('step', handleEvent);
    eventSource.addEventListener('message', handleEvent);
    eventSource.onmessage = handleEvent;

    eventSource.onerror = (err) => {
      console.warn('[SSE] EventSource connection ended or failed. Engaging Demo Stream fallback.', err);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (!closed && !fallbackController) {
        activateMockMode();
        fallbackController = startMockStream(sessionId, onEvent, onError);
      }
    };
  } catch (err) {
    console.warn('[SSE] Could not initialize EventSource. Using mock stream:', err);
    activateMockMode();
    fallbackController = startMockStream(sessionId, onEvent, onError);
  }

  return {
    close: () => {
      closed = true;
      store.setStreaming(false);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (fallbackController) {
        fallbackController.close();
        fallbackController = null;
      }
    }
  };
}

/**
 * Replays mock events sequentially at 800 ms per step.
 */
export function startMockStream(sessionId, onEvent, onError) {
  let intervalId = null;
  let currentIndex = 0;
  let eventsList = [];
  let isClosed = false;

  fetchMock('events.sample.json')
    .then(data => {
      if (isClosed) return;
      eventsList = Array.isArray(data) ? data : (data.events || []);
      if (eventsList.length === 0) return;

      console.log(`[Mock Stream] Replaying ${eventsList.length} sample events at 800ms cadence.`);

      // Emit first event immediately
      const firstEvent = eventsList[currentIndex];
      store.addEvent(firstEvent);
      if (typeof onEvent === 'function') onEvent(firstEvent);
      currentIndex++;

      intervalId = setInterval(() => {
        if (isClosed) {
          clearInterval(intervalId);
          return;
        }

        if (currentIndex < eventsList.length) {
          const ev = eventsList[currentIndex];
          store.addEvent(ev);
          if (typeof onEvent === 'function') onEvent(ev);
          currentIndex++;

          if (ev.game_response?.done || ev.state?.done) {
            console.log('[Mock Stream] Run completed (game over reached).');
            clearInterval(intervalId);
            store.setStreaming(false);
          }
        } else {
          // Loop or stop
          clearInterval(intervalId);
          store.setStreaming(false);
        }
      }, 800);
    })
    .catch(err => {
      console.error('[Mock Stream] Failed to load sample events:', err);
      if (typeof onError === 'function') onError(err);
      store.setStreaming(false);
    });

  return {
    close: () => {
      isClosed = true;
      if (intervalId) clearInterval(intervalId);
      store.setStreaming(false);
    }
  };
}
