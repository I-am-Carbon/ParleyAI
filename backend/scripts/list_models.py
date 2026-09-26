"""List the models your LLM key can use (run from the backend/ folder).

    python scripts/list_models.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config  # noqa: E402
from app.services.llm import _get_client  # noqa: E402

models = sorted(m.id for m in _get_client().models.list())
print(f"Provider: {config.LLM_BASE_URL}")
print(f"Configured: LLM_MODEL_FAST={config.LLM_MODEL_FAST}  LLM_MODEL_REPORT={config.LLM_MODEL_REPORT}\n")
for name in models:
    marker = "  <- in use" if name in (config.LLM_MODEL_FAST, config.LLM_MODEL_REPORT) else ""
    print(f"  {name}{marker}")
