@echo off
title Launch TopGameAI 2048 Autonomous Match (4-Goats)
cd /d "%~dp0"
if exist "%~dp0.venv\Scripts\python.exe" (
    "%~dp0.venv\Scripts\python.exe" "%~dp0scripts\play_topgameai_2048.py" --team "4-Goats"
) else (
    python "%~dp0scripts\play_topgameai_2048.py" --team "4-Goats"
)
pause
