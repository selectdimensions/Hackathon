"""Put this directory on sys.path so flat modules (protocol_constants, the
classifier modules) import cleanly from tests/ without packaging."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
