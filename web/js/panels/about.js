/**
 * ==========================================================================
 * LAYAMIND — ABOUT & ARCHITECTURE PANEL (panels/about.js)
 * Specifications, two-line problem statement, five-stage pipeline diagram,
 * formal credits (Nandakishor M, Convai Innovations, brainfunctioncollapse.com/laya),
 * and non-negotiable integrity rules.
 * ==========================================================================
 */

import { gameConfig } from '../../config.js';

export function mount(container) {
  container.innerHTML = `
    <div class="panel-about">
      <!-- Header Row -->
      <div class="panel-header-row" style="margin-bottom: var(--space-md); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">SPECIFICATION // MISSION ARCHITECTURE</div>
          <h2 style="margin-bottom: 4px;">ABOUT ${gameConfig.brandName || 'LayaMind'}</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">${gameConfig.gameTagline || 'Autonomous game decision layer built around the Laya model for hackathon auditing.'}</p>
        </div>
        <div style="display: flex; gap: var(--space-sm); align-items: center;">
          <span class="badge badge-good">HACKATHON AUDIT COMPLIANT</span>
        </div>
      </div>

      <!-- 1. Problem Statement in Two Lines -->
      <div class="hud-card card-magenta" style="margin-bottom: var(--space-xl); padding: var(--space-lg);">
        <div style="font-family: var(--font-mono); font-size: 11px; color: var(--neon-magenta); margin-bottom: var(--space-xs); letter-spacing: 0.1em; text-transform: uppercase;">
          PROBLEM STATEMENT
        </div>
        <div style="font-family: var(--font-heading); font-size: 1.15rem; line-height: 1.6; color: #fff; font-weight: 600;">
          <p style="margin-bottom: var(--space-xs);">
            1. Unknown hosted games revealed on hackathon day expose dynamic state and legal moves solely through a remote agent API.
          </p>
          <p style="margin-bottom: 0; color: var(--neon-cyan);">
            2. We build a modular decision layer that queries Laya with typed questions, converts probabilities into legal moves, and streams tamper-evident audit trails.
          </p>
        </div>
      </div>

      <!-- 2. The Five-Stage Pipeline -->
      <div class="hud-card" style="margin-bottom: var(--space-xl);">
        <div style="margin-bottom: var(--space-md);">
          <div class="section-tag">DECISION LIFECYCLE</div>
          <h3 style="color: #fff; font-size: var(--text-base); margin-bottom: 2px;">THE FIVE-STAGE PIPELINE</h3>
          <p style="font-size: var(--text-xs); color: var(--text-muted); margin-bottom: 0;">
            Every move follows this strict sequential pipeline with zero heuristics or fallback chatbots.
          </p>
        </div>

        <div class="pipeline-grid">
          <!-- Stage 1 -->
          <div class="pipeline-step-card">
            <div class="pipeline-step-num">STAGE 01</div>
            <div class="pipeline-step-title">HOSTED GAME API</div>
            <p class="pipeline-step-desc">
              Connects to the organizer's hosted environment. Reads active state observations and legal action candidates.
            </p>
            <div class="pipeline-step-pill">INPUT: GAME REST/WS</div>
          </div>

          <div class="pipeline-arrow" aria-hidden="true">➔</div>

          <!-- Stage 2 -->
          <div class="pipeline-step-card">
            <div class="pipeline-step-num">STAGE 02</div>
            <div class="pipeline-step-title">STATE NORMALISER</div>
            <p class="pipeline-step-desc">
              Converts raw API payloads into a compact, plain-English summary text and structured numeric facts.
            </p>
            <div class="pipeline-step-pill">OUTPUT: STATE_TEXT</div>
          </div>

          <div class="pipeline-arrow" aria-hidden="true">➔</div>

          <!-- Stage 3 -->
          <div class="pipeline-step-card pipeline-card-highlight">
            <div class="pipeline-step-num" style="color: var(--neon-magenta);">STAGE 03</div>
            <div class="pipeline-step-title" style="color: #fff;">LAYA ENGINE</div>
            <p class="pipeline-step-desc">
              Asks Laya typed questions. Computes calibrated probability distributions and maps tokens to move scores.
            </p>
            <div class="pipeline-step-pill" style="border-color: var(--neon-magenta); color: var(--neon-magenta);">ONE LOGGED CALL</div>
          </div>

          <div class="pipeline-arrow" aria-hidden="true">➔</div>

          <!-- Stage 4 -->
          <div class="pipeline-step-card">
            <div class="pipeline-step-num">STAGE 04</div>
            <div class="pipeline-step-title">ACTION VALIDATOR</div>
            <p class="pipeline-step-desc">
              Confirms chosen action is strictly legal. If rejected by the game, excludes it and asks Laya again.
            </p>
            <div class="pipeline-step-pill">AUTO-RETRY SAFE</div>
          </div>

          <div class="pipeline-arrow" aria-hidden="true">➔</div>

          <!-- Stage 5 -->
          <div class="pipeline-step-card">
            <div class="pipeline-step-num">STAGE 05</div>
            <div class="pipeline-step-title">SUBMIT MOVE</div>
            <p class="pipeline-step-desc">
              Dispatches selected action to the game, records response reward, and appends to SHA-256 sealed JSONL.
            </p>
            <div class="pipeline-step-pill">OUTPUT: NEXT STATE</div>
          </div>
        </div>
      </div>

      <!-- 3. Non-Negotiable Rules & Credits -->
      <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: var(--space-lg); margin-bottom: var(--space-xl);">
        <!-- Rules -->
        <div class="hud-card">
          <div class="section-tag" style="color: var(--amber);">INTEGRITY COMMITMENTS</div>
          <h3 style="color: #fff; font-size: var(--text-base); margin-bottom: var(--space-sm);">THE RULES WE FOLLOW</h3>
          
          <div style="display: flex; flex-direction: column; gap: var(--space-sm); font-size: var(--text-sm);">
            <div style="display: flex; gap: var(--space-sm); align-items: flex-start; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
              <span style="color: var(--neon-green); font-weight: 700;">01</span>
              <div>
                <strong style="color: #fff;">Every Move From A Logged Laya Call:</strong>
                <p style="margin: 2px 0 0; color: var(--text-secondary); font-size: var(--text-xs);">
                  No hardcoded heuristics, rule-based bot logic, or other LLMs (no GPT-4, no Claude). Every decision step traces directly to Laya probabilities.
                </p>
              </div>
            </div>

            <div style="display: flex; gap: var(--space-sm); align-items: flex-start; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
              <span style="color: var(--neon-cyan); font-weight: 700;">02</span>
              <div>
                <strong style="color: #fff;">One Visible Inference Per Step:</strong>
                <p style="margin: 2px 0 0; color: var(--text-secondary); font-size: var(--text-xs);">
                  Exactly one logged model call per turn. Retries only happen if the validator reports an excluded action from the game.
                </p>
              </div>
            </div>

            <div style="display: flex; gap: var(--space-sm); align-items: flex-start; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);">
              <span style="color: var(--neon-magenta); font-weight: 700;">03</span>
              <div>
                <strong style="color: #fff;">Zero Fabrication &amp; Explicit Mock Badges:</strong>
                <p style="margin: 2px 0 0; color: var(--text-secondary); font-size: var(--text-xs);">
                  Missing fields stay null. Synthetic demonstration data is prominently labeled DEMO DATA for honest judging.
                </p>
              </div>
            </div>

            <div style="display: flex; gap: var(--space-sm); align-items: flex-start;">
              <span style="color: var(--amber); font-weight: 700;">04</span>
              <div>
                <strong style="color: #fff;">Immutable Cryptographic Evidence:</strong>
                <p style="margin: 2px 0 0; color: var(--text-secondary); font-size: var(--text-xs);">
                  Run telemetry is flushed as append-only NDJSON and verified with a SHA-256 session digest.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Credits & Inspirations -->
        <div class="hud-card card-magenta" style="display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div class="section-tag">ACKNOWLEDGEMENTS</div>
            <h3 style="color: #fff; font-size: var(--text-base); margin-bottom: var(--space-sm);">CREDITS &amp; INSPIRATION</h3>

            <div style="margin-bottom: var(--space-md); padding: var(--space-sm); background: rgba(0, 0, 0, 0.3); border-radius: var(--radius-xs);">
              <div style="font-family: var(--font-mono); font-size: 11px; color: var(--neon-magenta); margin-bottom: 2px;">
                MODEL FOUNDATION &amp; ARCHITECTURE
              </div>
              <div style="font-weight: 700; color: #fff; font-size: var(--text-sm);">
                Laya Model: Nandakishor M, Convai Innovations
              </div>
              <p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 4px 0 0; line-height: 1.4;">
                Specialized in rapid, calibrated probability generation across typed discrete questions for game and agent control.
              </p>
            </div>

            <div style="padding: var(--space-sm); background: rgba(0, 0, 0, 0.3); border-radius: var(--radius-xs);">
              <div style="font-family: var(--font-mono); font-size: 11px; color: var(--neon-cyan); margin-bottom: 2px;">
                UI / UX INSPIRATION
              </div>
              <div style="font-weight: 700; color: #fff; font-size: var(--text-sm);">
                laya-playground site by brain function collapse
              </div>
              <p style="font-size: var(--text-xs); color: var(--text-secondary); margin: 4px 0 0; line-height: 1.4;">
                Inspired by <a href="https://brainfunctioncollapse.com/laya" target="_blank" rel="noopener noreferrer" style="color: var(--neon-cyan);">brainfunctioncollapse.com/laya</a>: demonstrating decisions as an audible, sequential chain from state to questions, probabilities, and final action.
              </p>
            </div>
          </div>

          <div style="margin-top: var(--space-md); font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); text-align: center; border-top: 1px solid var(--border-subtle); padding-top: var(--space-xs);">
            PROJECT REPOSITORY: LAYAMIND // MEMBER C FRONTEND
          </div>
        </div>
      </div>

      <!-- 4. Team Lanes Matrix -->
      <div class="hud-card">
        <h3 style="color: #fff; font-size: var(--text-sm); margin-bottom: var(--space-xs);">TEAM LANE ROLES</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-sm); font-size: var(--text-xs); font-family: var(--font-mono);">
          <div style="padding: 8px; background: rgba(255,255,255,0.02); border-left: 2px solid var(--neon-cyan);">
            <strong style="color: var(--neon-cyan);">MEMBER A:</strong><br>
            Game Integration (Adapters, Normaliser, Validator, Loop)
          </div>
          <div style="padding: 8px; background: rgba(255,255,255,0.02); border-left: 2px solid var(--neon-magenta);">
            <strong style="color: var(--neon-magenta);">MEMBER B:</strong><br>
            Laya Engine &amp; Experiments (Client, Question Sets, Calibration)
          </div>
          <div style="padding: 8px; background: rgba(255,255,255,0.02); border-left: 2px solid var(--neon-green);">
            <strong style="color: var(--neon-green);">MEMBER C:</strong><br>
            Gamer Frontend (Landing page, Dashboard, Live Viewer, USPs)
          </div>
          <div style="padding: 8px; background: rgba(255,255,255,0.02); border-left: 2px solid var(--amber);">
            <strong style="color: var(--amber);">MEMBER D:</strong><br>
            Contracts, Logger, Server, Autopsy, Evidence Verification
          </div>
        </div>
      </div>
    </div>
  `;
}

export function unmount() {}
