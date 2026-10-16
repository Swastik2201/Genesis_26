/**
 * ==========================================================================
 * LAYAMIND — CENTRAL GAME CONFIGURATION (web/config.js)
 * Single source of truth for game branding, theme accents, and parameters.
 * Retheme on hackathon game day by editing only this configuration file.
 * ==========================================================================
 */

export const gameConfig = {
  // Website Branding
  brandName: "LayaMind",

  // Game Branding (Stage 1: Snake, Stage 2: 2048)
  gameId: "snake",
  gameName: "TOPGAMEAI ARENA — SNAKE & 2048",
  gameSubtitle: "LayaMind // Autonomous Game Decision Layer",
  gameTagline: "Stage 1: Snake (12x12 Grid) & Stage 2: 2048 (4x4 Sliding Tiles) guided by Laya typed probabilities",
  gameDescription: "Autonomous decision layer that normalizes game observations from TopGameAI Arena, queries Laya with typed questions, validates move legality, and submits actions with immutable audit proofs.",
  
  // Custom Visual Identity
  logoPath: null,
  
  // Theme Color Palette
  theme: {
    primaryAccent: "#22e6ff",    // Neon Cyan — Primary UI accents, focus, and legal moves
    secondaryAccent: "#ff3df2",  // Neon Magenta — Laya reasoning, question sets, and game over
    successAccent: "#39ff88",    // Neon Green — Positive reward, verified calibration, correct moves
    warningAccent: "#ffb020",    // Amber — Validator rejections, auto-retries, preliminary sample warning
    dangerAccent: "#ff4d6d"      // Crimson Red — Damage collisions, misses, and critical alerts
  },

  // Game Rules & Qualifying Criteria
  rules: {
    maxSteps: 300,
    qualifyingScore: 1000,
    snakeGrid: 12,
    targetFood: 15,
    maxSteps2048: 2000
  },

  // Model & Hackathon Details
  model: {
    name: "Laya",
    author: "Nandakishor M",
    organization: "Convai Innovations",
    referenceUrl: "https://brainfunctioncollapse.com/laya"
  }
};
