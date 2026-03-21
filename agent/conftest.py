"""Root conftest.py — adds the agent package directory to sys.path."""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
