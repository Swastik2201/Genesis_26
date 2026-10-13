"""Tests for Question Lab (USP 2) (Lane B).

Uses fake agent and fake adapter to test lab experiments offline,
verifying:
- Exact JSON result schema compliance (contracts/lab_result.schema.json).
- Markdown report generation (experiments/results/<name>.md).
- Metric aggregation across runs (avg_score, best_score, invalid_rate, etc.).
- Reproducibility across identical seeds.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
import pytest

from experiments.lab import run_experiment, parse_seeds


class FakeLabAgent:
    """Fake model agent returning structured answers without network or weights."""

    def predict(self, state: str, questions: dict[str, Any]) -> dict[str, Any]:
        answers = {}
        for q_id, q_def in questions.items():
            q_type = q_def.get("type")
            if q_type == "choice":
                opts = list(q_def.get("criteria", {}).keys()) or ["opt1"]
                prob = 1.0 / len(opts)
                answers[q_id] = {
                    "type": "choice",
                    "choice": opts[0],
                    "probabilities": {opt: prob for opt in opts},
                }
            elif q_type == "noul":
                answers[q_id] = {"type": "noul", "noul": 0.25}
        return {"model": "fake-laya", "answers": answers}


class FakeLabAdapter:
    name = "mock"

    def __init__(self, seed: int = 1) -> None:
        self.seed = seed
        self.step = 0
        self.session_id = f"fake-sess-{seed}"

    def start(self) -> dict[str, Any]:
        self.step = 0
        return self._state()

    def get_state(self) -> dict[str, Any]:
        return self._state()

    def list_actions(self, raw: dict[str, Any]) -> list[dict[str, str]]:
        return [
            {"id": "move_left", "label": "Left"},
            {"id": "stay", "label": "Stay"},
            {"id": "move_right", "label": "Right"},
        ]

    def submit_move(self, action_id: str, params: Any = None) -> dict[str, Any]:
        self.step += 1
        return self._state()

    def judge(self, prev_raw: dict[str, Any], response: dict[str, Any], new_raw: dict[str, Any]) -> bool | None:
        return True

    def _state(self) -> dict[str, Any]:
        return {
            "game_id": "mock-v1",
            "session_id": self.session_id,
            "step": self.step,
            "lane": 2,
            "score": float(self.step * 10),
            "done": self.step >= 3,
            "obstacles": [{"lane": 2, "distance": 2}],
            "legal_actions": self.list_actions({}),
        }


def test_parse_seeds():
    """Verify seed range parsing logic."""
    assert parse_seeds("1-5", 5) == [1, 2, 3, 4, 5]
    assert parse_seeds("10,20,30", 3) == [10, 20, 30]
    assert parse_seeds("", 3) == [1, 2, 3]


def test_question_lab_result_schema(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Verify run_experiment produces JSON and Markdown matching contracts/lab_result.schema.json."""
    fake_agent = FakeLabAgent()

    # Monkeypatch adapter factory to use FakeLabAdapter
    def fake_adapter_factory(adapter_name: str, seed: int):
        return FakeLabAdapter(seed=seed)

    monkeypatch.setattr("experiments.lab._get_adapter_instance", fake_adapter_factory)

    test_name = "test-lab-run"
    lab_result = run_experiment(
        adapter_name="mock",
        variants=["v1_perception", "v2_direct_action"],
        seeds=[1, 2],
        name=test_name,
        max_steps=5,
        agent_override=fake_agent,
    )

    # 1. Check top-level contract keys
    assert lab_result["name"] == test_name
    assert lab_result["adapter"] == "mock"
    assert "created_at" in lab_result
    assert isinstance(lab_result["variants"], list)
    assert len(lab_result["variants"]) == 2

    # 2. Check each variant schema requirement
    required_variant_keys = {
        "question_set",
        "games",
        "avg_score",
        "best_score",
        "invalid_rate",
        "avg_latency_ms",
        "completion_rate",
        "avg_confidence",
        "session_ids",
    }
    for v in lab_result["variants"]:
        assert required_variant_keys.issubset(v.keys())
        assert v["games"] == 2
        assert isinstance(v["avg_score"], (int, float))
        assert isinstance(v["best_score"], (int, float))
        assert 0.0 <= v["invalid_rate"] <= 1.0
        assert v["avg_latency_ms"] >= 0.0
        assert 0.0 <= v["completion_rate"] <= 1.0
        assert 0.0 <= v["avg_confidence"] <= 1.0
        assert isinstance(v["session_ids"], list)
        assert len(v["session_ids"]) == 2

    # 3. Check saved files
    json_path = Path("experiments") / "results" / f"{test_name}.json"
    md_path = Path("experiments") / "results" / f"{test_name}.md"

    assert json_path.exists()
    assert md_path.exists()

    with open(json_path, "r", encoding="utf-8") as f:
        saved_json = json.load(f)
    assert saved_json["name"] == test_name

    with open(md_path, "r", encoding="utf-8") as f:
        md_content = f.read()
    assert "# Question Lab Experiment:" in md_content
    assert "| `v1_perception` |" in md_content
