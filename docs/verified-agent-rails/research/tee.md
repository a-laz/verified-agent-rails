# TEE & Verifiable Agent Execution — Research

_Confidential-computing rail for VAR's STRETCH goal: prove the agent loop ran in genuine hardware-isolated silicon, with remote attestation surfaced in the UI and optionally anchored on-chain._

**Feasibility verdict: FEASIBLE — but this is STRETCH, not hot-path. Drop it freely if hours run short.** Phala Cloud + the `dstack` Python SDK is the only of five platforms that fits a 36h budget (3–5 min deploy vs AWS Nitro's weeks). The full integration is ~6–10h of work (1–2h to instrument the FastAPI loop, ~30min UI badge, +2–3h if anchoring on-chain). Critically, **TEE attestation lives entirely outside VAR's accountability hot path** (ERC-7943 → ERC-8226 → AgentBook), so it adds "verified execution" proof without touching the single-VIEW-call invariant. Risk #5/#11 on the cut ladder — build the grant→pay→revoke kill-shot first, bolt TEE on last.

---

## 1. Platform decision (5 evaluated, 1 chosen)

| Platform | Verdict | Deploy time | Why / Why not | Confidence |
|----------|---------|-------------|---------------|------------|
| **Phala Cloud (dstack / Intel TDX)** | ✅ **CHOSEN** | **3–5 min** | Pre-built Eliza + ERC-8004 templates, Python `dstack-sdk`, free credits, Trust Center attestation widget, dcap-qvl offline verify. Only platform that fits 36h. | high |
| Intel TDX (Azure GA / AWS / bare-metal) | ⚠️ production-ready, too slow | hours–days | Azure TDX CVMs are GA (DCesv6/ECesv6, 5th Gen Xeon) but managed-infra setup overhead is unsuitable for a hackathon. This is what Phala runs *underneath*. | high |
| AWS Nitro Enclaves | ❌ rejected | "2–4 weeks" ⚠️ verify | Mature, KMS-integrated, CBOR+COSE_Sign1 attestation — but VPC/enclave-build/cert-management overhead. The "2–4 weeks" figure is in VAR docs but **unverified in primary sources**. | high (tech) / low (timeline) |
| Marlin Oyster | ❌ wrong shape | — | Off-chain **relay** verification (job posted on-chain → gateway → TEE/ZK worker → proof back). Sui Nautilus integration. NOT direct agent hosting. | high |
| iExec + Intel TDX / Secret Network | ⚠️ fallback only | more overhead | iExec ElizaOS-on-TDX PoC exists (SMS credential mgmt, Scone/Gramine). Secret Network–Eliza Labs privacy partnership (Feb 2025). Phala remains primary; treat as plan-C. | medium |

> ⚠️ **verify**: Round 5 found **no** documented Secret/iExec integration inside ElizaOS as of 2026 ("@elizaos/plugin-tee" → Phala is the primary path); earlier-round Secret/iExec claims are partially superseded. Don't promise iExec fallback in the demo without re-checking the repo.

---

## 2. What this unblocks for the build

1. **TEE platform is locked: Phala Cloud dstack.** No further evaluation needed. Lock in hour 0 of the STRETCH window.
2. **Attestation surface = `dstack` quote at checkpoints.** Instrument the FastAPI agent loop with `get_quote()` at 3 points: `agent-initialized`, `payment-executed`, `yield-parked`. MVP can do startup-only.
3. **UI path = box → widget OR Phala Trust Center iframe.** Either box the quote JSON (`agent.box("var/attestation", …)`) and render a `VerifiedExecutionBadge`, or drop in Phala's pre-built Trust Center widget (`trust.phala.com/widget/app/<app-id>`).
4. **Verification = offline `dcap-qvl`.** Zero-trust, no Intel-cloud round-trip. ~1h setup (PCK cert chain + TCB collateral).
5. **On-chain anchoring is OPTIONAL.** ERC-8004 Identity/Validation Registry can record the attestation, but it is **not** required for the demo narrative and does **not** sit on the hot path. Defer unless a bounty demands mainnet registration.
6. **TEE is decoupled from accountability.** Revocation/mandate logic stays in ERC-7943→ERC-8226→AgentBook (single VIEW call). TEE proves *execution integrity*, a separate axis. This protects the "zero new trust assumptions" claim — TEE is additive evidence, not a new dependency in the transfer path.

---

## 3. Concrete artifacts

### 3.1 Phala `dstack` Python SDK — quote generation

`pip install dstack-sdk`. Connects to the CVM Unix socket at `/var/run/dstack.sock` (must be mounted into the container).

```python
from dstack_sdk import DstackClient

client = DstackClient()                      # auto-connects to /var/run/dstack.sock
report_data = b"agent:var:checkpoint:payment"  # up to 64 bytes; SHA-256 if larger
resp = client.get_quote(report_data)
# resp.quote          -> str, hex-encoded TDX quote
# resp.event_log      -> str, JSON of measured RTMR events
# resp.replay_rtmrs() -> dict, recompute RTMR{0..3} from event log
# (decode_quote() / decode_event_log() helpers also exist)
```

> ⚠️ **verify**: across rounds the response type was reported as `GetQuoteResponse` (R1/R5) and `QuoteResult` (R3/R4), and field naming drifted (`vm_config` vs `replay_rtmrs()`). The **socket path, `get_quote(bytes≤64)` shape, and `quote`/`event_log` fields are consistent and high-confidence**; pin the exact return type against the installed SDK version in hour 0 (R5 cites `dstack-sdk 0.5.4b1` in the FastAPI×dstack template). Source: <https://github.com/Dstack-TEE/dstack/blob/master/sdk/python/README.md>, <https://docs.phala.com/phala-cloud/attestation/get-attestation>

### 3.2 RTMR layout & event-log replay (what the quote actually measures)

| Register | Measures | Confidence |
|----------|----------|------------|
| RTMR0 | firmware / hardware config | high |
| RTMR1 | Linux kernel | high |
| RTMR2 | kernel params / initrd | high |
| RTMR3 | **app compose-hash + runtime** (app-id, compose-hash = SHA-256 of `app_compose.json`, instance-id, key-provider) | high |

Each register extends as `RTMR = SHA384(RTMR ‖ event)`. Replaying the event log and matching the computed RTMR3 against the quote's RTMR3 proves the event log (and thus the code measurement) is authentic. RTMR0–2 can be reproduced independently with the `dstack-mr` tool.

```python
# event-log replay (pseudo) — authenticates compose_hash / instance_id / os_image_hash
rtmr = bytes(48)                              # SHA384 = 48 bytes
for ev in json.loads(resp.event_log):
    digest = sha384(b"0x08000001:" + ev["name"].encode() + b":" + json.dumps(ev["payload"]).encode())
    rtmr   = sha384(rtmr + digest)
assert rtmr == rtmr3_from_quote               # event log is authentic
```

Source: <https://docs.phala.com/phala-cloud/attestation/verify-the-platform>

### 3.3 Offline quote verification — `dcap-qvl`

`pip install dcap-qvl`. Pure-Rust core with Python bindings; verifies the TDX quote ECDSA signature, PCK cert chain, and TCB version **offline** (no Intel Trust Authority call) given cached collateral.

```python
from dcap_qvl import verify_quote
ok = verify_quote(quote_bytes, collateral_bytes, current_time)  # -> bool / result
# collateral = Intel-issued PCK cert chain + CRL + TCB Info (from Intel PCS)
```

> ⚠️ **verify**: version drift across rounds (`0.3.9` R3, `0.3.13` R4). R3 notes a patched **CVE-2026-22696** (missing QE Identity signature verification) — use a recent version. Cold-start latency on first verification (collateral fetch) is **unknown**; test early; Phala CVM images may pre-cache collateral. Source: <https://pypi.org/project/dcap-qvl/>

### 3.4 FastAPI integration (box the quote for the dashboard)

Follows VAR's `(agent, **kwargs) -> str` + `agent.box(...)` convention.

```python
# backend/src/agents/var.py  (STRETCH instrumentation)
from dstack_sdk import DstackClient
import hashlib, json, time

def attest_checkpoint(agent, label: str, state: dict) -> dict:
    client = DstackClient()                                   # /var/run/dstack.sock
    report_data = hashlib.sha256(json.dumps(state).encode()).digest()  # 32 bytes ≤ 64
    resp = client.get_quote(report_data)
    quote_json = {
        "checkpoint": label,                                  # agent-initialized | payment-executed | yield-parked
        "quote_hex": resp.quote,
        "event_log": resp.event_log,
        "rtmr3": resp.replay_rtmrs().get("rtmr3"),
        "ts": time.time(),
        "verified": False,                                    # UI / dcap-qvl verifies
    }
    agent.box("var/attestation", quote_json)                  # → BoxCache → widget
    return json.dumps(quote_json)
```

```dockerfile
# Dockerfile — REQUIRED: mount the dstack socket into the CVM container
# (volume/mount from host) /var/run/dstack.sock -> /var/run/dstack.sock
```

Source: <https://github.com/Phala-Network/phala-cloud-python-starter>

### 3.5 Frontend — attestation badge (reads box, never calls API directly)

```tsx
// frontend/src/agents/VAR/components/widgets/VerifiedExecutionBadge.tsx
"use client";
import { useBox } from "@/contexts/BoxCacheContext";

export function VerifiedExecutionBadge() {
  const att = useBox<{ quote_hex: string; checkpoint: string }>("var/attestation");
  if (!att) return <div>Initializing TEE…</div>;
  return (
    <div style={{
      background: "var(--glass-bg)",
      border: "1px solid var(--accent)",
      borderRadius: "var(--r-card)",
      padding: "var(--sp-3)",
    }}>
      <strong>Verified Execution</strong> · {att.checkpoint}
      <code>{att.quote_hex.slice(0, 32)}…</code>
    </div>
  );
}
```

**Alternative — Phala Trust Center widget (pre-built, ~30 min):** set `TRUST_CENTER_URL=https://trust.phala.com/widget/app/<dstack-app-id>`, expose a backend `/api/trust-center-url` endpoint returning `{trust_center_url}`, and load `https://trust.phala.com/trust-center.js` which injects a floating button + modal iframe showing hardware verification, source-code hash, OS integrity, and key management. Source: <https://docs.phala.com/phala-cloud/attestation/trust-center-verification>

### 3.6 dstack HTTP/socket API (no-SDK fallback)

```
POST  unix:/var/run/dstack.sock  /v0/quote   (older path: /var/run/tappd.sock)
Body:     {"reportData": "<≤64 bytes hex>"}
Response: {"quote": "<TDX quote hex>", "eventLog": {...}}
```
Source: <https://github.com/Dstack-TEE/dstack/blob/master/sdk/curl/api.md>

### 3.7 On-chain anchoring — ERC-8004 (OPTIONAL, off hot path)

ERC-8004 (Draft, mainnet Jan 29 2026) is the agent-identity standard; its **Validation Registry** has hooks intended for TEE oracles / zkML / stake-secured re-execution, so a Phala attestation can be recorded as agent-capability evidence. Three registries: Identity (ERC-721 + URIStorage), Reputation, Validation.

```solidity
// ERC-8004 Identity Registry
function register(string calldata agentURI, MetadataEntry[] calldata metadata) external returns (uint256 agentId);
function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external; // EIP-712
function getAgentWallet(uint256 agentId) external view returns (address);

// ERC-8004 Validation Registry (record attestation evidence)
function validationRequest(address validatorAddress, uint256 agentId, string calldata requestURI, bytes32 requestHash) external;
// validationResponse(requestHash, response, responseURI, responseHash, tag) — see ⚠️ below
```

| Contract | Network | Address | Confidence |
|----------|---------|---------|------------|
| ERC-8004 Identity Registry | Ethereum mainnet | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | high |
| ERC-8004 Identity Registry | Sepolia | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | high |
| ERC-8004 Reputation Registry | Ethereum mainnet | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | high |
| ERC-8004 Reputation Registry | Sepolia | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | high |

> ⚠️ **verify**: `MetadataEntry[]` struct schema is **not** in the public spec fetch — read the Solidity in `erc-8004-contracts` directly to learn how to encode a TEE attestation hash. Whether `validationResponse`'s `response` field can carry the raw quote (bytes) vs a score (uint8) is **unverified**. These are deferred-to-Phase-2 details; not demo-blocking. Sources: <https://eips.ethereum.org/EIPS/eip-8004>, <https://etherscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432>, GitHub `erc-8004/erc-8004-contracts`.

### 3.8 AWS Nitro attestation (reference only — rejected platform)

CBOR-encoded, COSE_Sign1 (ES384 / ECDSA-384). Fields: `module_id, timestamp, digest, pcrs, certificate, cabundle, public_key?, user_data?, nonce?`. Verify with Python `cbor2` + `cose`; validate cert chain against the AWS Nitro PKI root (`AWS_NitroEnclaves_Root-G1.zip`).

```python
import cbor2
data = cbor2.loads(attestation_doc_bytes)   # COSE_Sign1 = CBOR tag 18
# verify ES384 sig with EC2 key, then validate cert chain vs AWS Nitro PKI
```
Source: <https://github.com/aws/aws-nitro-enclaves-nsm-api>

---

## 4. Latency & cost facts (build-planning inputs)

| Fact | Value | Implication for VAR | Confidence |
|------|-------|---------------------|------------|
| TDX quote generation | tens–hundreds ms (typ. <500ms) | Fine for **checkpoint** attestation (init/payment/yield). **Do NOT** call `get_quote()` per-transfer or in the on-chain hot path. | high |
| TDX runtime overhead | 3–7% (5.2% measured on H200, May 2026) | Negligible for an agent loop. | high |
| Phala Eliza deploy | 3–5 min | Beats every other platform; fits 36h. | high |
| Phala pricing | $20 free credits + 1 free CVM; then $0.06/vCPU·h (Small) → $0.23 (Large) | Free tier covers the demo. | high |
| Phala hackathon credits | "$400" (earlier rounds) | ⚠️ **verify** — R4/R5 only re-confirmed the **$20 base** tier; the $400 figure is from X posts, may be event-specific. Don't bank on it. | medium |

---

## 5. How TEE sits relative to VAR's core stack

```
HOT PATH (untouched by TEE — single on-chain VIEW call on Arc):
  token.transfer → ERC-7943 canTransfer → ERC-8226 isActiveForAmount → AgentBook(Arc mirror)
                                                                         ↑ seeded once by World ID proof

STRETCH (off-path, additive evidence):
  agent loop (inside Phala TDX CVM)
     ├─ get_quote(init)     ─┐
     ├─ get_quote(payment)  ─┼─► agent.box("var/attestation") ─► VerifiedExecutionBadge / Trust Center
     └─ get_quote(yield)    ─┘                                └─► (optional) ERC-8004 Validation Registry
```

Cross-domain interface signatures VAR depends on (carried for context; owned by their respective domain docs — see `03_CONTRACTS.md`):

```solidity
function canTransfer(address from, address to, uint256 amount) external view returns (bool allowed);          // ERC-7943 FINAL
function isActiveForAmount(uint256 agentId, address principal, uint256 amount) public view returns (bool);     // ERC-8226 — VAR's OWN draft, NOT a live EIP
```

> **Critical, repeatedly confirmed:** **ERC-8226 does not exist as a published EIP.** Searches of eips.ethereum.org / Ethereum Magicians / GitHub found no ERC-8226. VAR *proposes* this composition; VAR owns the `isActiveForAmount` surface. Lock its signature (and whether it carries an `asset` param) in hour 2 before any agent-loop/UI code references it. This is a VAR-contracts concern, not a TEE one, but it gates the on-chain anchoring story. Source: <https://eips.ethereum.org/erc>, `03_CONTRACTS.md`.

---

## 6. Residual open questions

| # | Question | Why it matters | Suggested resolution |
|---|----------|----------------|----------------------|
| Q1 | Can the **existing FastAPI agent-stack-template loop** be Docker-containerized for dstack, or must STRETCH use the Eliza framework? | Determines whether TEE reuses VAR's backend or forks to Eliza. | dstack accepts any Docker image → VAR container *should* work, but **untested**. Spike a hello-world CVM with the socket mounted in hour 0 of STRETCH. |
| Q2 | Does **Dynamic TSS-MPC** signing work inside a TEE with restricted network egress? | The agent signs via Dynamic from inside the CVM. | MPC is built for distributed signing, likely OK, but CVM network model is constrained. Verify; fallback = sign outside CVM (attestation still proves loop integrity). |
| Q3 | Exact installed `dstack-sdk` return type & fields (`GetQuoteResponse` vs `QuoteResult`, `vm_config` presence)? | Code won't compile against the wrong shape. | `pip show dstack-sdk` + read the installed README; pin version. |
| Q4 | `dcap-qvl` collateral: fetch dynamically from Intel PCS or pre-cache? Cold-start latency? | Affects whether offline verify is demo-fast. | Test first quote-verify early; check if Phala CVM image pre-caches PCS collateral. |
| Q5 | Should the quote anchor **on-chain** (ERC-8004 Validation Registry), surface **UI-only** (Trust Center/badge), or both? | Scope decision. | **UI-only for MVP** (~30 min). On-chain = +2–3h custom contract, defer. |
| Q6 | What does the checkpoint `reportData` encode — just "code ran in TEE", or app state (payment hash, yield addr)? | Designs the SHA-256 binding. | Bind app state: `report_data = sha256(agentId ‖ amount ‖ yieldAddr)` → stronger audit. |
| Q7 | Is `recordExecution` (ERC-8226) a state-write on the hot path, or only for cumulative caps? | A write on the transfer path breaks the "pure VIEW" invariant. | VAR MVP uses **per-tx caps (pure view)**; confirm no mandatory write. (VAR-contracts concern.) |
| Q8 | Are there production VAR-style agents on Phala today; any `get_quote()` load issues / RTMR replay quirks? | Unknown-unknowns under demo load. | Smoke-test under repeated calls before the demo. |
| Q9 | Phala dstack **attestation-pipeline hardening** (Jan–Feb 2026, post-Rahul-Saxena disclosure): is the deployed image patched? | Security correctness of the proof. | Confirm latest dstack image; "Secure-by-Default" fixes removed client-controlled PCCS URL, added QE-identity checks. Source: <https://phala.com/posts/dstack-security-update-attestation-pipeline-hardening>. |
| Q10 | Portability if VAR later moves off Phala (Secret/Oasis ROFL)? | Lock-in concern, post-hackathon. | `get_quote`-style API is roughly portable across TDX platforms; not a 36h concern. |

---

## 7. Sources

**Phala / dstack**
- dstack Python SDK README — <https://github.com/Dstack-TEE/dstack/blob/master/sdk/python/README.md>
- dstack curl/socket API — <https://github.com/Dstack-TEE/dstack/blob/master/sdk/curl/api.md>
- Get attestation — <https://docs.phala.com/phala-cloud/attestation/get-attestation>
- Verify the platform (RTMR/event-log replay) — <https://docs.phala.com/phala-cloud/attestation/verify-the-platform>
- Verify your application — <https://docs.phala.com/phala-cloud/attestation/verify-your-application>
- Trust Center widget — <https://docs.phala.com/phala-cloud/attestation/trust-center-verification>
- Deploy ERC-8004 agent (5-min template) — <https://docs.phala.com/phala-cloud/getting-started/explore-templates/deploy-erc-8004-agent>
- Launch an Eliza agent — <https://docs.phala.com/phala-cloud/getting-started/explore-templates/launch-an-eliza-agent>
- Cloud CLI deployment — <https://docs.phala.network/phala-cloud/phala-cloud-user-guides/advanced-deployment-options/start-from-cloud-cli>
- Python starter template — <https://github.com/Phala-Network/phala-cloud-python-starter>
- Pricing — <https://phala.com/pricing>
- Eliza V2 + TEE — <https://phala.com/posts/launch-eliza-v2-beta-agent-swarms-with-tee-security-on-phala-cloud>
- Attestation-pipeline hardening (Jan–Feb 2026) — <https://phala.com/posts/dstack-security-update-attestation-pipeline-hardening>
- TDX attestation report dev guide — <https://phala.com/posts/understanding-tdx-attestation-reports-a-developers-guide>

**Intel TDX / verification**
- Evaluating Intel TDX for Production Workloads 2026 (latency/overhead) — <https://openmetal.io/resources/blog/evaluating-intel-tdx-for-production-workloads-in-2026/>
- `dcap-qvl` (PyPI) — <https://pypi.org/project/dcap-qvl/>
- Intel DCAP QVL — <https://github.com/intel/SGX-TDX-DCAP-QuoteVerificationLibrary> · <https://github.com/intel/confidential-computing.tee.dcap.qvl>
- Azure Intel TDX CVMs GA — <https://techcommunity.microsoft.com/blog/azureconfidentialcomputingblog/announcing-general-availability-of-azure-intel%C2%AE-tdx-confidential-vms/4495693>
- dstack RTMR3 calc — <https://github.com/Phala-Network/meta-dstack/blob/main/scripts/calc_rtmr3.py>

**AWS Nitro (rejected, reference)**
- NSM attestation process — <https://github.com/aws/aws-nitro-enclaves-nsm-api/blob/main/docs/attestation_process.md>
- Nitro Enclaves user guide — <https://docs.aws.amazon.com/enclaves/latest/user/nitro-enclave.html>
- NitroTPM attestation validation — <https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/nitrotpm-attestation-document-validate.html>

**Marlin / iExec / Secret**
- Marlin Oyster intro — <https://docs.marlin.org/oyster/introduction-to-marlin/>
- Oyster verifiable computing — <https://docs.marlin.org/oyster/introduction-to-marlin/verifiable-computing>
- Marlin × Sui Nautilus — <https://blog.marlin.org/scaling-confidential-compute-on-sui-nautilus-and-marlin-oyster-integration>
- iExec ElizaOS on TDX — <https://github.com/iExecBlockchainComputing/iexec-elizaos-agent>
- Secret Network × Eliza Labs — <https://scrt.network/blog/secret-network-and-eliza-labs-join-forces>

**Standards / on-chain**
- ERC-8004 (agent identity, Draft) — <https://eips.ethereum.org/EIPS/eip-8004>
- ERC-8004 Identity Registry (mainnet) — <https://etherscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432>
- ERC-7943 Final status — <https://www.globenewswire.com/news-release/2026/05/27/3301737/0/en/erc-7943-achieves-final-status-as-ethereums-standard-for-real-world-asset-tokenization.html>
- ERC index (ERC-8226 absence confirmed) — <https://eips.ethereum.org/erc>

**Arc / Circle (settlement context)**
- Arc L1 introduction — <https://www.circle.com/blog/introducing-arc-an-open-layer-1-blockchain-purpose-built-for-stablecoin-finance>
- Arc testnet chain — <https://chainlist.org/chain/5042002>

**VAR internal docs**
- `docs/verified-agent-rails/03_CONTRACTS.md` (interface signatures, Mandate struct, restriction codes)
- `docs/verified-agent-rails/06_BUILD_PLAN.md` (Arc RPC/USDC/faucet)
- `docs/verified-agent-rails/08_RISKS.md` (chain topology, EIP-draft, cut ladder)
