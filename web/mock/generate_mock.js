// Generate 40 realistic mock runner events compliant with contracts/event.schema.json
const fs = require('fs');
const path = require('path');

const events = [];
let currentLane = 2;
let currentScore = 0;
const sessionId = "demo-runner-20261013-001";
const gameId = "mock-runner-v1";
const startTime = new Date("2026-10-13T10:00:00.000Z").getTime();

for (let step = 0; step < 40; step++) {
  const ts = new Date(startTime + step * 850).toISOString();
  const isDone = (step === 39);
  
  // Decide scenario at this step
  let stateText = "";
  let facts = {};
  let legalActions = [];
  let layaCalls = [];
  let validator = { retries: 0, fallback: false, rejections: [] };
  let chosenAction = "stay";
  let gameResponse = {};
  let outcome = "";
  let qType = (step % 3 === 0) ? "choice" : ((step % 3 === 1) ? "score" : "noul");

  // Determine legal actions based on current lane
  if (currentLane === 1) {
    legalActions = [
      { id: "stay", label: "Stay (Lane 1)", hint: "Remain in left lane" },
      { id: "move_right", label: "Shift Right (Lane 2)", hint: "Transition to center" }
    ];
  } else if (currentLane === 2) {
    legalActions = [
      { id: "move_left", label: "Shift Left (Lane 1)", hint: "Transition to left lane" },
      { id: "stay", label: "Stay (Lane 2)", hint: "Hold center corridor" },
      { id: "move_right", label: "Shift Right (Lane 3)", hint: "Transition to right lane" }
    ];
  } else {
    legalActions = [
      { id: "move_left", label: "Shift Left (Lane 2)", hint: "Transition to center" },
      { id: "stay", label: "Stay (Lane 3)", hint: "Remain in right lane" }
    ];
  }

  // Handle illegal move with retry at step 11 and step 27
  if (step === 11) {
    // Current lane is 1. Laya first tries illegal move_left (wall collision)
    stateText = `Step ${step}: Runner in Lane 1 approaching left barrier. Debris detected in Lane 1. Lane 2 is open.`;
    facts = { current_lane: 1, speed: 1.4, obstacles: [{ lane: 1, distance: 2 }] };
    
    // First call (rejected)
    const call1 = {
      question_set: "perception_runner_v1",
      questions: [{ id: `q_step_${step}_1`, type: "choice", text: "Which direction offers open clearance?", options: ["Shift Left", "Stay Lane 1", "Shift Right"] }],
      raw: { probabilities: [0.78, 0.12, 0.10], predicted_token: "Shift Left" },
      action_scores: { "move_left": 0.78, "stay": 0.12, "move_right": 0.10 },
      chosen_action: "move_left",
      latency_ms: 32.1,
      accepted: false,
      excluded: true,
      legal: false
    };

    // Second call after excluding move_left
    const call2 = {
      question_set: "perception_runner_v1",
      questions: [{ id: `q_step_${step}_2`, type: "choice", text: "Given left is blocked by wall, choose between Lane 1 stay or Lane 2 shift:", options: ["Stay Lane 1", "Shift Right"] }],
      raw: { probabilities: [0.08, 0.92], predicted_token: "Shift Right" },
      action_scores: { "stay": 0.08, "move_right": 0.92 },
      chosen_action: "move_right",
      latency_ms: 29.4,
      accepted: true,
      excluded: false,
      legal: true
    };

    layaCalls = [call1, call2];
    validator = {
      retries: 1,
      fallback: false,
      rejections: ["Action 'move_left' is illegal: player is already at leftmost boundary (Lane 1)."]
    };
    chosenAction = "move_right";
    const scoreBefore = currentScore;
    currentScore += 10;
    currentLane = 2;
    gameResponse = {
      good: true,
      score_before: scoreBefore,
      score_after: currentScore,
      done: false,
      message: "Validator retry accepted: shifted safely to Lane 2 after initial out-of-bounds rejection."
    };
    outcome = "Recovered from illegal move; transitioned to Lane 2 (+10 pts)";

  } else if (step === 27) {
    // Current lane is 3. Illegal move_right attempted
    stateText = `Step ${step}: Runner in Lane 3 near boundary wall. Heavy debris in Lane 3 at distance 1. Lane 2 is clear.`;
    facts = { current_lane: 3, speed: 1.8, obstacles: [{ lane: 3, distance: 1 }] };
    
    const call1 = {
      question_set: "perception_runner_v1",
      questions: [{ id: `q_step_${step}_1`, type: "noul", text: "Estimate safety margin for right shoulder shift vs center return:", options: ["Right shoulder", "Hold Lane 3", "Left to Lane 2"] }],
      raw: { probabilities: [0.85, 0.05, 0.10], predicted_token: "Right shoulder" },
      action_scores: { "move_right": 0.85, "stay": 0.05, "move_left": 0.10 },
      chosen_action: "move_right",
      latency_ms: 34.0,
      accepted: false,
      excluded: true,
      legal: false
    };

    const call2 = {
      question_set: "perception_runner_v1",
      questions: [{ id: `q_step_${step}_2`, type: "noul", text: "Right shoulder illegal. Re-evaluating legal actions:", options: ["Hold Lane 3 (Crash in 1)", "Left to Lane 2 (Clear)"] }],
      raw: { probabilities: [0.03, 0.97], predicted_token: "Left to Lane 2 (Clear)" },
      action_scores: { "stay": 0.03, "move_left": 0.97 },
      chosen_action: "move_left",
      latency_ms: 27.8,
      accepted: true,
      excluded: false,
      legal: true
    };

    layaCalls = [call1, call2];
    validator = {
      retries: 1,
      fallback: false,
      rejections: ["Action 'move_right' is illegal: player is already at rightmost track limit (Lane 3)."]
    };
    chosenAction = "move_left";
    const scoreBefore = currentScore;
    currentScore += 15;
    currentLane = 2;
    gameResponse = {
      good: true,
      score_before: scoreBefore,
      score_after: currentScore,
      done: false,
      message: "Validator corrected boundary excursion: moved to Lane 2."
    };
    outcome = "Validator retry successful: dodged Lane 3 obstacle into Lane 2 (+15 pts)";

  } else if (step === 39) {
    // Final game over step
    stateText = `Step ${step}: Runner in Lane ${currentLane}. Final gauntlet reached! High speed kinetic barrier across all sectors. Run concludes.`;
    facts = { current_lane: currentLane, speed: 2.2, obstacles: [{ lane: 1, distance: 1 }, { lane: 2, distance: 1 }, { lane: 3, distance: 1 }] };
    
    const actionKeys = legalActions.map(a => a.id);
    const scores = {};
    actionKeys.forEach((k, i) => { scores[k] = (i === 0) ? 0.6 : 0.4 / (actionKeys.length - 1); });
    chosenAction = actionKeys[0];

    layaCalls = [{
      question_set: "gauntlet_end_v1",
      questions: [{ id: `q_step_${step}`, type: "choice", text: "All lanes blocked by terminal gate. Which action minimizes terminal deceleration?", options: legalActions.map(a => a.label) }],
      raw: { probabilities: actionKeys.map(k => scores[k]), predicted_token: legalActions[0].label },
      action_scores: scores,
      chosen_action: chosenAction,
      latency_ms: 36.2,
      accepted: true,
      excluded: false,
      legal: true
    }];

    const scoreBefore = currentScore;
    currentScore += 100; // Finish line bonus
    gameResponse = {
      good: true,
      score_before: scoreBefore,
      score_after: currentScore,
      done: true,
      message: "Run complete! Terminal qualification checkpoint logged. Final score: " + currentScore
    };
    outcome = "Completed 40 steps. Terminal gate reached. Final score: " + currentScore;

  } else {
    // Standard normal step
    let nextLane = currentLane;
    let delta = 10;
    let msg = "";

    // Alternate between lane changes and staying
    if (step % 4 === 1 && currentLane > 1) {
      chosenAction = "move_left";
      nextLane = currentLane - 1;
      msg = `Shifted safely to Lane ${nextLane}.`;
    } else if (step % 4 === 3 && currentLane < 3) {
      chosenAction = "move_right";
      nextLane = currentLane + 1;
      msg = `Shifted safely to Lane ${nextLane}.`;
    } else {
      chosenAction = "stay";
      nextLane = currentLane;
      msg = `Holding Lane ${currentLane} with steady velocity.`;
    }

    if (step % 5 === 0) {
      delta = 25; // Coin bonus
      msg += " Picked up energy crystal (+25).";
    }

    stateText = `Step ${step}: Runner in Lane ${currentLane}. Speed ${(1.0 + step * 0.03).toFixed(2)}x. Distance traveled: ${step * 25}m.`;
    facts = { current_lane: currentLane, speed: Number((1.0 + step * 0.03).toFixed(2)), step };

    // Build probability distribution
    const actionScores = {};
    const keys = legalActions.map(a => a.id);
    let winProb = (0.75 + (step % 15) * 0.015).toFixed(2);
    winProb = Math.min(Number(winProb), 0.94);
    const remProb = Number(((1 - winProb) / Math.max(1, keys.length - 1)).toFixed(4));
    
    keys.forEach(k => {
      actionScores[k] = (k === chosenAction) ? winProb : remProb;
    });

    let qText = "";
    if (qType === "choice") {
      qText = `Which maneuver offers optimal energy yield at current speed?`;
    } else if (qType === "score") {
      qText = `Does maintaining lane ${currentLane} offer a high probability of avoiding impending obstacles?`;
    } else {
      qText = `Estimate clearance index for track progression:`;
    }

    layaCalls = [{
      question_set: "runner_tactical_v1",
      questions: [{ id: `q_step_${step}`, type: qType, text: qText, options: legalActions.map(a => a.label) }],
      raw: { probabilities: keys.map(k => actionScores[k]), predicted_token: legalActions.find(a => a.id === chosenAction).label },
      action_scores: actionScores,
      chosen_action: chosenAction,
      latency_ms: Number((26.0 + (step * 7) % 15 + Math.random() * 2).toFixed(1)),
      accepted: true,
      excluded: false,
      legal: true
    }];

    const scoreBefore = currentScore;
    currentScore += delta;
    currentLane = nextLane;

    gameResponse = {
      good: true,
      score_before: scoreBefore,
      score_after: currentScore,
      done: false,
      message: msg
    };
    outcome = `Executed ${chosenAction} in Lane ${currentLane} (+${delta} pts)`;
  }

  events.push({
    schema: 1,
    session_id: sessionId,
    game_id: gameId,
    ts,
    step,
    state: {
      game_id: gameId,
      session_id: sessionId,
      step,
      state_text: stateText,
      facts,
      legal_actions: legalActions,
      score: gameResponse.score_before || 0,
      done: isDone
    },
    laya_calls: layaCalls,
    validator,
    final_action: chosenAction,
    game_response: gameResponse,
    outcome
  });
}

const outPath = path.join(__dirname, 'events.sample.json');
fs.writeFileSync(outPath, JSON.stringify(events, null, 2), 'utf8');
console.log(`Generated ${events.length} mock events successfully into ${outPath}`);
