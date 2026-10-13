"""Thin HTTP client wrapper for game adapters (Lane A).

Provides a ``GameHTTPClient`` that wraps ``requests.Session`` with:
- Configurable base URL, API key header, and session ID (from env / config).
- Per-request timeout.
- Exponential backoff retries for transient errors (5xx, connection errors).
- Clear error messages; secrets are NEVER printed.

Usage
-----
::

    from bot.adapters.http_client import GameHTTPClient

    client = GameHTTPClient(base_url="http://localhost:8181", api_key="…")
    resp = client.post("/start", json={"seed": 42})
"""

from __future__ import annotations

import time
import logging
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

import bot.config as cfg

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Retry configuration
# ---------------------------------------------------------------------------

# Only retry on these status codes (server-side transient errors).
_RETRY_STATUS_CODES = frozenset({429, 500, 502, 503, 504})

# HTTP methods that are safe to retry automatically.
_RETRY_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "POST", "PUT"})


def _build_session(max_retries: int, backoff_base: float) -> requests.Session:
    """Create a requests.Session with a urllib3 Retry adapter mounted."""
    session = requests.Session()
    retry = Retry(
        total=max_retries,
        read=max_retries,
        connect=max_retries,
        status=max_retries,
        backoff_factor=backoff_base,
        status_forcelist=list(_RETRY_STATUS_CODES),
        allowed_methods=list(_RETRY_METHODS),
        raise_on_status=False,   # we inspect the status ourselves
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


# ---------------------------------------------------------------------------
# Public client
# ---------------------------------------------------------------------------


class GameHTTPClient:
    """Thin wrapper around ``requests.Session``.

    Parameters
    ----------
    base_url:
        Root URL of the game API, e.g. ``"http://localhost:8181"``.
        Trailing slashes are stripped.
    api_key:
        Bearer token / API key.  Pass ``""`` if not required.
        **Never printed or logged.**
    session_id:
        Existing session to resume.  ``""`` means start a new session.
    timeout:
        Request timeout in seconds (default: ``cfg.HTTP_TIMEOUT``).
    max_retries:
        Number of retries for transient failures (default: ``cfg.HTTP_MAX_RETRIES``).
    backoff_base:
        Backoff base in seconds (default: ``cfg.HTTP_BACKOFF_BASE``).
    """

    def __init__(
        self,
        base_url: str = "",
        api_key: str = "",
        session_id: str = "",
        timeout: float | None = None,
        max_retries: int | None = None,
        backoff_base: float | None = None,
    ) -> None:
        self._base_url = (base_url or cfg.GAME_BASE_URL).rstrip("/")
        self._api_key = api_key or cfg.GAME_API_KEY          # not printed
        self._session_id = session_id or cfg.GAME_SESSION_ID
        self._timeout = timeout if timeout is not None else cfg.HTTP_TIMEOUT
        _retries = max_retries if max_retries is not None else cfg.HTTP_MAX_RETRIES
        _backoff = backoff_base if backoff_base is not None else cfg.HTTP_BACKOFF_BASE

        self._session = _build_session(_retries, _backoff)

        # Attach auth header if a key was provided — never log its value.
        if self._api_key:
            self._session.headers["Authorization"] = f"Bearer {self._api_key}"

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def session_id(self) -> str:
        return self._session_id

    @session_id.setter
    def session_id(self, value: str) -> None:
        self._session_id = value

    # ------------------------------------------------------------------
    # HTTP helpers
    # ------------------------------------------------------------------

    def _url(self, path: str) -> str:
        return self._base_url + path

    def _handle_response(self, resp: requests.Response, context: str) -> dict[str, Any]:
        """Raise a clear error if the response is not 2xx; otherwise parse JSON."""
        if resp.status_code == 400:
            try:
                body = resp.json()
            except Exception:
                body = resp.text
            raise ValueError(
                f"[http_client] {context} returned HTTP 400 (bad request): {body}"
            )
        if resp.status_code == 404:
            raise LookupError(
                f"[http_client] {context} returned HTTP 404 (not found). "
                f"URL: {resp.url}"
            )
        if resp.status_code == 422:
            try:
                body = resp.json()
            except Exception:
                body = resp.text
            raise ValueError(
                f"[http_client] {context} returned HTTP 422 (illegal move): {body}"
            )
        if not resp.ok:
            raise RuntimeError(
                f"[http_client] {context} failed with HTTP {resp.status_code}. "
                f"Body (first 200 chars): {resp.text[:200]}"
            )
        try:
            return resp.json()
        except Exception as exc:
            raise RuntimeError(
                f"[http_client] {context} returned non-JSON body: {resp.text[:200]}"
            ) from exc

    def get(self, path: str, **kwargs: Any) -> dict[str, Any]:
        """Send a GET request and return the parsed JSON body."""
        url = self._url(path)
        logger.debug("[http_client] GET %s", url)
        t0 = time.monotonic()
        resp = self._session.get(url, timeout=self._timeout, **kwargs)
        logger.debug("[http_client] GET %s → %d (%.0f ms)", url, resp.status_code,
                     (time.monotonic() - t0) * 1000)
        return self._handle_response(resp, f"GET {path}")

    def post(self, path: str, **kwargs: Any) -> dict[str, Any]:
        """Send a POST request and return the parsed JSON body."""
        url = self._url(path)
        logger.debug("[http_client] POST %s", url)
        t0 = time.monotonic()
        resp = self._session.post(url, timeout=self._timeout, **kwargs)
        logger.debug("[http_client] POST %s → %d (%.0f ms)", url, resp.status_code,
                     (time.monotonic() - t0) * 1000)
        return self._handle_response(resp, f"POST {path}")

    def close(self) -> None:
        """Close the underlying requests.Session."""
        self._session.close()

    def __enter__(self) -> "GameHTTPClient":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()
