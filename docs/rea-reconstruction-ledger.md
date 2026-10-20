# REA Reverse Engineering & Reconstruction Obligation Ledger

## 1. Authenticated REA Evidence Inventory (`rea@6.5.0`)

All reverse-engineering artifacts were generated deterministically using `/Users/men1692/Desktop/AI/rea/scripts/rea.mjs` (`analyze-javascript-application`) against downloaded open-source & production distribution bundles:

| Target Distribution | Version | REA Evidence ID | Root Artifact SHA-256 | Inventory Manifest ID | Semantic Graph Size |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`cidr-tools`** (`dist/index.js`) | `13.0.4` | `ev_0fcaead6f4cd53e6e210930a5c333e12be87b06ba5120f2449710aed8e345ba8` | `2198cdf2e9be128f2575e543b9cc8c2b54d5f0078e93b19d533bb849835bb19a` | `agm_...` (`rea-cidr-tools.json`) | `2,693` nodes / `2,428` relations |
| **`ipaddr.js`** (`lib/ipaddr.js`) | `2.5.0` | `ev_b47d4f61291f9dedcfd10625ae960054b8e85efd97daf473fac25d0f96c0aa6d` | `36d5b0012fbd9bd3f8f91f4570a7f1f3224fb2d1aea33eb959460c6ad1b67e8b` | `agm_...` (`rea-ipaddr.json`) | `2,671` nodes / `1,961` relations |
| **`luci-app-firewall`** (`rules.js`, `zones.js`, `forwards.js`) | `24.10.0` | `ev_ee089d1b0150593078dc07661106acee493af7672748a49a7200708085f3515a` | `8a31e0eb8abf74df92818d462ceecebac66e476fc2d279e426f8677fa999f5ad` | `agm_88b1a55ace91c04da0ec20d6444809bed3f9de7201758acc4b2e28b8a7477694` | `5,934` nodes / `4,870` relations |
| **`@containerlab/clab-viewer`** (`dist/component.mjs`, `viewer-CGUGxblp.js`) | `0.1.0` | `ev_274d5bef2573493c0539bf39d1f34588f43f8054a745886d302ad96a723c194d` | `26986f9a28211692ed16a31185d15eaa16e8cb9580a96a9b51820936405ecabd` | `agm_09854a8acbbdcfb3f46b9853a544c0b29dcdd37c878bface0a0f1f08eef9e055` | `100,000` nodes / `91,132` relations |

---

## 2. Reconstructed Algorithms & Obligation Mapping

| Obligation ID | Source Distribution & Function | Reconstructed Target in Repo | Verification Invariant |
| :--- | :--- | :--- | :--- |
| `REA-CIDR-01` | `cidr-tools@13.0.4` (`dist/index.js`: `subparts4`, `biggestPowerOfTwo4`, `mergeIntervalsRaw4`) | `src/core/firewallAuditEngine.ts` (`subparts4`, `mergeIntervalsRaw4`) | Bitwise `Math.clz32` and `(start & -start) >>> 0` power-of-two aligned CIDR decomposition of arbitrary `[pStart, pEnd]` IPv4 intervals. |
| `REA-CIDR-02` | `cidr-tools@13.0.4` (`dist/index.js`: `subtractSorted4`, `excludeCidr`) | `src/core/firewallAuditEngine.ts` (`excludeCidr4`) | Two-pointer sorted interval subtraction (`base \ excl`) decomposing over-permissive firewall rules (`10.0.0.0/8`, `0.0.0.0/0`) into exact residual exposed CIDR blocks (`residualCidrs`). |
| `REA-CIDR-03` | `cidr-tools@13.0.4` (`dist/index.js`: `containsCidr` coalesced sweep `cur = iv.end + 1`) | `src/core/firewallAuditEngine.ts` (`containsCoalescedCidr4`, `isPrefixSubset`) | Detects both single-rule and multi-interval coalesced prefix coverage (`10.10.20.0/25` + `10.10.20.128/25` covering `10.10.20.0/24`) for `SHADOWED` and `REDUNDANT` firewall rules. |
| `REA-LUCI-01` | `luci-app-firewall@24.10.0` (`rules.js`: `rule_proto_txt`, `rule_src_txt`, `rule_dest_txt`, `rule_target_txt`) | `src/core/firewallAuditEngine.ts` (`synthesizeLuciRuleSummary`) | Synthesizes canonical human-readable firewall match specifications (`Forwarded IPv4, protocol TCP \| From Zone [X] IP [A] ➔ To Zone [Y] IP [B], port [P] ➔ [ACCEPT/DROP]`). |
| `REA-CLAB-01` | `@containerlab/clab-viewer@0.1.0` (`dist/assets/viewer-CGUGxblp.js`: `findNodeLineRange`) | `src/adapters/clabAdapter.ts` (`findNodeLineRangeInYaml`) | Maps topology node IDs to exact `startLine` and `endLine` ranges in `topology.clab.yml`. |
