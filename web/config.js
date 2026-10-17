/**
 * ==========================================================================
 * LAYAMIND — CENTRAL GAME CONFIGURATION (web/config.js)
 * Single source of truth for TopGameAI Arena games (Snake & 2048).
 * ==========================================================================
 */

export const gameConfig = {
  // Website Branding
  brandName: "LayaMind",

  // Default Game
  gameId: "snake",
  gameName: "TOPGAMEAI ARENA — SNAKE",
  gameSubtitle: "LayaMind // Autonomous Game Decision Layer",
  gameTagline: "TopGameAI Arena Snake & 2048 guided by Laya typed probability reasoning",
  gameDescription: "Autonomous decision layer that consumes TopGameAI Arena games (Snake & 2048), queries Laya with typed spatial questions, validates move legality, and submits actions with immutable audit proofs.",
  
  // Custom Visual Identity
  logoPath: null,
  
  // Theme Color Palette
  theme: {
    primaryAccent: "#4ade80",    // Green-400 (TopGameAI Snake Head)
    secondaryAccent: "#16a34a",  // Green-600 (TopGameAI Snake Body)
    successAccent: "#39ff88",    // Victory Green
    warningAccent: "#ffb020",    // Amber
    dangerAccent: "#ef4444",     // Red-500
    cyanAccent: "#22e6ff",       // Neon Cyan
    purpleAccent: "#a855f7"      // 2048 Purple
  },

  // Game Rules & Qualifying Criteria
  rules: {
    gridWidth: 12,
    gridHeight: 12,
    cellSize: 28,
    maxSteps: 300,
    targetFood: 15,
    pointsPerFood: 60,
    victoryBonus: 100,
    qualifyingScore: 1000,
    reverseAllowed: false,
    rules2048: {
      gridSize: 4,
      maxSteps: 2000,
      scoringFormula: "min(1000, max(0, log2(best tile) - 6) * 143 + floor(score / 1000))",
      runsScoring: "median points of your three best verified runs"
    }
  },

  games: {
    snake: {
      id: "snake",
      name: "SNAKE ARENA",
      url: "https://topgameai.com/arena/snake",
      grid: "12x12",
      maxSteps: 300
    },
    "2048": {
      id: "2048",
      name: "2048 ARENA",
      url: "https://topgameai.com/arena/2048",
      grid: "4x4",
      maxSteps: 2000
    }
  },

  // Model & Hackathon Details
  model: {
    name: "Laya",
    author: "Nandakishor M",
    organization: "Convai Innovations",
    referenceUrl: "https://brainfunctioncollapse.com/laya"
  }
};
