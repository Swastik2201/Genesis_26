"""2048 Expectimax & Heuristic Policy for TopGameAI Arena.

Evaluates 4x4 boards using:
- Corner gradient anchor (bottom-left or bottom-right)
- Monotonicity along rows and columns
- Smoothness (adjacent merge potentials)
- Empty space maximization
- Fast 2-ply expectimax lookahead
"""

from __future__ import annotations

import math
import random
from typing import Any

ACTIONS = ("up", "down", "left", "right")

# Bottom-left anchor gradient matrix
WEIGHTS_BL = [
    [   16,     8,     4,     2],
    [   32,    64,   128,   256],
    [ 4096,  2048,  1024,   512],
    [65536, 32768, 16384,  8192]
]


def slide_row_left(row: list[int]) -> tuple[list[int], int]:
    non_zero = [v for v in row if v != 0]
    merged = []
    score_gain = 0
    skip = False
    for i in range(len(non_zero)):
        if skip:
            skip = False
            continue
        if i + 1 < len(non_zero) and non_zero[i] == non_zero[i + 1]:
            val = non_zero[i] * 2
            merged.append(val)
            score_gain += val
            skip = True
        else:
            merged.append(non_zero[i])
    while len(merged) < 4:
        merged.append(0)
    return merged, score_gain


def simulate_move_2048(grid: list[list[int]], action: str) -> tuple[list[list[int]], int, bool]:
    g = [row[:] for row in grid]
    score_gain = 0

    if action == "left":
        new_g = []
        for row in g:
            r, s = slide_row_left(row)
            new_g.append(r)
            score_gain += s
    elif action == "right":
        new_g = []
        for row in g:
            r, s = slide_row_left(row[::-1])
            new_g.append(r[::-1])
            score_gain += s
    elif action == "up":
        trans = [list(col) for col in zip(*g)]
        new_trans = []
        for row in trans:
            r, s = slide_row_left(row)
            new_trans.append(r)
            score_gain += s
        new_g = [list(col) for col in zip(*new_trans)]
    elif action == "down":
        trans = [list(col) for col in zip(*g)]
        new_trans = []
        for row in trans:
            r, s = slide_row_left(row[::-1])
            new_trans.append(r[::-1])
            score_gain += s
        new_g = [list(col) for col in zip(*new_trans)]
    else:
        return g, 0, False

    changed = new_g != grid
    return new_g, score_gain, changed


def get_empty_cells(grid: list[list[int]]) -> list[tuple[int, int]]:
    return [(r, c) for r in range(4) for c in range(4) if grid[r][c] == 0]


def evaluate_board(grid: list[list[int]]) -> float:
    empty_cells = len(get_empty_cells(grid))
    weight_score = 0.0
    max_val = 0
    max_pos = (0, 0)

    for r in range(4):
        for c in range(4):
            val = grid[r][c]
            if val > max_val:
                max_val = val
                max_pos = (r, c)
            if val > 0:
                weight_score += val * WEIGHTS_BL[r][c]

    # Corner anchor bonus (bottom-left)
    corner_bonus = (max_val * 10.0) if max_pos == (3, 0) else (-max_val * 5.0)

    # Smoothness penalty
    smoothness = 0.0
    for r in range(4):
        for c in range(4):
            if grid[r][c] > 0:
                v = math.log2(grid[r][c])
                if c + 1 < 4 and grid[r][c + 1] > 0:
                    smoothness -= abs(v - math.log2(grid[r][c + 1]))
                if r + 1 < 4 and grid[r + 1][c] > 0:
                    smoothness -= abs(v - math.log2(grid[r + 1][c]))

    # Monotonicity
    monotonicity = 0.0
    for r in range(4):
        for c in range(3):
            if grid[r][c] >= grid[r][c + 1]:
                monotonicity += 1.0
            else:
                monotonicity -= 2.0
    for c in range(4):
        for r in range(3):
            if grid[r + 1][c] >= grid[r][c]:
                monotonicity += 1.0
            else:
                monotonicity -= 2.0

    return (
        weight_score * 1.0
        + empty_cells * 2000.0
        + corner_bonus
        + smoothness * 100.0
        + monotonicity * 200.0
    )


def expectimax(grid: list[list[int]], depth: int, is_agent: bool = True) -> float:
    if depth == 0:
        return evaluate_board(grid)

    if is_agent:
        best_score = -float("inf")
        has_moves = False
        for action in ACTIONS:
            new_g, score_gain, changed = simulate_move_2048(grid, action)
            if changed:
                has_moves = True
                val = score_gain * 2.0 + expectimax(new_g, depth - 1, is_agent=False)
                if val > best_score:
                    best_score = val
        return best_score if has_moves else -100000.0
    else:
        empty = get_empty_cells(grid)
        if not empty:
            return evaluate_board(grid)
        sample = empty if len(empty) <= 3 else random.sample(empty, 3)
        total_val = 0.0
        for r, c in sample:
            g2 = [row[:] for row in grid]
            g2[r][c] = 2
            total_val += 0.9 * expectimax(g2, depth - 1, is_agent=True)
            g4 = [row[:] for row in grid]
            g4[r][c] = 4
            total_val += 0.1 * expectimax(g4, depth - 1, is_agent=True)
        return total_val / len(sample)


def choose_best_2048_action(grid: list[list[int]]) -> tuple[str, dict[str, float], float, str]:
    """Returns (best_action, action_probabilities, confidence, reason)."""
    scores: dict[str, float] = {}
    best_move = None
    best_val = -float("inf")

    for action in ACTIONS:
        new_g, score_gain, changed = simulate_move_2048(grid, action)
        if not changed:
            scores[action] = -999999.0
            continue
        val = score_gain * 2.0 + expectimax(new_g, depth=2, is_agent=False)
        scores[action] = val
        if val > best_val:
            best_val = val
            best_move = action

    legal = {k: v for k, v in scores.items() if v > -500000.0}
    if not legal:
        return "down", {a: 0.25 for a in ACTIONS}, 0.25, "No legal move changed the board"

    min_v = min(legal.values())
    max_v = max(legal.values())
    span = max(1.0, max_v - min_v)
    exp_scores = {k: math.exp(min(12.0, (v - min_v) / span * 3.0)) for k, v in legal.items()}
    sum_exp = sum(exp_scores.values())

    probs = {a: round(exp_scores.get(a, 0.0) / sum_exp, 3) for a in ACTIONS}
    conf = float(probs.get(best_move or "down", 0.5))

    reason = (
        f"Selected {best_move.upper()} to preserve corner anchor and maximize monotonicity/merges."
        if best_move else "Fallback direction"
    )

    return best_move or "down", probs, conf, reason
