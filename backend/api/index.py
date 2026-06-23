"""Vercel serverless entrypoint.

Vercel's Python runtime detects the ASGI `app` exported here. We add the backend
root to sys.path so `app.main` resolves regardless of the function's CWD.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app  # noqa: E402

__all__ = ["app"]
