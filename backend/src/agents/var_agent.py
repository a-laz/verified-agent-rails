"""VAR agent — the autonomous agent that operates on Verified Agent Rails.

It reasons about whether a spend is permitted by its on-chain mandate, then
pays a service or parks idle funds for yield. Every action goes through
``src.var.chain`` (the web3 wrapper) and is mirrored into box keys the VAR
dashboard widgets read (SPEC_MVP §3.2 / §3.4):

- ``var/status``   {state, action, ok, code, message, txHash}
- ``var/mandate``  {agent, human, spendCap, asset, expiry, revoked, active}
- ``var/balances`` {agentToken, serviceToken, vaultShares}
- ``var/tx_feed``  [{action, ok, code, message, txHash, amount, ts}]  (newest first, cap 20)
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, TYPE_CHECKING

from src.agentstack.agent import Agent
from src.var import chain

if TYPE_CHECKING:
    from src.agentstack.storage.base import StorageProvider

logger = logging.getLogger(__name__)

_TX_FEED_CAP = 20

# Map a (action, ok, code) into the SPEC var/status `state` enum:
#   idle | rejected | cleared | paid | parked | revoked
_State = str


def _state_for(action: str, ok: bool, code: int | None) -> _State:
    if action == "revoke":
        return "revoked"
    if action == "check":
        return "cleared" if ok else "rejected"
    if action == "pay":
        return "paid" if ok else "rejected"
    if action == "park":
        return "parked" if ok else "rejected"
    if action == "grant":
        return "cleared" if ok else "rejected"
    return "idle"


# ---------------------------------------------------------------------------
# Box helpers
# ---------------------------------------------------------------------------

def _box_status(agent: Agent, result: dict[str, Any], action: str) -> dict[str, Any]:
    status = {
        "state": _state_for(action, bool(result.get("ok")), result.get("code")),
        "action": action,
        "ok": bool(result.get("ok")),
        "code": result.get("code"),
        "message": result.get("message"),
        "txHash": result.get("txHash"),
    }
    agent.box("var/status", status)
    return status


def _box_mandate(agent: Agent) -> dict[str, Any]:
    mandate = chain.get_mandate()
    agent.box(
        "var/mandate",
        {
            "agent": mandate.get("agent"),
            "human": mandate.get("human"),
            "spendCap": mandate.get("spendCap"),
            "asset": mandate.get("asset"),
            "expiry": mandate.get("expiry"),
            "revoked": mandate.get("revoked"),
            "active": mandate.get("active"),
        },
    )
    return mandate


def _box_balances(agent: Agent) -> dict[str, Any]:
    balances = chain.get_balances()
    agent.box(
        "var/balances",
        {
            "agentToken": balances.get("agentToken"),
            "serviceToken": balances.get("serviceToken"),
            "vaultShares": balances.get("vaultShares"),
        },
    )
    return balances


def _append_tx_feed(agent: Agent, result: dict[str, Any], action: str) -> None:
    feed = agent.unbox("var/tx_feed", []) or []
    if not isinstance(feed, list):
        feed = []
    entry = {
        "action": action,
        "ok": bool(result.get("ok")),
        "code": result.get("code"),
        "message": result.get("message"),
        "txHash": result.get("txHash"),
        "amount": result.get("amount"),
        "ts": int(time.time()),
    }
    feed.insert(0, entry)  # newest first
    agent.box("var/tx_feed", feed[:_TX_FEED_CAP])


# ---------------------------------------------------------------------------
# Tools  (signature: (agent, **kwargs) -> str ; box + return json)
# ---------------------------------------------------------------------------

def _check_eligibility(agent: Agent, amount: float = 0.0) -> str:
    """Probe whether the agent may transfer `amount` gUSDC to the service."""
    units = chain.to_units(amount)
    result = chain.probe(units)
    _box_status(agent, result, "check")
    _box_mandate(agent)
    return json.dumps(result)


def _pay(agent: Agent, amount: float = 0.0) -> str:
    """Pay the service `amount` gUSDC if the mandate allows it."""
    units = chain.to_units(amount)
    result = chain.pay(units)
    _box_status(agent, result, "pay")
    _box_balances(agent)
    _append_tx_feed(agent, result, "pay")
    return json.dumps(result)


def _park_yield(agent: Agent, amount: float = 0.0) -> str:
    """Park `amount` gUSDC into the yield vault (gated by the mandate)."""
    units = chain.to_units(amount)
    result = chain.park(units)
    _box_status(agent, result, "park")
    _box_balances(agent)
    _append_tx_feed(agent, result, "park")
    return json.dumps(result)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_var_agent(storage: "StorageProvider") -> Agent:
    """Create and return the VAR agent instance."""
    agent = Agent(
        name="var-agent",
        agent_type="VAR",
        model="claude-sonnet-4-6",
        instructions=(
            "You are the VAR agent, an autonomous agent operating on Verified "
            "Agent Rails. You hold gUSDC and may only move funds within the "
            "bounds of an on-chain mandate granted by your verified human "
            "principal. Before paying a service or parking idle funds for "
            "yield, use check_eligibility to confirm the transfer is permitted. "
            "If a transfer is restricted, report the restriction code and "
            "message plainly — never attempt to bypass the rails. Use pay to "
            "send funds to the service and park_yield to deposit idle funds "
            "into the yield vault."
        ),
        storage=storage,
    )

    agent.tools.register(
        "check_eligibility",
        _check_eligibility,
        "Probe whether the agent may transfer a given amount of gUSDC to the service. Returns the restriction code (0=OK) and message without moving funds.",
        {
            "type": "object",
            "properties": {
                "amount": {
                    "type": "number",
                    "description": "Amount of gUSDC to check, in human decimal units (e.g. 100 = 100 gUSDC).",
                },
            },
            "required": ["amount"],
        },
    )

    agent.tools.register(
        "pay",
        _pay,
        "Pay the service a given amount of gUSDC. Probes eligibility first; only sends if the mandate permits it.",
        {
            "type": "object",
            "properties": {
                "amount": {
                    "type": "number",
                    "description": "Amount of gUSDC to pay the service, in human decimal units.",
                },
            },
            "required": ["amount"],
        },
    )

    agent.tools.register(
        "park_yield",
        _park_yield,
        "Park a given amount of gUSDC into the yield vault for yield. Gated by the mandate (the deposit pull is restricted-checked).",
        {
            "type": "object",
            "properties": {
                "amount": {
                    "type": "number",
                    "description": "Amount of gUSDC to park into the yield vault, in human decimal units.",
                },
            },
            "required": ["amount"],
        },
    )

    return agent
