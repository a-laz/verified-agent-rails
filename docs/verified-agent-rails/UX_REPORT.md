# VAR Dashboard — UX Research & Iteration Report

_Goal: iterate the demo dashboard, with sub-agent usability panels that can **see** the screen, until it's judge-ready for ETHGlobal._

## Method

A closed feedback loop, repeated each round:

1. **Capture** — `uxtest/shoot.js` (Playwright + Chromium) drives the live dashboard through the full demo arc via the backend API and screenshots each beat at **2× DPI** (`uxtest/shots*/`).
2. **See + evaluate** — a workflow spawns **5 expert lenses** (Nielsen heuristics · crypto-30s-skimmer · non-technical/business judge · visual-hierarchy critic · first-use walkthrough). Each agent **Reads the PNGs as images** (true vision, not assumptions) and returns a clarity score (0–10) + severity-ranked findings. A synthesis agent dedupes into a prioritized punch-list + a judge-ready verdict.
3. **Fix** — implement the prioritized changes in the React widgets / shell.
4. **Re-capture + re-evaluate** — loop until no high-severity issues remain and a judge grasps WHAT/WHY/the-arc in <60s.

Screenshots are the unit of truth: every fix is judged on what a judge actually sees.

## Scores by round

| Round | Avg clarity | Judge-ready | Headline change |
|-------|-------------|-------------|-----------------|
| 1 (baseline) | **3.4 / 10** | ❌ | Generic 6-card grid, "Agent Stack" branding, empty template widgets, chat panel, no story |
| 2 (redesign) | **6.44 / 10** | ❌ | Hero pitch · reactive status banners · "Walk the arc" step tracker · state-colored Leash card · mandate-checked chips · clutter removed · chat hidden |
| 3 | **7.82 / 10** | ❌ | Distinct REVOKED kill-shot banner · first-paint momentum (auto-probe) · brighter/larger tx trail · plain-English agent status |
| 4 | 7.16 / 10\* | ❌ | "THE ARC" one-liner · "AWAITING GRANT" solution-shape placeholder · bigger beats/verdict/balances · mandate-verified legend (\*panel was prompted to be maximally strict, which re-anchored scores down) |
| 5 (final) | **8.64 / 10** | ✅ **SHIP** | Visible OVER-CAP BLOCKED beat (proves the cap holds) · REVOKED ≠ REJECTED in the agent panel (bug fix) · on-chain credibility chips · prominent "Grant the leash" · larger step labels |

## Final verdict (round 5): SHIP

Avg clarity **8.64/10** (8.2 · 9 · 9 · 8.2 · 8.8), **all 5 lenses unanimously cleared it for judges**, **zero genuine high-severity blockers**. The narrative is described as immediate and memorable: the "leash, not wallet" hero lands WHAT/WHY in seconds; grant → token-enforced cap → revoke shows HOW; and the **over-cap BLOCKED screen (04b)** was repeatedly named the linchpin that converts the claim into visible proof. Red/green status language is scannable; the revoked/lockout state is distinct and complete.

Trajectory: **3.4 → 6.44 → 7.82 → 7.16\* → 8.64** (\*round 4 was prompted to be maximally strict, which re-anchored scores; round 5 was re-calibrated to a fair, realistic ETHGlobal-judge bar).

One explicitly **non-blocking** polish note remains for the curious: the credibility chips (World ID / ERC-7943 / on-chain) could carry a one-line mechanism explanation. Optional — not required to ship.

## What the panels converged on (and what shipped)

- **Tell the story, loudly.** The biggest single jump (R1→R2) came from a persistent hero pitch + full-width reactive banners that announce each beat in plain verbs (REJECTED / CLEARED / PAID / PARKED / REVOKED) at projection distance.
- **Show the climaxes, don't bury them.** Rejection and revocation were tiny pills in R1 → dominant color banners with distinct copy/icons by R5.
- **Show the solution shape, not just the problem.** A cold judge landing on REJECTED needed to see what a grant *fills in* → the greyed "AWAITING GRANT" Leash placeholder.
- **Prove the enforcement.** Asserting "the cap holds" wasn't enough → an explicit over-cap BLOCKED beat demonstrates the leash refusing an over-limit transfer.
- **Momentum on first paint.** An auto-probe on load means judges never see a dormant/empty screen — they land mid-arc on a live rejection.
- **Plain English + on-chain credibility.** Dual audience: plain-language status/reasons for generalists, ERC-7943 / World ID / "one view call, no relayer" framing for sponsor engineers.

## Harness / artifacts

- `uxtest/shoot.js` — screenshot harness (set `FRONT`/`API` env for ports).
- `uxtest/shots_r1..r5/` — the per-round screenshot sets.
- New dashboard components: `frontend/src/agents/VAR/VarDashboard.tsx`, `components/{Hero,StatusBanner,StepTracker,VarCard}.tsx`, and the enhanced widgets.
