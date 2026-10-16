/**
 * ==========================================================================
 * LAYAMIND — CENTRAL GAME CONFIGURATION (web/config.js)
 * Single source of truth for TopGameAI Arena Snake game.
 * ==========================================================================
 */

export const gameConfig = {
  // Website Branding
  brandName: "LayaMind",

  // Game Branding: TopGameAI Arena Snake ONLY
  gameId: "snake",
  gameName: "TOPGAMEAI ARENA — SNAKE",
  gameSubtitle: "LayaMind // Autonomous Game Decision Layer",
  gameTagline: "TopGameAI Arena Snake (12x12 Grid) guided by Laya typed probability reasoning",
  gameDescription: "Autonomous decision layer that normalizes 12x12 game observations from TopGameAI Arena (https://topgameai.com/arena/snake), queries Laya with typed spatial questions, validates move legality, prevents reverse suicides, and submits actions with immutable audit proofs.",
  
  // Custom Visual Identity
  logoPath: null,
  
  // Theme Color Palette (Matching TopGameAI Snake arena)
  theme: {
    primaryAccent: "#4ade80",    // Green-400 (TopGameAI Snake Head)
    secondaryAccent: "#16a34a",  // Green-600 (TopGameAI Snake Body)
    successAccent: "#39ff88",    // Victory Green
    warningAccent: "#ffb020",    // Amber — Reversal rejection warning
    dangerAccent: "#ef4444"      // Red-500 (TopGameAI Food)
  },

  // Game Rules & Qualifying Criteria (Exact TopGameAI Arena Snake rules)
  rules: {
    gridWidth: 12,
    gridHeight: 12,
    cellSize: 28,
    maxSteps: 300,
    targetFood: 15,
    pointsPerFood: 60,
    victoryBonus: 100,
    qualifyingScore: 1000,
    reverseAllowed: false
  },

  // Model & Hackathon Details
  model: {
    name: "Laya",
    author: "Nandakishor M",
    organization: "Convai Innovations",
    referenceUrl: "https://brainfunctioncollapse.com/laya"
  }
};
