"""VAR (Verified Agent Rails) backend package.

Holds the on-chain wrapper (`chain.py`) and the deployment artifacts
(`deployment.json` + `abis/*.json`) written by the contracts deploy script.

The chain wrapper connects lazily so this package stays importable even
before any contract has been deployed.
"""

from __future__ import annotations
