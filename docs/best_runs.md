# Best Runs Evidence Log (USP 3)

> Canonical audit record of top-performing game runs powered by Laya.

- **Last Updated**: `2026-10-13 15:27:00Z`
- **Qualifying Score Threshold**: `None specified`
- **Total Preserved Runs in `logs/best/`**: `0`

## Verified Run Leaderboard

| Game | Session ID | Final Score | Steps | Laya Calls | Status | Qualifying | SHA-256 | Log File |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| *None* | *No runs recorded yet* | - | - | - | - | - | - | - |

---

## Audit and Reproduction Instructions

To verify that every move in any preserved run was genuinely produced by Laya without hardcoded fallbacks or human intervention:
```bash
# 1. Verify tamper-proof file hash and Laya move traceability
python scripts/check_every_move_logged.py <session_id> --logs-dir logs/best

# 2. Run Decision Autopsy on the run
python -m bot.autopsy logs/best/<session_id>.jsonl

# 3. Compute detailed latency and decision metrics
python scripts/log_stats.py logs/best/<session_id>.jsonl
```
