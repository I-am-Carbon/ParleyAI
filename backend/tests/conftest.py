import os
import sys
import tempfile
from pathlib import Path

# Use a throwaway database; must be set before the app is imported.
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{(Path(_tmp) / 'test.db').as_posix()}"
os.environ["RECRUITER_SIGNUP_CODE"] = "test-recruiter-code"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
