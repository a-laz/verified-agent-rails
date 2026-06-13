"""VAR — headless demo arc (the proof the rails work without the UI).

Walks the full Verified Agent Rails arc against a running Hardhat node, per
SPEC_MVP.md §6 step 5:

    check (expect REJECT, code 1: NO_PASSPORT)
      -> grant  (cap = 50 gUSDC, expiry 60 min)
      -> check  (expect CLEAR, code 0)
      -> pay    (10 gUSDC -> SERVICE)
      -> park   (20 gUSDC -> YieldVault)
      -> revoke
      -> check  (expect REJECT, code 2: MANDATE_REVOKED)

Each step prints its restriction code + tx hash. Any failed expectation makes
the script exit non-zero. On full success it prints the summary line "ARC OK".

Run from the backend/ directory with the project venv:

    cd backend
    ../.venv/Scripts/python.exe scripts/demo_arc.py        # Windows
    ../.venv/bin/python scripts/demo_arc.py                # POSIX

Prerequisites: hardhat node up (chain 31337) and contracts deployed
(`deployment.json` + ABIs written to backend/src/var/). See docs RUN.md.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make `from src.var.chain import ...` work whether invoked from backend/ or
# from the repo root.
_BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from src.var import chain  # noqa: E402

# ---------------------------------------------------------------------------
# Binding constants (6-decimal gUSDC; restriction codes from SPEC §2.1)
# ---------------------------------------------------------------------------
ONE = 1_000_000               # 1 gUSDC = 1e6 (6 decimals)
SPEND_CAP = 50 * ONE          # 50 gUSDC per-transaction cap
EXPIRY_MINUTES = 60           # mandate valid for 60 minutes
PAY_AMOUNT = 10 * ONE         # 10 gUSDC payment to SERVICE
PARK_AMOUNT = 20 * ONE        # 20 gUSDC swept into the YieldVault

CODE_OK = 0
CODE_NO_PASSPORT = 1
CODE_MANDATE_REVOKED = 2

# Track failures so we can run every step and report a full picture, but still
# exit non-zero if anything went wrong.
_failures: list[str] = []


# ---------------------------------------------------------------------------
# Pretty output helpers
# ---------------------------------------------------------------------------
def _hr() -> None:
    print("-" * 68)


def _fmt(amount: int) -> str:
    return f"{amount / ONE:.2f} gUSDC"


def _result_line(result: dict) -> str:
    """One-line summary of a chain.py result dict."""
    code = result.get("code")
    message = result.get("message", "")
    ok = result.get("ok")
    tx = result.get("txHash") or "-"
    return f"ok={ok} code={code} msg='{message}' tx={tx}"


def step(num: int, title: str) -> None:
    _hr()
    print(f"STEP {num}: {title}")


def expect_code(label: str, result: dict, expected: int) -> None:
    """Assert that a result dict carries the expected restriction code."""
    actual = result.get("code")
    print(f"  -> {_result_line(result)}")
    if actual == expected:
        print(f"  [PASS] {label}: code {actual} (expected {expected})")
    else:
        msg = f"{label}: got code {actual!r}, expected {expected}"
        print(f"  [FAIL] {msg}")
        _failures.append(msg)


def expect_rejected(label: str, result: dict, allowed: set[int], note: str = "") -> None:
    """Assert the transfer was REJECTED (any allowed non-zero restriction code).

    On a freshly deployed chain the agent has no mandate -> code 1 (NO_PASSPORT).
    On a re-run against a persistent chain a prior grant+revoke leaves the mandate
    present-but-revoked -> code 2 (MANDATE_REVOKED). Both are valid "rejected" first
    beats, so the demo stays repeatable without a redeploy.
    """
    actual = result.get("code")
    print(f"  -> {_result_line(result)}")
    if actual in allowed:
        extra = f" — {note}" if note else ""
        print(f"  [PASS] {label}: rejected with code {actual}{extra}")
    else:
        msg = f"{label}: got code {actual!r}, expected one of {sorted(allowed)} (rejected)"
        print(f"  [FAIL] {msg}")
        _failures.append(msg)


def expect_ok(label: str, result: dict) -> None:
    """Assert that a state-changing call succeeded (ok truthy, code 0)."""
    print(f"  -> {_result_line(result)}")
    ok = bool(result.get("ok"))
    code = result.get("code")
    if ok and (code in (CODE_OK, None)):
        print(f"  [PASS] {label}: ok (tx {result.get('txHash') or '-'})")
    else:
        msg = f"{label}: expected ok with code 0, got {_result_line(result)}"
        print(f"  [FAIL] {msg}")
        _failures.append(msg)


def show_state(prefix: str = "") -> None:
    """Print the current mandate + balances snapshot."""
    try:
        mandate = chain.get_mandate()
        balances = chain.get_balances()
    except Exception as exc:  # pragma: no cover - diagnostics only
        print(f"  (could not read state{(' ' + prefix) if prefix else ''}: {exc})")
        return
    active = mandate.get("active")
    revoked = mandate.get("revoked")
    cap = mandate.get("spendCap")
    print(
        f"  mandate: active={active} revoked={revoked} "
        f"cap={cap} human={mandate.get('human')}"
    )
    print(
        f"  balances: agent={balances.get('agentToken')} "
        f"service={balances.get('serviceToken')} "
        f"vault={balances.get('vaultShares')}"
    )


# ---------------------------------------------------------------------------
# The arc
# ---------------------------------------------------------------------------
def run() -> int:
    print("=" * 68)
    print("VAR DEMO ARC — reject -> grant -> clear -> pay -> park -> revoke -> locked-out")
    print("=" * 68)
    print(f"  RPC:          {getattr(chain, 'CHAIN_RPC_URL', '<unknown>')}")
    print(f"  spend cap:    {_fmt(SPEND_CAP)}  (per-transaction)")
    print(f"  expiry:       {EXPIRY_MINUTES} min")
    print(f"  pay amount:   {_fmt(PAY_AMOUNT)}")
    print(f"  park amount:  {_fmt(PARK_AMOUNT)}")

    # Initial state (informational — agent should currently have no mandate).
    step(0, "Initial on-chain state")
    show_state("initial")

    # 1. Pre-grant probe — the agent carries no Agent Passport yet.
    step(1, f"check eligibility for {_fmt(PAY_AMOUNT)} (expect REJECT — code 1 fresh, 2 on re-run)")
    r = chain.probe(PAY_AMOUNT)
    expect_rejected(
        "pre-grant probe",
        r,
        {CODE_NO_PASSPORT, CODE_MANDATE_REVOKED},
        "1=NO_PASSPORT (fresh deploy), 2=MANDATE_REVOKED (re-run)",
    )

    # 2. Human grants the mandate (seeds AgentBook + writes the scoped mandate).
    step(2, f"grant mandate (cap {_fmt(SPEND_CAP)}, expiry {EXPIRY_MINUTES} min)")
    r = chain.grant(SPEND_CAP, EXPIRY_MINUTES)
    expect_ok("grantMandate", r)
    show_state("after grant")

    # 3. Post-grant probe — same view call now clears.
    step(3, f"check eligibility for {_fmt(PAY_AMOUNT)} (expect CLEAR, code 0)")
    r = chain.probe(PAY_AMOUNT)
    expect_code("post-grant probe (CLEAR)", r, CODE_OK)

    # 4. Agent pays the SERVICE — gated transfer that should go through.
    step(4, f"pay SERVICE {_fmt(PAY_AMOUNT)} (expect tx success)")
    r = chain.pay(PAY_AMOUNT)
    expect_ok("pay", r)
    show_state("after pay")

    # 5. Agent parks idle funds into the whitelisted YieldVault.
    step(5, f"park {_fmt(PARK_AMOUNT)} into YieldVault (expect tx success)")
    r = chain.park(PARK_AMOUNT)
    expect_ok("park", r)
    show_state("after park")

    # 6. THE KILL SHOT — human revokes the mandate.
    step(6, "revoke mandate (the kill shot)")
    r = chain.revoke()
    expect_ok("revokeMandate", r)
    show_state("after revoke")

    # 7. Post-revoke probe — the agent is instantly locked out.
    step(7, f"check eligibility for {_fmt(PAY_AMOUNT)} (expect REJECT, code 2)")
    r = chain.probe(PAY_AMOUNT)
    expect_code("post-revoke probe (MANDATE_REVOKED)", r, CODE_MANDATE_REVOKED)

    # Summary
    _hr()
    if _failures:
        print(f"ARC FAILED — {len(_failures)} expectation(s) not met:")
        for f in _failures:
            print(f"  - {f}")
        return 1

    print("ARC OK")
    return 0


def main() -> int:
    try:
        return run()
    except Exception as exc:  # connection refused, missing deployment, etc.
        _hr()
        print(f"ARC ERRORED — unhandled exception: {type(exc).__name__}: {exc}")
        print(
            "  Is the hardhat node running (chain 31337) and are the contracts "
            "deployed?\n  See docs/verified-agent-rails/RUN.md."
        )
        return 2


if __name__ == "__main__":
    sys.exit(main())
