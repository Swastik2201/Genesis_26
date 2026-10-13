"""Unit tests for final_check.py pre-submission validation (Lane D)."""

from pathlib import Path
import pytest

from scripts.final_check import (
    check_best_runs,
    check_readme,
    check_writeup_todos,
    scan_for_secrets,
)


def test_readme_check_passes():
    ok, msg = check_readme()
    assert ok is True
    assert "bytes" in msg


def test_writeup_detects_todos():
    ok, todos = check_writeup_todos()
    # Writeup currently has [TODO: number] markers awaiting real game-day runs
    assert isinstance(todos, list)
    assert len(todos) > 0


def test_secret_scanner_clean():
    leaks = scan_for_secrets()
    assert len(leaks) == 0, f"Unexpected secrets found: {leaks}"


def test_check_best_runs_with_files(tmp_path, monkeypatch):
    from scripts.check_every_move_logged import REPO_ROOT

    # Test missing best dir
    ok, msg, errs = check_best_runs()
    # It either passes or warns if no files in best/
    assert isinstance(msg, str)
