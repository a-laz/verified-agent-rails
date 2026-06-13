"""VAR on-chain wrapper (web3.py v7).

Talks to the locally-deployed VAR contracts (AgentBook, EligibilityResolver,
GatedToken, YieldVault). Signs with local ``eth-account`` keys for the OWNER
(principal) and AGENT roles — the Node sidecar is the production swap point
for real TSS-MPC signing.

Design notes (per SPEC_MVP §1 / §3.1):
- Deployment artifacts (`deployment.json` + `abis/*.json`) are loaded LAZILY
  so this module imports cleanly before any deploy has happened.
- Every public function returns a dict shaped ``{ok, code, message, txHash, ...}``.
- Restriction codes 0-6 are decoded from ``TransferRestricted`` reverts where
  possible and always cross-checked against the pure-view ``detect...`` probe.
- gUSDC has 6 decimals; balances are converted to human-readable decimals.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from eth_account import Account
from web3 import Web3

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TOKEN_DECIMALS = 6
_DEC_UNIT = 10 ** TOKEN_DECIMALS

# Hardhat default account private keys (SPEC §1 — PUBLIC TEST KEYS, local only).
_DEFAULT_OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
_DEFAULT_AGENT_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"

_DEFAULT_RPC_URL = "http://127.0.0.1:8545"

# Restriction codes (SPEC §2.1 — binding).
RESTRICTION_MESSAGES: dict[int, str] = {
    0: "Transfer allowed",
    1: "Sender carries no Agent Passport",
    2: "Mandate revoked by principal",
    3: "Mandate expired",
    4: "Amount exceeds per-transaction spend cap",
    5: "Asset not permitted by mandate",
    6: "Agent not anchored to a verified human",
}

# Deterministic nullifier for the local World-ID seed substitute (SPEC §0).
_LOCAL_NULLIFIER = 0x5641520000000000000000000000000000000000000000000000000000000001

# Paths to deployment artifacts written by the contracts deploy script.
_VAR_DIR = Path(__file__).resolve().parent
_DEPLOYMENT_PATH = _VAR_DIR / "deployment.json"
_ABIS_DIR = _VAR_DIR / "abis"

_CONTRACT_NAMES = ("AgentBook", "EligibilityResolver", "GatedToken", "YieldVault")


# ---------------------------------------------------------------------------
# Lazy connection state
# ---------------------------------------------------------------------------

class _ChainState:
    """Holds the connected web3 handles. Built lazily on first use."""

    def __init__(self) -> None:
        self.w3: Web3 | None = None
        self.deployment: dict[str, Any] | None = None
        self.abis: dict[str, Any] = {}
        self.contracts: dict[str, Any] = {}
        self.owner: Any = None  # eth_account LocalAccount
        self.agent: Any = None
        self.human: str | None = None
        self.service: str | None = None
        self.error: str | None = None  # last load/connect error, if any


_state: _ChainState | None = None


def _rpc_url() -> str:
    return os.getenv("CHAIN_RPC_URL", _DEFAULT_RPC_URL)


def _owner_key() -> str:
    return os.getenv("CHAIN_OWNER_KEY", _DEFAULT_OWNER_KEY)


def _agent_key() -> str:
    return os.getenv("CHAIN_AGENT_KEY", _DEFAULT_AGENT_KEY)


def _load_deployment() -> dict[str, Any]:
    if not _DEPLOYMENT_PATH.exists():
        raise FileNotFoundError(
            f"deployment.json not found at {_DEPLOYMENT_PATH}. "
            "Run the contracts deploy script first (npm --prefix contracts run deploy:local)."
        )
    with _DEPLOYMENT_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _load_abi(name: str) -> Any:
    abi_path = _ABIS_DIR / f"{name}.json"
    if not abi_path.exists():
        raise FileNotFoundError(f"ABI not found: {abi_path}")
    with abi_path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    # Tolerate either a bare ABI array or an artifact dict containing {"abi": [...]}.
    if isinstance(data, dict) and "abi" in data:
        return data["abi"]
    return data


def _connect() -> _ChainState:
    """Build (once) and return the connected chain state. Raises on failure."""
    global _state
    if _state is not None and _state.w3 is not None and _state.error is None:
        return _state

    st = _ChainState()
    try:
        deployment = _load_deployment()
        st.deployment = deployment

        w3 = Web3(Web3.HTTPProvider(_rpc_url()))
        if not w3.is_connected():
            raise ConnectionError(f"Cannot reach RPC at {_rpc_url()}")
        st.w3 = w3

        addresses = deployment.get("addresses", {})
        for name in _CONTRACT_NAMES:
            abi = _load_abi(name)
            st.abis[name] = abi
            addr = addresses.get(name)
            if not addr:
                raise KeyError(f"Address for {name} missing from deployment.json")
            st.contracts[name] = w3.eth.contract(
                address=Web3.to_checksum_address(addr), abi=abi
            )

        st.owner = Account.from_key(_owner_key())
        st.agent = Account.from_key(_agent_key())

        accounts = deployment.get("accounts", {})
        # The principal/human is the OWNER (accounts[0]); SERVICE is accounts[2].
        st.human = Web3.to_checksum_address(
            accounts.get("owner", st.owner.address)
        )
        st.service = Web3.to_checksum_address(
            accounts.get("service", st.owner.address)
        )

        st.error = None
        _state = st
        logger.info("VAR chain connected: rpc=%s agent=%s", _rpc_url(), st.agent.address)
        return st
    except Exception as exc:  # noqa: BLE001 — surface as state error, not import error
        st.error = str(exc)
        _state = st
        logger.warning("VAR chain not ready: %s", exc)
        raise


def reset() -> None:
    """Drop the cached connection (used by tests / after a redeploy)."""
    global _state
    _state = None


def is_ready() -> bool:
    """True if the chain + deployment can be reached right now."""
    try:
        _connect()
        return True
    except Exception:  # noqa: BLE001
        return False


def _not_ready_result(action: str, exc: Exception) -> dict[str, Any]:
    return {
        "ok": False,
        "code": None,
        "message": f"Chain not ready: {exc}",
        "txHash": None,
        "action": action,
    }


# ---------------------------------------------------------------------------
# Conversion helpers
# ---------------------------------------------------------------------------

def to_units(human_amount: float | int | str) -> int:
    """Human decimal -> 6-dec integer units."""
    return int(round(float(human_amount) * _DEC_UNIT))


def from_units(units: int) -> float:
    """6-dec integer units -> human decimal."""
    return int(units) / _DEC_UNIT


def _agent_addr(st: _ChainState) -> str:
    return st.agent.address


# ---------------------------------------------------------------------------
# Custom-error / restriction decoding
# ---------------------------------------------------------------------------

# 4-byte selector of TransferRestricted(uint8,string).
# web3 v7 .hex() has no "0x" prefix, so the first 8 hex chars are the 4 bytes.
_TRANSFER_RESTRICTED_SELECTOR = (
    "0x" + Web3.keccak(text="TransferRestricted(uint8,string)").hex()[:8]
)


def _detect_restriction(st: _ChainState, frm: str, to: str, amount: int) -> tuple[int, str]:
    """Pure-view probe via GatedToken.detectTransferRestriction. Never reverts."""
    token = st.contracts["GatedToken"]
    code = int(token.functions.detectTransferRestriction(frm, to, amount).call())
    msg = RESTRICTION_MESSAGES.get(code, "Unknown restriction")
    return code, msg


def _decode_transfer_restricted(exc: Exception) -> tuple[int | None, str | None]:
    """Best-effort decode of a TransferRestricted(uint8,string) revert.

    Returns (code, message) if the revert carried our custom error, else (None, None).
    """
    data = _extract_revert_data(exc)
    if not data:
        return None, None
    if isinstance(data, (bytes, bytearray)):
        data = "0x" + bytes(data).hex()
    if not isinstance(data, str):
        return None, None
    if not data.startswith("0x"):
        data = "0x" + data
    selector = data[:10].lower()
    if selector != _TRANSFER_RESTRICTED_SELECTOR.lower():
        return None, None
    try:
        body = bytes.fromhex(data[10:])
        # ABI: uint8 (right-aligned in word 0), then string (offset, len, bytes).
        code = body[31]
        # string offset is word 1 (0x20 typically), length is at that offset.
        str_offset = int.from_bytes(body[32:64], "big")
        str_len = int.from_bytes(body[str_offset:str_offset + 32], "big")
        raw = body[str_offset + 32:str_offset + 32 + str_len]
        message = raw.decode("utf-8", errors="replace")
        return int(code), message
    except Exception:  # noqa: BLE001
        return None, None


def _extract_revert_data(exc: Exception) -> Any:
    """Dig revert data out of the assorted web3 exception shapes."""
    # web3 ContractLogicError often carries .data; some carry a dict in args.
    for attr in ("data",):
        val = getattr(exc, attr, None)
        if val:
            return val
    args = getattr(exc, "args", None)
    if args:
        for a in args:
            if isinstance(a, dict):
                d = a.get("data")
                if isinstance(d, dict):
                    # {"<txhash>": {"return": "0x..."}} or {"data": "0x.."}
                    for v in d.values():
                        if isinstance(v, dict) and v.get("data"):
                            return v["data"]
                    return d.get("data")
                if d:
                    return d
            if isinstance(a, str) and a.startswith("0x") and len(a) > 10:
                return a
    return None


# ---------------------------------------------------------------------------
# Transaction sending
# ---------------------------------------------------------------------------

def _send(st: _ChainState, account: Any, fn_call: Any) -> str:
    """Build, sign (locally), and send a transaction; return the tx hash hex."""
    w3 = st.w3
    nonce = w3.eth.get_transaction_count(account.address)
    tx = fn_call.build_transaction(
        {
            "from": account.address,
            "nonce": nonce,
            "chainId": w3.eth.chain_id,
        }
    )
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    if receipt.status != 1:
        raise RuntimeError(f"Transaction reverted: {tx_hash.hex()}")
    return tx_hash.hex()


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

def get_mandate() -> dict[str, Any]:
    """Read mandates[agent] + the anchored human. Returns SPEC var/mandate shape."""
    try:
        st = _connect()
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "code": None,
            "message": f"Chain not ready: {exc}",
            "txHash": None,
            "agent": None,
            "human": None,
            "spendCap": None,
            "asset": None,
            "expiry": None,
            "revoked": None,
            "active": False,
        }

    resolver = st.contracts["EligibilityResolver"]
    book = st.contracts["AgentBook"]
    agent = _agent_addr(st)

    # struct Mandate { human, agent, spendCap, asset, expiry, revoked, exists }
    m = resolver.functions.mandates(agent).call()
    human, m_agent, spend_cap, asset, expiry, revoked, exists = (
        m[0], m[1], m[2], m[3], m[4], m[5], m[6],
    )
    anchored_human = book.functions.resolveHuman(agent).call()

    zero = "0x0000000000000000000000000000000000000000"
    active = bool(
        exists
        and not revoked
        and human != zero
        and int(expiry) > int(time.time())
        and anchored_human != zero
        and anchored_human == human
    )

    return {
        "ok": True,
        "code": 0 if active else None,
        "message": "Mandate active" if active else "Mandate inactive",
        "txHash": None,
        "agent": agent,
        "human": human if human != zero else None,
        "spendCap": from_units(spend_cap) if exists else None,
        "asset": asset if asset != zero else None,
        "expiry": int(expiry) if exists else None,
        "revoked": bool(revoked),
        "active": active,
    }


def get_balances() -> dict[str, Any]:
    """token.balanceOf(agent/service) + vault.balanceOf(agent). var/balances shape."""
    try:
        st = _connect()
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "code": None,
            "message": f"Chain not ready: {exc}",
            "txHash": None,
            "agentToken": None,
            "serviceToken": None,
            "vaultShares": None,
        }

    token = st.contracts["GatedToken"]
    vault = st.contracts["YieldVault"]
    agent = _agent_addr(st)
    service = st.service

    agent_bal = token.functions.balanceOf(agent).call()
    service_bal = token.functions.balanceOf(service).call()
    vault_shares = vault.functions.balanceOf(agent).call()

    return {
        "ok": True,
        "code": 0,
        "message": "Balances read",
        "txHash": None,
        "agentToken": from_units(agent_bal),
        "serviceToken": from_units(service_bal),
        "vaultShares": from_units(vault_shares),
    }


def probe(amount: int) -> dict[str, Any]:
    """Pure-view restriction probe for AGENT -> SERVICE of `amount` (6-dec units)."""
    try:
        st = _connect()
    except Exception as exc:  # noqa: BLE001
        return _not_ready_result("check", exc)

    code, msg = _detect_restriction(st, _agent_addr(st), st.service, int(amount))
    return {
        "ok": code == 0,
        "code": code,
        "message": msg,
        "txHash": None,
        "action": "check",
        "amount": from_units(amount),
    }


# ---------------------------------------------------------------------------
# Writes (owner)
# ---------------------------------------------------------------------------

def grant(spend_cap_6dec: int, expiry_minutes: int) -> dict[str, Any]:
    """OWNER: seed the agent's human anchor, then grant the mandate.

    Args:
        spend_cap_6dec: per-transaction spend cap in 6-dec units.
        expiry_minutes: minutes from now until the mandate expires.
    """
    try:
        st = _connect()
    except Exception as exc:  # noqa: BLE001
        return _not_ready_result("grant", exc)

    book = st.contracts["AgentBook"]
    resolver = st.contracts["EligibilityResolver"]
    token = st.contracts["GatedToken"]
    agent = _agent_addr(st)
    human = st.human
    expiry = int(time.time()) + int(expiry_minutes) * 60

    try:
        # 1. Anchor agent -> human (World-ID seed substitute, deterministic nullifier).
        seed_hash = _send(
            st,
            st.owner,
            book.functions.seed(agent, human, _LOCAL_NULLIFIER),
        )
        # 2. Grant the mandate keyed by AGENT address.
        grant_hash = _send(
            st,
            st.owner,
            resolver.functions.grantMandate(
                agent, human, int(spend_cap_6dec), token.address, expiry
            ),
        )
    except Exception as exc:  # noqa: BLE001
        code, msg = _decode_transfer_restricted(exc)
        return {
            "ok": False,
            "code": code,
            "message": msg or f"grant failed: {exc}",
            "txHash": None,
            "action": "grant",
        }

    return {
        "ok": True,
        "code": 0,
        "message": "Mandate granted",
        "txHash": grant_hash,
        "seedTxHash": seed_hash,
        "action": "grant",
        "spendCap": from_units(spend_cap_6dec),
        "expiry": expiry,
        "asset": token.address,
        "agent": agent,
        "human": human,
    }


def revoke() -> dict[str, Any]:
    """OWNER: revoke the agent's mandate (the kill shot)."""
    try:
        st = _connect()
    except Exception as exc:  # noqa: BLE001
        return _not_ready_result("revoke", exc)

    resolver = st.contracts["EligibilityResolver"]
    agent = _agent_addr(st)
    try:
        tx_hash = _send(st, st.owner, resolver.functions.revokeMandate(agent))
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "code": None,
            "message": f"revoke failed: {exc}",
            "txHash": None,
            "action": "revoke",
        }

    # Revoke is a successful OWNER operation -> code 0 (consistent with grant/pay/park).
    # The resulting NO-GO for the agent (restriction code 2) surfaces on the agent's
    # next transfer attempt / probe, not on the revoke action itself.
    return {
        "ok": True,
        "code": 0,
        "message": "Mandate revoked",
        "txHash": tx_hash,
        "action": "revoke",
        "agent": agent,
    }


# ---------------------------------------------------------------------------
# Writes (agent)
# ---------------------------------------------------------------------------

def pay(amount: int) -> dict[str, Any]:
    """AGENT: probe, then transfer `amount` (6-dec) gUSDC to SERVICE if allowed."""
    try:
        st = _connect()
    except Exception as exc:  # noqa: BLE001
        return _not_ready_result("pay", exc)

    token = st.contracts["GatedToken"]
    agent = _agent_addr(st)
    service = st.service
    amount = int(amount)

    code, msg = _detect_restriction(st, agent, service, amount)
    if code != 0:
        return {
            "ok": False,
            "code": code,
            "message": msg,
            "txHash": None,
            "action": "pay",
            "amount": from_units(amount),
        }

    try:
        tx_hash = _send(st, st.agent, token.functions.transfer(service, amount))
    except Exception as exc:  # noqa: BLE001
        d_code, d_msg = _decode_transfer_restricted(exc)
        if d_code is None:
            d_code, d_msg = _detect_restriction(st, agent, service, amount)
        return {
            "ok": False,
            "code": d_code,
            "message": d_msg,
            "txHash": None,
            "action": "pay",
            "amount": from_units(amount),
        }

    return {
        "ok": True,
        "code": 0,
        "message": RESTRICTION_MESSAGES[0],
        "txHash": tx_hash,
        "action": "pay",
        "amount": from_units(amount),
    }


def park(amount: int) -> dict[str, Any]:
    """AGENT: approve the vault then deposit `amount` (6-dec) gUSDC for yield.

    The vault pulls via transferFrom, which triggers the mandate gate on the
    agent (asset == GatedToken). approve itself is not gated.
    """
    try:
        st = _connect()
    except Exception as exc:  # noqa: BLE001
        return _not_ready_result("park", exc)

    token = st.contracts["GatedToken"]
    vault = st.contracts["YieldVault"]
    agent = _agent_addr(st)
    amount = int(amount)

    # The deposit move is gated; probe with the vault as the recipient.
    code, msg = _detect_restriction(st, agent, vault.address, amount)
    if code != 0:
        return {
            "ok": False,
            "code": code,
            "message": msg,
            "txHash": None,
            "action": "park",
            "amount": from_units(amount),
        }

    try:
        # approve (not gated)
        _send(st, st.agent, token.functions.approve(vault.address, amount))
        # deposit (pull triggers the gate on `from`)
        tx_hash = _send(
            st, st.agent, vault.functions.deposit(amount, agent)
        )
    except Exception as exc:  # noqa: BLE001
        d_code, d_msg = _decode_transfer_restricted(exc)
        if d_code is None:
            d_code, d_msg = _detect_restriction(st, agent, vault.address, amount)
        return {
            "ok": False,
            "code": d_code,
            "message": d_msg,
            "txHash": None,
            "action": "park",
            "amount": from_units(amount),
        }

    return {
        "ok": True,
        "code": 0,
        "message": "Parked for yield",
        "txHash": tx_hash,
        "action": "park",
        "amount": from_units(amount),
    }
