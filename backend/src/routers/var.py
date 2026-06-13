"""VAR router — POST/GET /api/var/* for the Verified Agent Rails demo arc.

Endpoints (SPEC_MVP §3.3). Each handler calls the on-chain wrapper
(``src.var.chain``) and refreshes the relevant box keys (via the VAR agent's
``box`` so they land under the ``VAR`` agent_type) so the dashboard widgets
update without waiting on the agent loop:

  POST /api/var/grant   {spendCap, expiryMinutes}  -> grant mandate, box var/mandate
  POST /api/var/revoke                              -> revoke mandate, box var/mandate
  POST /api/var/pay     {amount}                    -> pay service
  POST /api/var/park    {amount}                    -> park into yield vault
  POST /api/var/check   {amount}                    -> probe restriction code
  GET  /api/var/state                               -> {mandate, balances} (also boxes them)
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

from src.agents import get_agent
from src.var import chain

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/var", tags=["var"])

_TX_FEED_CAP = 20


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class GrantBody(BaseModel):
    spendCap: float
    expiryMinutes: int = 60


class AmountBody(BaseModel):
    amount: float


# ---------------------------------------------------------------------------
# Box refresh helpers (mirror the var_agent box shapes / SPEC §3.4)
# ---------------------------------------------------------------------------

def _var_agent(request: Request):
    return get_agent("VAR", request.app.state.storage)


def _state_for(action: str, ok: bool) -> str:
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


def _box_status(agent, result: dict[str, Any], action: str) -> None:
    agent.box(
        "var/status",
        {
            "state": _state_for(action, bool(result.get("ok"))),
            "action": action,
            "ok": bool(result.get("ok")),
            "code": result.get("code"),
            "message": result.get("message"),
            "txHash": result.get("txHash"),
        },
    )


def _box_mandate(agent) -> dict[str, Any]:
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


def _box_balances(agent) -> dict[str, Any]:
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


def _append_tx_feed(agent, result: dict[str, Any], action: str) -> None:
    feed = agent.unbox("var/tx_feed", []) or []
    if not isinstance(feed, list):
        feed = []
    feed.insert(
        0,
        {
            "action": action,
            "ok": bool(result.get("ok")),
            "code": result.get("code"),
            "message": result.get("message"),
            "txHash": result.get("txHash"),
            "amount": result.get("amount"),
            "ts": int(time.time()),
        },
    )
    agent.box("var/tx_feed", feed[:_TX_FEED_CAP])


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/grant")
async def grant(body: GrantBody, request: Request):
    """OWNER grants the agent a mandate (spend cap + expiry)."""
    agent = _var_agent(request)
    spend_cap_units = chain.to_units(body.spendCap)
    result = chain.grant(spend_cap_units, body.expiryMinutes)
    _box_status(agent, result, "grant")
    _box_mandate(agent)
    _box_balances(agent)
    _append_tx_feed(agent, result, "grant")
    return result


@router.post("/revoke")
async def revoke(request: Request):
    """OWNER revokes the agent's mandate (the kill shot)."""
    agent = _var_agent(request)
    result = chain.revoke()
    _box_status(agent, result, "revoke")
    _box_mandate(agent)
    _append_tx_feed(agent, result, "revoke")
    return result


@router.post("/pay")
async def pay(body: AmountBody, request: Request):
    """AGENT pays the service if the mandate permits it."""
    agent = _var_agent(request)
    units = chain.to_units(body.amount)
    result = chain.pay(units)
    _box_status(agent, result, "pay")
    _box_balances(agent)
    _append_tx_feed(agent, result, "pay")
    return result


@router.post("/park")
async def park(body: AmountBody, request: Request):
    """AGENT parks idle funds into the yield vault."""
    agent = _var_agent(request)
    units = chain.to_units(body.amount)
    result = chain.park(units)
    _box_status(agent, result, "park")
    _box_balances(agent)
    _append_tx_feed(agent, result, "park")
    return result


@router.post("/check")
async def check(body: AmountBody, request: Request):
    """Probe the restriction code for an agent -> service transfer of `amount`."""
    agent = _var_agent(request)
    units = chain.to_units(body.amount)
    result = chain.probe(units)
    _box_status(agent, result, "check")
    _box_mandate(agent)
    return result


@router.get("/state")
async def state(request: Request):
    """Return the current mandate + balances (and refresh their box keys)."""
    agent = _var_agent(request)
    mandate = _box_mandate(agent)
    balances = _box_balances(agent)
    return {"mandate": mandate, "balances": balances}
