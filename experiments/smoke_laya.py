#!/usr/bin/env python3
"""Laya Engine Smoke Test (Lane B).

Loads convaiinnovations/laya once, performs a warm-up call, runs predictions
with choice, score, and noul question types on a sample game state, and benchmarks
wall-clock latency over 20 repeated calls.
"""

import os
import sys
import time
import numpy as np

# Apply environment recommendations from model card
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("USE_TF", "0")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

import laya


def main():
    print("=" * 60)
    print("Laya Smoke Test (convaiinnovations/laya)")
    print("=" * 60)

    # 1. Load model once and measure load time
    t0 = time.perf_counter()
    print("Loading model 'convaiinnovations/laya'...")
    agent = laya.load("convaiinnovations/laya")
    load_time_s = time.perf_counter() - t0
    print(f"Model loaded successfully in {load_time_s:.2f} seconds.")

    # 2. Check and print device
    device_type = getattr(agent.device, "type", str(agent.device))
    print(f"Device used: {device_type} ({agent.device})")

    # 3. Sample game state in plain English
    sample_state = (
        "We are running forward in the middle lane. An obstacle is blocking the "
        "middle lane directly ahead. The left lane is completely clear and open. "
        "The right lane contains moving hazards."
    )

    # 4. Three typed questions: choice, score, noul
    questions = {
        "obstacle_location": {
            "type": "choice",
            "instructions": "Where is the immediate obstacle located relative to our lane?",
            "criteria": {
                "ahead": "Directly in front of us in our lane",
                "left": "In the lane to our left",
                "right": "In the lane to our right",
                "none": "No obstacle anywhere nearby",
            },
        },
        "danger_level": {
            "type": "score",
            "instructions": "How dangerous is the current situation if we stay on this path?",
            "criteria": [
                "completely safe",
                "minor hazard",
                "moderate danger",
                "imminent collision",
            ],
        },
        "collision_imminent": {
            "type": "noul",
            "instructions": "Is a collision about to happen if we stay in our current lane?",
            "criteria": {
                "false": "Safe to continue straight without collision",
                "true": "Collision will occur if we maintain current course",
            },
        },
    }

    # 5. Throwaway warm-up call
    print("\nRunning warm-up predict call...")
    _ = agent.predict(sample_state, questions)
    print("Warm-up complete.")

    # 6. Detailed inspection of single predict output
    print("\n" + "-" * 50)
    print("Inspecting single prediction result:")
    print("-" * 50)
    res = agent.predict(sample_state, questions)
    print(f"Full result keys: {list(res.keys())}")

    # Inspect each question type output
    answers = res.get("answers", {})
    for q_id, q_def in questions.items():
        q_type = q_def["type"]
        q_ans = answers.get(q_id, {})
        print(f"\nQuestion ID: '{q_id}' (Type: {q_type})")
        print(f"  Result value: {q_ans}")
        if isinstance(q_ans, dict):
            for k, v in q_ans.items():
                print(f"    - {k}: {v}")

    if "confidence" in res:
        print(f"\nOverall / Per-question confidence in res['confidence']: {res['confidence']}")
    if "probabilities" in res:
        print(f"Probabilities in res['probabilities']: {res['probabilities']}")
    if "answers" in res:
        print(f"Answers in res['answers']: {res['answers']}")

    # 7. Benchmark latency over 20 repeated calls
    print("\n" + "-" * 50)
    print("Benchmarking latency over 20 repeated calls...")
    print("-" * 50)
    latencies = []
    for i in range(20):
        t_start = time.perf_counter()
        _ = agent.predict(sample_state, questions)
        t_end = time.perf_counter()
        lat_ms = (t_end - t_start) * 1000.0
        latencies.append(lat_ms)
        print(f"  Call {i+1:2d}/20: {lat_ms:.2f} ms")

    mean_lat = float(np.mean(latencies))
    p95_lat = float(np.percentile(latencies, 95))
    min_lat = float(np.min(latencies))
    max_lat = float(np.max(latencies))

    print("\nLatency Summary (20 calls):")
    print(f"  Mean latency: {mean_lat:.2f} ms")
    print(f"  p95 latency:  {p95_lat:.2f} ms")
    print(f"  Min latency:  {min_lat:.2f} ms")
    print(f"  Max latency:  {max_lat:.2f} ms")
    print("=" * 60)

    return {
        "device": device_type,
        "load_time_s": load_time_s,
        "mean_latency_ms": mean_lat,
        "p95_latency_ms": p95_lat,
        "sample_result": res,
    }


if __name__ == "__main__":
    main()
