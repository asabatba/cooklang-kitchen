import time
from collections import defaultdict
from threading import Lock

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 300

_lock = Lock()
_failures: dict[str, list[float]] = defaultdict(list)


def is_locked_out(key: str) -> tuple[bool, float]:
    """Return (locked_out, retry_after_seconds)."""
    now = time.time()
    with _lock:
        attempts = [t for t in _failures[key] if now - t < WINDOW_SECONDS]
        _failures[key] = attempts
        if len(attempts) >= MAX_ATTEMPTS:
            retry_after = WINDOW_SECONDS - (now - attempts[0])
            return True, max(0.0, retry_after)
        return False, 0.0


def record_failure(key: str) -> None:
    with _lock:
        _failures[key].append(time.time())


def record_success(key: str) -> None:
    with _lock:
        _failures.pop(key, None)
