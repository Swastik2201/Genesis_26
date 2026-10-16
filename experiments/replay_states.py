"""Replay recorded game states offline across candidate QuestionSets (Lane B).

Evaluates candidate question formulations against static recorded states
without network calls or live game server interactions.

Usage:
    python experiments/replay_states.py
    python experiments/replay_states.py --fixtures experiments/fixtures/game1_samples.json
    python experiments/replay_states.py --variants game1_v1_perception game1_v2_direct_action --fake
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

# Ensure project root is in sys.path when script is executed directly
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from bot.laya.engine import LayaEngine
from bot.questions import list_question_sets

DEFAULT_VARIANTS_SNAKE = [
    "game1_v1_perception",
    "game1_v2_direct_action",
    "game1_v3_hazard_gates",
]

DEFAULT_VARIANTS_2048 = [
    "game2_v1_perception",
    "game2_v2_direct_action",
    "game2_v3_corner_anchor",
]


class DeterministicOfflineAgent:
    """Mock agent producing realistic, deterministic responses for offline dry-runs."""

    def predict(self, state_text: str, questions: dict[str, Any]) -> dict[str, Any]:
        text_lower = state_text.lower()
        answers: dict[str, Any] = {}

        for qid, qdef in questions.items():
            qtype = qdef.get("type", "choice")

            if qid == "safest_direction":
                # Perception: look at state text for wall/body danger
                probs = {"up": 0.25, "down": 0.25, "left": 0.25, "right": 0.25, "none": 0.0}
                if "moving right" in text_lower and "right wall is directly ahead" in text_lower:
                    probs = {"down": 0.65, "up": 0.25, "right": 0.05, "left": 0.02, "none": 0.03}
                elif "moving right" in text_lower and "food is 4 tiles directly ahead to the right" in text_lower:
                    probs = {"right": 0.60, "up": 0.20, "down": 0.18, "left": 0.01, "none": 0.01}
                elif "body segments block the tile directly below and the tile to the right" in text_lower:
                    probs = {"left": 0.85, "up": 0.05, "down": 0.04, "right": 0.04, "none": 0.02}
                elif "bottom-left corner" in text_lower:
                    probs = {"right": 0.88, "up": 0.04, "down": 0.04, "left": 0.03, "none": 0.01}
                elif "food is located directly above" in text_lower:
                    probs = {"up": 0.70, "left": 0.15, "down": 0.13, "right": 0.01, "none": 0.01}
                top_choice = max(probs, key=probs.get)
                answers[qid] = {
                    "type": "choice",
                    "choice": top_choice,
                    "probabilities": probs,
                    "confidence": probs[top_choice],
                }

            elif qid == "food_direction":
                # Direction of food
                probs = {"up": 0.1, "down": 0.1, "left": 0.1, "right": 0.1, "none": 0.1}
                if "food is 4 tiles directly ahead to the right" in text_lower:
                    probs = {"right": 0.85, "up": 0.05, "down": 0.05, "left": 0.02, "none": 0.03}
                elif "food is located downward" in text_lower:
                    probs = {"down": 0.80, "right": 0.05, "up": 0.05, "left": 0.05, "none": 0.05}
                elif "food is located directly above" in text_lower:
                    probs = {"up": 0.90, "left": 0.04, "down": 0.03, "right": 0.01, "none": 0.02}
                elif "food is at row 2, col 1" in text_lower:
                    probs = {"left": 0.50, "up": 0.35, "down": 0.05, "right": 0.05, "none": 0.05}
                else:
                    probs = {"right": 0.50, "down": 0.30, "up": 0.10, "left": 0.05, "none": 0.05}
                top_choice = max(probs, key=probs.get)
                answers[qid] = {
                    "type": "choice",
                    "choice": top_choice,
                    "probabilities": probs,
                    "confidence": probs[top_choice],
                }

            elif qid == "next_move":
                # Direct action
                probs = {"up": 0.25, "down": 0.25, "left": 0.25, "right": 0.25}
                if "right wall is directly ahead" in text_lower:
                    probs = {"down": 0.60, "up": 0.30, "right": 0.08, "left": 0.02}
                elif "food is 4 tiles directly ahead to the right" in text_lower:
                    probs = {"right": 0.70, "up": 0.15, "down": 0.12, "left": 0.03}
                elif "body segments block the tile directly below" in text_lower:
                    probs = {"left": 0.75, "up": 0.10, "down": 0.08, "right": 0.07}
                elif "bottom-left corner" in text_lower:
                    probs = {"right": 0.80, "up": 0.08, "down": 0.06, "left": 0.06}
                elif "food is located directly above" in text_lower:
                    probs = {"up": 0.78, "left": 0.12, "down": 0.08, "right": 0.02}
                top_choice = max(probs, key=probs.get)
                answers[qid] = {
                    "type": "choice",
                    "choice": top_choice,
                    "probabilities": probs,
                    "confidence": probs[top_choice],
                }

            elif qid == "collision_ahead":
                p_coll = 0.10
                if "wall is directly ahead" in text_lower or "will crash into the wall" in text_lower:
                    p_coll = 0.92
                elif "body segments block the tile directly below" in text_lower and "moving down" in text_lower:
                    p_coll = 0.89
                elif "bottom-left corner" in text_lower and "moving down" in text_lower:
                    p_coll = 0.95
                answers[qid] = {
                    "type": "noul",
                    "noul": p_coll,
                    "confidence": p_coll,
                }

            elif qid == "safest_turn":
                probs = {"up": 0.2, "down": 0.2, "left": 0.2, "right": 0.2, "straight": 0.2}
                if "right wall is directly ahead" in text_lower:
                    probs = {"down": 0.70, "up": 0.25, "left": 0.02, "right": 0.01, "straight": 0.02}
                elif "body segments block the tile directly below" in text_lower:
                    probs = {"left": 0.85, "up": 0.10, "right": 0.02, "down": 0.01, "straight": 0.02}
                elif "bottom-left corner" in text_lower:
                    probs = {"right": 0.90, "up": 0.06, "left": 0.02, "down": 0.01, "straight": 0.01}
                elif "food is located directly above" in text_lower:
                    probs = {"up": 0.80, "left": 0.10, "down": 0.05, "right": 0.02, "straight": 0.03}
                else:
                    probs = {"straight": 0.70, "right": 0.15, "up": 0.08, "down": 0.05, "left": 0.02}
                top_choice = max(probs, key=probs.get)
                answers[qid] = {
                    "type": "choice",
                    "choice": top_choice,
                    "probabilities": probs,
                    "confidence": probs[top_choice],
                }

            # --- Game 2 (2048) Questions ---
            elif qid == "best_merge_direction":
                probs = {"up": 0.25, "down": 0.25, "left": 0.25, "right": 0.25, "none": 0.0}
                if "sliding up or down will merge" in text_lower or "sliding up will merge" in text_lower:
                    probs = {"up": 0.70, "down": 0.20, "left": 0.05, "right": 0.05, "none": 0.0}
                elif "sliding left merges both horizontal pairs" in text_lower or "sliding left merges" in text_lower:
                    probs = {"left": 0.82, "up": 0.08, "down": 0.05, "right": 0.05, "none": 0.0}
                elif "sliding down preserves monotonicity" in text_lower:
                    probs = {"down": 0.75, "left": 0.15, "right": 0.05, "up": 0.05, "none": 0.0}
                elif "sliding up merges" in text_lower:
                    probs = {"up": 0.80, "left": 0.10, "right": 0.05, "down": 0.05, "none": 0.0}
                top_choice = max(probs, key=probs.get)
                answers[qid] = {
                    "type": "choice",
                    "choice": top_choice,
                    "probabilities": probs,
                    "confidence": probs[top_choice],
                }

            elif qid == "corner_preservation":
                probs = {"up": 0.25, "down": 0.25, "left": 0.25, "right": 0.25, "neutral": 0.0}
                if "sliding up preserves the eight anchored at the top perimeter" in text_lower or "top-right" in text_lower:
                    probs = {"up": 0.75, "right": 0.15, "left": 0.05, "down": 0.05, "neutral": 0.0}
                elif "bottom-left" in text_lower and "sliding down or left" in text_lower:
                    probs = {"down": 0.60, "left": 0.30, "right": 0.05, "up": 0.05, "neutral": 0.0}
                elif "anchored at row 4 column 1" in text_lower:
                    probs = {"down": 0.65, "left": 0.25, "up": 0.05, "right": 0.05, "neutral": 0.0}
                elif "top perimeter" in text_lower:
                    probs = {"up": 0.70, "left": 0.15, "right": 0.10, "down": 0.05, "neutral": 0.0}
                else:
                    probs = {"up": 0.35, "down": 0.35, "left": 0.15, "right": 0.15, "neutral": 0.0}
                top_choice = max(probs, key=probs.get)
                answers[qid] = {
                    "type": "choice",
                    "choice": top_choice,
                    "probabilities": probs,
                    "confidence": probs[top_choice],
                }

            elif qid == "slide_direction":
                probs = {"up": 0.25, "down": 0.25, "left": 0.25, "right": 0.25}
                if "sliding up or down will merge" in text_lower:
                    probs = {"up": 0.65, "down": 0.25, "left": 0.05, "right": 0.05}
                elif "sliding left merges" in text_lower:
                    probs = {"left": 0.78, "up": 0.10, "down": 0.08, "right": 0.04}
                elif "sliding down preserves monotonicity" in text_lower:
                    probs = {"down": 0.70, "left": 0.18, "up": 0.06, "right": 0.06}
                elif "top perimeter" in text_lower:
                    probs = {"up": 0.72, "right": 0.14, "left": 0.08, "down": 0.06}
                top_choice = max(probs, key=probs.get)
                answers[qid] = {
                    "type": "choice",
                    "choice": top_choice,
                    "probabilities": probs,
                    "confidence": probs[top_choice],
                }

            elif qid == "displaces_max_tile":
                p_disp = 0.10
                if "would displace" in text_lower or "would dislodge" in text_lower:
                    p_disp = 0.88
                elif "preserves the eight anchored" in text_lower or "preserves monotonicity" in text_lower:
                    p_disp = 0.08
                answers[qid] = {
                    "type": "noul",
                    "noul": p_disp,
                    "confidence": p_disp,
                }

            elif qid == "merge_corridor":
                probs = {"up": 0.25, "down": 0.25, "left": 0.25, "right": 0.25, "none": 0.0}
                if "sliding left merges both horizontal pairs" in text_lower:
                    probs = {"left": 0.80, "up": 0.10, "down": 0.05, "right": 0.05, "none": 0.0}
                elif "sliding up or down will merge" in text_lower:
                    probs = {"up": 0.65, "down": 0.25, "left": 0.05, "right": 0.05, "none": 0.0}
                elif "sliding down preserves monotonicity" in text_lower:
                    probs = {"down": 0.70, "left": 0.20, "up": 0.05, "right": 0.05, "none": 0.0}
                else:
                    probs = {"up": 0.40, "left": 0.30, "down": 0.20, "right": 0.10, "none": 0.0}
                top_choice = max(probs, key=probs.get)
                answers[qid] = {
                    "type": "choice",
                    "choice": top_choice,
                    "probabilities": probs,
                    "confidence": probs[top_choice],
                }

        return {"model": "laya-replay", "answers": answers}


def resolve_fixtures_path(cli_path: str | None = None, game: str = "snake") -> Path:
    """Locate sample fixtures for the specified game."""
    if cli_path:
        p = Path(cli_path)
        if p.exists():
            return p
        raise FileNotFoundError(f"Specified fixtures file not found: {cli_path}")

    filename = "game2_samples.json" if str(game).lower() in ("2048", "game2") else "game1_samples.json"

    # Check mock_game/fixtures first
    p_mock = Path("mock_game/fixtures") / filename
    if p_mock.exists():
        return p_mock

    # Fallback to experiments/fixtures
    p_exp = Path("experiments/fixtures") / filename
    if p_exp.exists():
        return p_exp

    raise FileNotFoundError(
        f"Could not find sample states for {game}. Looked for:\n"
        f"  - {p_mock.resolve()}\n"
        f"  - {p_exp.resolve()}"
    )


def replay(
    fixtures_path: Path,
    variants: list[str],
    fake: bool = False,
    model_checkpoint: str = "convaiinnovations/laya",
) -> int:
    """Run candidate QuestionSets on sample states offline."""
    print("=" * 80)
    print("REPLAY STATES: Offline Question Evaluation (Lane B)")
    print(f"Fixtures file: {fixtures_path}")
    print(f"Variants: {variants}")
    print(f"Engine mode: {'Deterministic Fake Agent' if fake else 'Live Laya Model (' + model_checkpoint + ')'}")
    print("=" * 80 + "\n")

    with open(fixtures_path, "r", encoding="utf-8") as f:
        states: list[dict[str, Any]] = json.load(f)

    print(f"Loaded {len(states)} sample game states.\n")

    # Load agent once
    if fake:
        shared_agent = DeterministicOfflineAgent()
    else:
        print("Loading Laya model once (may take ~5-10s)...")
        t0 = time.perf_counter()
        import laya
        shared_agent = laya.load(model_checkpoint)
        print(f"Model loaded in {time.perf_counter() - t0:.2f}s.\n")

    for v_id in variants:
        print(f"\n######################################################################")
        print(f"## VARIANT: [{v_id}]")
        print(f"######################################################################\n")

        engine = LayaEngine(question_set=v_id, agent=shared_agent)

        for i, state in enumerate(states, 1):
            step = state.get("step", i - 1)
            sess = state.get("session_id", f"sample-{i}")
            legal_actions = state.get("legal_actions", [])
            state_text = state.get("state_text", "")

            # Make decision
            decision = engine.decide(state, legal_actions)

            print(f"--- State {i}/{len(states)} [Session: {sess} | Step: {step}] ---")
            print(f"State Text: \"{state_text}\"")
            print(f"Legal Actions & Computed Probabilities:")
            for act in legal_actions:
                aid = act["id"]
                prob = decision.action_scores.get(aid, 0.0)
                is_chosen = "[SELECTED]" if aid == decision.chosen_action else "          "
                hint_str = f"({act['hint']})" if "hint" in act else ""
                print(f"  {is_chosen} {aid:8s} -> prob: {prob:.4f}  {hint_str}")

            print(f"Chosen Action : {decision.chosen_action} (confidence: {decision.action_scores.get(decision.chosen_action, 0.0):.4f})")
            print(f"Latency       : {decision.latency_ms:.1f} ms")
            print(f"Reason        : {decision.reason}")
            print()

    print("=" * 80)
    print("Replay completed successfully across all candidate question sets.")
    print("=" * 80)
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run candidate QuestionSets on recorded game states offline."
    )
    parser.add_argument(
        "--game",
        "-g",
        type=str,
        default="snake",
        choices=["snake", "2048", "game1", "game2"],
        help="Target game to replay (snake or 2048, default: snake).",
    )
    parser.add_argument(
        "--fixtures",
        "-f",
        type=str,
        default=None,
        help="Path to sample fixtures file (default: auto-detected for game).",
    )
    parser.add_argument(
        "--variants",
        "-v",
        nargs="+",
        default=None,
        help="List of QuestionSet identifiers to evaluate (default: game candidates).",
    )
    parser.add_argument(
        "--fake",
        action="store_true",
        help="Use deterministic offline fake agent instead of downloading/loading PyTorch model.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="convaiinnovations/laya",
        help="Laya HuggingFace checkpoint or local path.",
    )

    args = parser.parse_args()

    fixtures_path = resolve_fixtures_path(args.fixtures, game=args.game)

    if args.variants:
        variants = args.variants
    elif args.game in ("2048", "game2"):
        variants = DEFAULT_VARIANTS_2048
    else:
        variants = DEFAULT_VARIANTS_SNAKE

    exit_code = replay(
        fixtures_path=fixtures_path,
        variants=variants,
        fake=args.fake,
        model_checkpoint=args.model,
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
