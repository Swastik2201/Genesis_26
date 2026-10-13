/**
 * ==========================================================================
 * BEAT THE BOT — CLIENT-SIDE HASH ROUTER (router.js)
 * Clean, lightweight panel switcher without full page reloads.
 * ==========================================================================
 */

import * as overviewPanel from './panels/overview.js';
import * as livePanel from './panels/live.js';
import * as autopsyPanel from './panels/autopsy.js';
import * as labPanel from './panels/lab.js';
import * as replayPanel from './panels/replay.js';
import * as calibrationPanel from './panels/calibration.js';
import * as logsPanel from './panels/logs.js';
import * as aboutPanel from './panels/about.js';

const routes = {
  'overview': overviewPanel,
  'live': livePanel,
  'autopsy': autopsyPanel,
  'lab': labPanel,
  'replay': replayPanel,
  'calibration': calibrationPanel,
  'logs': logsPanel,
  'about': aboutPanel
};

let currentPanel = null;
let containerEl = null;

/**
 * Parses hash into route path and parameter object.
 * E.g., "#/replay?step=12" -> { path: 'replay', params: { step: '12' } }
 */
function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '').trim();
  if (!hash) return { path: 'live', params: {} };

  const [pathPart, queryPart] = hash.split('?');
  const path = pathPart.toLowerCase() || 'live';
  const params = {};

  if (queryPart) {
    const searchParams = new URLSearchParams(queryPart);
    for (const [key, val] of searchParams.entries()) {
      params[key] = val;
    }
  }

  return { path, params };
}

/**
 * Navigates to the route matching the current hash.
 */
export async function navigate() {
  if (!containerEl) return;

  const { path, params } = parseHash();
  const targetRoute = routes[path] ? path : 'live';
  const panelModule = routes[targetRoute];

  // Unmount previous panel
  if (currentPanel && typeof currentPanel.unmount === 'function') {
    try {
      currentPanel.unmount();
    } catch (err) {
      console.error('[Router] Error during unmount:', err);
    }
  }

  // Clear container
  containerEl.innerHTML = '';
  currentPanel = panelModule;

  // Mount new panel
  if (panelModule && typeof panelModule.mount === 'function') {
    try {
      panelModule.mount(containerEl, params);
    } catch (err) {
      console.error(`[Router] Error mounting ${targetRoute}:`, err);
      containerEl.innerHTML = `
        <div class="hud-card" style="border-color: var(--red); text-align: center; padding: var(--space-xl);">
          <h3 style="color: var(--red);">PANEL MOUNT ERROR</h3>
          <p style="color: var(--text-secondary);">${err.message}</p>
          <a href="#/live" class="btn btn-primary btn-sm">RETURN TO LIVE RUN</a>
        </div>
      `;
    }
  }

  // Update navigation visual highlight
  updateActiveNav(targetRoute);
}

function updateActiveNav(activePath) {
  const navItems = document.querySelectorAll('[data-route]');
  navItems.forEach(el => {
    const route = el.getAttribute('data-route');
    if (route === activePath) {
      el.classList.add('is-active');
      el.setAttribute('aria-current', 'page');
    } else {
      el.classList.remove('is-active');
      el.removeAttribute('aria-current');
    }
  });
}

/**
 * Initializes hash change listener and triggers first navigation.
 * @param {HTMLElement} container - DOM element to render active panel inside
 */
export function initRouter(container) {
  containerEl = container;
  window.addEventListener('hashchange', navigate);

  // If no hash present, default to #/live
  if (!window.location.hash) {
    window.location.hash = '#/live';
  } else {
    navigate();
  }
}
