"""Entrypoint for running the server with `python -m server`.

Supports:
    --host: default 127.0.0.1
    --port: default 8000
    --logs-dir: default logs/runs
    --reload: enable auto-reload during development
"""

from pathlib import Path
import argparse
import sys
import time
import uvicorn

from server.app import create_app


def main():
    parser = argparse.ArgumentParser(description="Beat the Bot FastAPI Server")
    parser.add_argument("--host", default="127.0.0.1", help="Host address to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on")
    parser.add_argument("--logs-dir", default="logs/runs", help="Directory where JSONL logs reside")
    parser.add_argument("--reload", action="store_true", help="Enable uvicorn hot reloading")

    args = parser.parse_args()

    logs_path = Path(args.logs_dir)
    app = create_app(logs_dir=logs_path)
    app.state.start_time = time.time()

    print(f"[*] Starting Beat the Bot server at http://{args.host}:{args.port}")
    print(f"[*] Reading run logs from: {logs_path.resolve()}")

    uvicorn.run(app, host=args.host, port=args.port, reload=args.reload)


if __name__ == "__main__":
    main()
