r"""
Build Puranic Models (Master Entrypoint Bridge)
Author: Milestone 1 Worker (worker_m1_1)
Delegates directly to build_baahubali_puranic_models.py master organic sculpting pipeline.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from build_baahubali_puranic_models import (
    build_organic_padati as build_padati,
    build_organic_gajadhvaja as build_gajadhvaja,
    build_organic_ashvarohi as build_ashvarohi,
    build_organic_ratha as build_ratha,
    build_organic_maharani as build_maharani,
    build_organic_samrat as build_samrat,
)

if __name__ == '__main__':
    print("Executing Master Puranic Model Pipeline...")
    build_padati()
    build_gajadhvaja()
    build_ashvarohi()
    build_ratha()
    build_maharani()
    build_samrat()
    print("All Master Puranic Models Generated Successfully.")
