CoPrompt v2 — GPT‑4.1‑mini + Pre‑Paid Credits

## 1. Purpose

Ship a token‑metered, credit‑based billing system powered exclusively by GPT‑4.1‑mini that removes BYOK friction and lets early adopters buy cheap, transparent "credits" instead of a recurring subscription.

## 2. Background & Context

Current extension uses users' own API keys (BYOK) → high friction, no LTV.

We've verified GPT‑4.1‑mini delivers superior output at ~$0.001 / prompt (avg ~845 in + 422 out tokens).

We want to monetise through credit packs (250 cr = US $5) while keeping COGS < 10 %.

## 3. Goals & Success Metrics

| Goal                       | KPI                                  | Target                   |
| -------------------------- | ------------------------------------ | ------------------------ |
| Reduce onboarding friction | % new users completing first enhance | +40 % vs BYOK baseline   |
| Monetise                   | Paid conversion (first 30 days)      | ≥ 7 % of activated users |
| Protect margin             | Gross margin                         | ≥ 85 % monthly           |
| Detect breakages fast      | MTTD selector failures               | < 10 min                 |

## 4. User Personas

1. **Indie Hacker** – budget-sensitive, wants ROI, hates subs.
2. **Knowledge Worker (future)** – willing to pay later, needs simplicity.

## 5. Feature Requirements

### 5.1 Usage Metering

- Track `prompt_tokens`, `completion_tokens`, `model`, `cost_usd`, `ts`, `anon_user_id`.
- Events POSTed to OpenMeter in < 200 ms.

### 5.2 Credit Wallet

- 1 credit = 1 prompt (ceil by event).
- Balance stored in `users.balance` (Postgres).
- UI pill shows remaining credits & colour-codes (>250 green, 100-249 orange, <100 red).

### 5.3 Credit Packs & Subscription

#### One-off Credit Packs

| Pack    | Price | Credits | Effective $/credit | Intended For                                    |
| ------- | ----- | ------- | ------------------ | ----------------------------------------------- |
| Micro\* | $3    | 100     | $0.030             | impulse top-up (only shown when balance hits 0) |
| Starter | $5    | 250     | $0.020             | light monthly users                             |
| Bulk    | $15   | 1,000   | $0.015             | regular / indie hackers                         |
| Mega    | $30   | 2,500   | $0.012             | power users & micro-teams                       |

_Micro pack is hidden from the public pricing page and offered only in the low-balance modal to avoid anchoring the perceived value too low._

#### Pro Subscription (optional)

| Plan | Price      | Included Credits | Rollover Policy                         | Effective $/credit |
| ---- | ---------- | ---------------- | --------------------------------------- | ------------------ |
| Pro  | $9 / month | 1,000            | unused credits roll over up to 3 months | $0.009             |

- Subscription bills via Stripe recurring; credits debit exactly like pack credits.
- When balance < 50 credits **and** auto-reload enabled, the system debits wallet **or** purchases a Micro pack if no subscription.

### 5.4 Free Tier Free Tier

- 25 credits auto-refilled monthly via Stripe metered plan (cap enforced).

### 5.5 Auto Top-Up (Opt-In)

- Toggle in settings (`auto_reload=true`).
- When balance < 50 credits → charge card for Starter pack.

### 5.6 Model Handling

- Only GPT‑4.1‑mini initially.
- Router reserved for future multi-model; config value `modelCostMultiplier`.

### 5.7 Alerts & Monitoring

- Grafana panels: token usage, revenue, COGS, GM.
- Alerts:

  - `credits_used > 90 % cap` (free) per user.
  - `GM < 70 %` 3 days.
  - `openmeter_ingest_errors` >0.

### 5.8 Privacy & Compliance

- Hash user IDs before OpenMeter.
- Raw events retained 30 d; aggregated forever.
- RoPA update + DPA with OpenMeter cloud.

### 5.9 Non-Functional

- End-to-end p95 enhance latency ≤ 1.5 s.
- Stripe webhook idempotency.
- Data encrypted at rest (AES-256) & in transit (TLS 1.3).

### 5.10 Authentication & Accounts

| Phase                       | Auth Method                                                        | Key Details                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A – Anonymous (launch)**  | UUID `deviceId` stored in `chrome.storage.sync`; Server-issued JWT | zero friction; wallet tied to device; Client obtains/sends `deviceId`; server issues JWT signed with a server-side secret, containing `deviceId`; Stripe customer created on first purchase; banner prompts email link |
| **B – Magic‑Link (opt‑in)** | Supabase Auth email magic‑link                                     | links existing credits; enables cross‑device sync; banner every 5 prompts until linked                                                                                                                                 |
| **C – Team / SSO**          | Supabase + Google Workspace / GitHub                               | role table (owner, member); shared credit pool; SAML roadmap                                                                                                                                                           |

Security: HttpOnly SameSite=Lax cookies; AES‑256 at rest. GDPR: only email + stripe id stored; delete request anonymises.

## 6. Out of Scope (v2)

- Subscription plans (monthly/annual) — backlog.
- Multi-model selection UI.
- Success-based billing.

## 7. Implementation Phases, Stories & Technical Breakdown

Below each story we list **Files / Areas**, **Complexity** (T-shirt), and **Test Notes** so the dev squad can turn them straight into tickets.

### legend

- **SW** = background service-worker (`background.js`)
- **CS** = content script (`content.js` + `injected.js`)
- **PX** = proxy API (Node/Fastify serverless fn)
- **DB** = Supabase Postgres
- **EXT UI** = popup / settings HTML & JS

---

### Phase ‑1 – Proxy Skeleton (1 wk)

| ID    | Title                                                      | Files / Areas                      | Complexity | Test Notes                                                       |
| ----- | ---------------------------------------------------------- | ---------------------------------- | ---------- | ---------------------------------------------------------------- |
| PX‑00 | CI/CD – GH Action auto-deploy Supabase Edge Function       | infra/.github                      | S          | push to main builds & publishes function; staging url health 200 |
| PX‑01 | Deploy minimal `/enhance` Supabase Edge Function           | PX (supabase/functions/enhance.ts) | M          | `curl` returns OpenAI echo JSON                                  |
| PX‑02 | Inject server URL & update `connect_src`                   | CS, manifest.json                  | S          | Enhance works via new endpoint                                   |
| PX‑03 | Store OpenAI key in Supabase secrets                       | infra                              | S          | Key never in logs; rotated monthly                               |
| PX‑04 | Simple request quota (1 req/sec/device) using Supabase RLS | PX                                 | M          | 429 returned on hammer test                                      |
| PX‑05 | Non-stream JSON proxy (include `usage` flag)               | PX                                 | S          | Response matches direct OpenAI call                              |

_(Streaming upgrade tracked in Backlog PX‑06)_

### Phase M – BYOK Migration (1 wk)

| ID   | Title                               | Files / Areas      | Complexity | Test Notes                                                             |
| ---- | ----------------------------------- | ------------------ | ---------- | ---------------------------------------------------------------------- |
| M‑01 | Detect existing BYOK users          | CS, SW             | S          | unit: flag set when `chrome.storage.local.get('apiKey')` returns value |
| M‑02 | Migration banner + 500‑credit grant | CS, EXT UI, PX, DB | M          | integration: grant row in `credit_ledger`; UI shows banner once        |
| M‑03 | Modal blocker at D+30               | CS, EXT UI         | S          | e2e: mock clock + see modal fires daily until flag cleared             |
| M‑04 | Remove BYOK path & key purge        | CS, SW             | S          | regression: BYOK key ignored; enhance still works via proxy            |

### Phase A – Authentication (½ wk)

| ID   | Title                                                                        | Files / Areas  | Complexity | Test Notes                                                            |
| ---- | ---------------------------------------------------------------------------- | -------------- | ---------- | --------------------------------------------------------------------- |
| A‑01 | Client obtains `deviceId`; server generates JWT (1h TTL with silent refresh) | CS, SW, PX     | M          | Server-signed JWT accepted by PX; client auto‑refreshes on expiry/401 |
| A‑02 | Link email via Supabase magic‑link                                           | EXT UI, PX, DB | M          | e2e: credits merge across two browsers                                |
| A‑03 | Stripe customer creation on first purchase                                   | PX             | S          | check webhook sets `stripe_customer_id`                               |

### Phase 0 – Metrics Baseline (½ wk)

| ID        | Title                          | Files / Areas | Complexity | Test Notes                                                                                                                                                                  |
| --------- | ------------------------------ | ------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0‑01** | Write `usage_events` row to DB | PX, DB        | S          | logs `usage.total_tokens` to console in dev mode; row exists in `usage_events` with correct `anon_user_id`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `model`, `ts` |

### Phase 1 – OpenMeter Integration (1 wk)

| ID        | Title                                       | Files / Areas | Complexity | Test Notes                                 |
| --------- | ------------------------------------------- | ------------- | ---------- | ------------------------------------------ |
| **P1‑01** | Deploy OpenMeter Cloud sandbox              | infra         | S          | curl health-check returns 200              |
| **P1‑02** | Proxy emits `LLM_TOKEN` events to OpenMeter | PX            | M          | unit: 100% calls have event; assert schema |
| **P1‑03** | Cost field accuracy in OpenMeter events     | PX            | S          | diff vs manual calc < 0.5%                 |

### Phase 2 – Credit Ledger Back‑End (1 wk)

| ID    | Title                          | Files / Areas  | Complexity | Test Notes                                                                             |
| ----- | ------------------------------ | -------------- | ---------- | -------------------------------------------------------------------------------------- |
| P2‑01 | Add `users.balance` column     | DB (migration) | S          | DB test: default 0                                                                     |
| P2‑02 | Debit credits on webhook       | PX, DB         | M          | idempotent: repeat event → no double debit; integration with OpenMeter webhook payload |
| P2‑03 | Block enhance when balance ≤ 0 | PX, CS         | S          | e2e: modal appears, API returns 402                                                    |

### Phase 3 – Wallet UI & Starter Pack (1 wk)

| ID    | Title                                  | Files / Areas        | Complexity | Test Notes                                                                                                                         |
| ----- | -------------------------------------- | -------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P3‑01 | Credit pill in toolbar                 | CS, EXT UI, popup.js | M          | UI test via puppeteer: pill updates                                                                                                |
| P3‑02 | Low‑balance toast at 100               | CS, EXT UI           | S          | appears once per session                                                                                                           |
| P3‑03 | Stripe checkout for 250‑credit Starter | EXT UI, PX           | M          | idempotent: repeat event → no double credit; user can open Stripe Portal billing history; webhook → balance +250; redirect handled |

### Phase 4 – Auto Top‑Up (½ wk)

| ID        | Title                         | Files / Areas | Complexity | Test Notes                                        |
| --------- | ----------------------------- | ------------- | ---------- | ------------------------------------------------- |
| **P4-01** | Settings toggle `auto_reload` | EXT UI, DB    | S          | toggle persisted                                  |
| **P4-02** | Charge at <50 credits         | PX            | M          | unit: cron job triggers stripe checkout test mode |

### Phase 5 – Alerts & Dashboards (½ wk)

| ID    | Title                     | Files / Areas | Complexity | Test Notes                                            |
| ----- | ------------------------- | ------------- | ---------- | ----------------------------------------------------- |
| P5‑01 | Grafana dashboards import | infra         | S          | panels show usage, revenue, OpenAI COGS vs revenue GM |
| P5‑02 | Slack alert channel       | infra         | S          | test alert posts message                              |

### Phase 6 – Compliance & Launch (1 wk)

| ID        | Title                       | Files / Areas | Complexity | Test Notes                      |
| --------- | --------------------------- | ------------- | ---------- | ------------------------------- |
| **P6-01** | Final RoPA & privacy update | docs          | S          | counsel sign-off                |
| **P6-02** | DPA with OpenMeter          | legal         | S          | signed doc stored               |
| **P6-03** | On-call rota + runbooks     | repo/docs     | S          | pagerduty schedule tested       |
| **P6-04** | GA release toggle           | SW            | S          | flip % rollout via feature flag |

**dev calendar remains ≈ 5 ½ weeks but with clearer ownership & QA hooks.**

## 8. Risks & Mitigations Risks & Mitigations

| Risk                        | Impact                   | Mitigation                                  |
| --------------------------- | ------------------------ | ------------------------------------------- |
| Stripe webhook fails        | Users pay but no credits | Idempotent retry + manual audit queue       |
| OpenMeter Cloud downtime    | No metering, revenue hit | Fallback local buffer; plan self-host later |
| Users burn credits too fast | Churn                    | Add 2,500-credit bulk pack earlier          |

## 9. Stakeholders

- **Product**: you (Paddy)
- **Eng Lead**: TBD
- **Design**: TBD
- **Legal/Privacy**: external counsel

---

_living doc — iterate as we build._

## 10. Technical Implementation Review

This PRD outlines a significant architectural evolution from the current client-side BYOK (Bring Your Own Key) model to a server-centric, monetized service. Below are key areas of complexity and consideration when transitioning:

### 10.1 Core Architectural Shift: Client-Side to Server-Side

- **Current State:** The extension operates almost entirely client-side. The user's browser stores the API key (`chrome.storage.local`) and makes direct calls to AI providers.
- **Future State (PRD):** Introduces several new server-side components:
  - **Proxy API (PX):** A Supabase Edge Function (`/enhance`) will mediate all AI requests. This is a net-new service to build, deploy, manage, and secure.
  - **Database (DB):** Supabase Postgres will store user balances, Stripe customer IDs, and potentially other user-related data. This requires schema design, migrations, and secure data access.
  - **External Service Integrations:** OpenMeter for detailed usage metering and Stripe for payment processing.
- **Complexity:** This is the most fundamental change. It moves from a relatively simple, stateless (from the extension developer's perspective) model to a stateful, distributed system. This impacts development, deployment, monitoring, and security.

### 10.2 Proxy Implementation (PX-01 to PX-05)

- **New Component:** The Supabase Edge Function is entirely new. Infrastructure for deploying, versioning, and monitoring this function needs to be established.
- **API Key Security (PX-03):** Shifting from user-managed keys to a centrally managed OpenAI key (stored in Supabase secrets) is a major security responsibility. Robust secret management, rotation policies, and access controls are critical.
- **Initial Non-Streaming Approach (PX-05):** While simpler for initial development, this will introduce higher perceived latency for users, especially for longer interactions. The plan to move to streaming later is good but adds a future development iteration.
- **Rate Limiting (PX-04):** Implementing effective and fair rate limiting per device (and later per user) on the proxy is crucial to prevent abuse and manage costs.

### 10.3 Authentication & User Identity (Phase A)

- **From No Auth to Phased Auth:**
  - **Current:** No user accounts or authentication.
  - **Phase A (Anonymous):** Introduces a `deviceId` stored in `chrome.storage.sync` and a JWT signed with it. This is a good zero-friction start. Security of JWT generation, transmission (HTTPS only), and validation by the proxy is paramount. `chrome.storage.sync` allows the `deviceId` (and thus wallet) to roam with the user's Chrome profile if they are signed in, which is a good UX touch.
  - **Phase B (Magic-Link):** Supabase Auth for email magic-link is a significant step up, enabling cross-device sync and account recovery. This involves integrating Supabase Auth SDKs and managing user sessions.
- **Complexity:** Implementing authentication securely is non-trivial. Managing JWT lifecycles, refresh tokens (if applicable), and ensuring the proxy correctly validates tokens for every protected request is essential.

### 10.4 BYOK Migration (Phase M)

- **Critical User Experience:** This phase is crucial for retaining existing users.
  - **Detection (M-01):** Reliably detecting existing BYOK users is the first step.
  - **Credit Grant (M-02):** The 500-credit grant is a good incentive. The process of creating their anonymous `deviceId`, associating it with a new record in the `users` table (or a `credit_ledger`), and granting credits must be atomic and reliable.
  - **Communication & Cut-off (M-03):** Clear communication about the transition and the D+30 modal blocker is important.
  - **Key Purge (M-04):** Removing the BYOK path simplifies the codebase and attack surface but must only occur after a successful migration or grace period.

### 10.5 Storage & Database (P2-01)

- **New Data Store:** Introducing `users.balance` in Postgres (via Supabase) is the first step towards a more complex data model.
- **Data Integrity:** Ensuring that credit deductions (P2-02, via OpenMeter webhooks) and additions (P3-03, via Stripe webhooks) are atomic and idempotent is vital to maintain correct user balances.
- **Security:** Database access from the proxy must be secured (e.g., least privilege roles, connection pooling if applicable).

### 10.6 Frontend (EXT UI, CS) Modifications

- **Increased Complexity:** The popup, options page, and content scripts will require significant updates:
  - Displaying credit balance (P3-01) and its color-coding.
  - Low-balance notifications (P3-02).
  - Integrating Stripe Checkout (P3-03).
  - Settings for auto-reload (P4-01).
  - UI for linking email (A-02).
  - Migration banners/modals (M-02, M-03).
- **Current Stack:** Currently, `popup.js` and `options.js` are simple JS files copied by Webpack, not bundled as React/Vue apps. This level of UI change might necessitate adopting a more structured frontend framework/library or very careful vanilla JS DOM manipulation. The PRD references `popup.js` specifically for P3-01.
- **Communication:** Content scripts and popup/options pages will need robust communication with the background service worker (SW) to get balance updates, trigger authentication flows, etc.

### 10.7 Build, CI/CD, and Observability

- **Expanded Scope:** CI/CD (GitHub Actions) will need to be enhanced to build, test, and deploy the new backend components (Supabase functions) and manage database migrations.
- **Monitoring (P5-01, P5-02, 5.7):** Setting up Grafana dashboards and Slack alerts is crucial for operational visibility into the new system (token usage, revenue, errors). This is a new operational responsibility.

### 10.8 External Service Dependencies (OpenMeter, Stripe)

- **Increased Risk Surface:** Each external service adds a potential point of failure and a new security consideration.
- **Webhook Handling (5.9, P2-02, A-03):** Securely and reliably handling webhooks from Stripe (for payments) and OpenMeter (for usage) is critical. This includes signature verification, idempotent processing, and robust error handling/retries.
- **DPA & Compliance (P6-01, P6-02, 5.8):** Managing data processing agreements and ensuring compliance with privacy regulations becomes more complex with these integrations.

### 10.9 Performance & Latency (5.9)

- **Added Hops:** Introducing a proxy (PX) inherently adds latency compared to direct client-to-OpenAI calls.
- **Synchronous Operations:** The initial non-streaming approach (PX-05) for the proxy, coupled with potential synchronous checks for credit balance before an AI call (P2-03), could impact perceived performance. The goal of p95 enhance latency ≤ 1.5s will require careful optimization.
- **OpenMeter Impact:** Ensuring that POSTing events to OpenMeter (5.1) is asynchronous and does not block the user response path is important.

### 10.10 Testing & QA

- **Increased Complexity:** E2E testing becomes significantly more complex. It will require mocking external services (Stripe, OpenMeter), setting up test user accounts with specific states (e.g., low balance, different auth phases), and validating interactions across the extension, proxy, database, and external services. The PRD's test notes per story are a good start.

This transition is a major undertaking but also a significant opportunity. Addressing these complexities systematically during each implementation phase will be key to a successful v2 launch.

## 11. Potential Alternative Approaches & Considerations

Given the significant step-change from a BYOK model to a full-fledged SaaS offering, exploring alternative approaches for various implementation phases can help manage complexity, mitigate risks, and potentially accelerate time-to-market for core features. This section considers alternatives to the proposed plan.

### 11.1 Overall Phasing & Initial MVP

- **Alternative:** Ultra-Lean MVP focused _only_ on paid credits via the proxy, deferring free tier and even anonymous `deviceId`-based accounts initially.
  - **Approach:** Users must immediately sign up (magic link) to get any credits (even a small initial grant). Simplifies initial auth logic (no anonymous-to-registered migration needed for the very first users) and focuses entirely on validating the paid conversion funnel.
  - **Pros:** Fastest path to testing the core monetization hypothesis. Reduces initial scope for auth and ledger management.
  - **Cons:** Higher friction for first-time users compared to an anonymous or free-credit start. May not align with the goal of reducing onboarding friction as drastically.
- **Alternative:** Staged rollout of proxy usage. Initially, the proxy could _only_ handle users who opt-in to the credit system, while BYOK remains the default.
  - **Pros:** Less risky rollout; existing BYOK users unaffected until they choose to migrate. Allows for more gradual scaling and testing of the proxy and billing infrastructure.
  - **Cons:** Longer period of maintaining two parallel systems (BYOK and proxy-based). Potentially confusing for users.

### 11.2 Proxy Implementation (Phase -1)

- **Alternative Hosting/Stack for Proxy (PX-01):**
  - **Cloudflare Workers:** Known for low-latency, global distribution, and generous free tier. Good fit for a simple proxy. JavaScript/TypeScript based.
  - **Vercel/Netlify Functions:** If other parts of a future web presence (e.g., marketing site, user dashboard) are hosted there, co-locating functions can be convenient. Node.js or Go.
  - **Fly.io:** Allows deploying full-stack applications closer to users, could run a lightweight Node.js (Express/Fastify) app if more complex logic is anticipated for the proxy beyond simple request forwarding.
  - **Pros:** May offer better performance, cost structures, or developer experience depending on team familiarity and specific needs compared to Supabase Edge Functions (which are Deno-based and might have a steeper learning curve for some).
  - **Cons:** Introduces another vendor/platform to manage if not already using Supabase for DB/Auth. Supabase functions have the advantage of tighter integration with Supabase Auth/DB.
- **Alternative to Server-Side OpenAI Key (PX-03 Initial Stage):**
  - **Hybrid BYOK + Credits:** For a transitional period, allow users to use their own key via the proxy. The proxy would simply forward requests, but this allows you to start metering usage (even if not charging for it) and test the proxy infrastructure without immediately taking on the full responsibility and cost of a shared API key.
  - **Pros:** Lower initial COGS risk. Gentler transition for users accustomed to BYOK.
  - **Cons:** Doesn't solve the BYOK friction for new users. Adds complexity to the proxy logic.

### 11.3 Authentication (Phase A)

- **Alternative for Anonymous `deviceId` JWT (A-01):**
  - **Simpler Session Token:** Instead of a full JWT, the proxy could issue a simple, opaque session token upon first contact, linked to the `deviceId` in the DB. The proxy would manage session state.
  - **Pros:** Potentially simpler to implement on the client and proxy if JWT libraries feel like overkill for this anonymous phase. Less data transmitted per request.
  - **Cons:** More state to manage on the server-side (session store). JWTs are a standard and well-understood mechanism.
- \*\*Alternative for Account Linking/Migration (A-02):
  - **Proactive Email Prompt:** Instead of waiting for user-initiated linking, prompt for an email earlier in the anonymous usage (e.g., after X credits used or Y days), offering a bonus for linking. Frame it as securing their credits.
  - **Pros:** Potentially higher conversion to registered accounts sooner.
  - **Cons:** Could be perceived as slightly more intrusive if not timed well.

### 11.4 Usage Metering & Credit Ledger (Phase 0, 1, 2)

- **Alternative to OpenMeter Initially (P1-01, P1-02):**
  - **Direct-to-DB Metering:** For the very first MVP, the proxy could directly log token usage to a simple `usage_events` table in Supabase Postgres. A periodic job could then aggregate this to debit `users.balance`.
  - **Pros:** Reduces initial integration complexity and dependency on a third-party service (OpenMeter). Keeps all data within Supabase initially.
  - **Cons:** Less scalable and feature-rich than OpenMeter. Requires building aggregation and potentially some analytics logic manually. OpenMeter is designed for this specific purpose.
- **Alternative: Per-Request Debit (P2-02):**
  - Instead of webhook-based debiting (which implies some batching or near real-time aggregation by OpenMeter), the proxy could attempt to debit 1 credit (or an estimated cost) _before_ making the OpenAI call. If successful, proceed; if not, return 402. Reconcile actual token usage afterward.
  - **Pros:** More immediate feedback for users if they are out of credits. Simpler than managing webhook reliability from an external metering service for the core debit logic.
  - **Cons:** Slightly higher latency per request due to the pre-check. Actual token usage might differ from the initial debit, requiring reconciliation (e.g., refunding a partial credit or debiting more). This can get complex.

### 11.5 Frontend UI (EXT UI, CS - P3, P4)

- **Alternative: Leverage Existing UI Patterns:**
  - For the credit pill, low-balance toasts, and settings toggles, try to use the simplest possible JS and CSS, reusing existing extension UI components or patterns to minimize new frontend development if not adopting a framework.
  - **Pros:** Faster to implement if the team is not yet ready to bring in React/Vue/etc., for the extension pages.
  - **Cons:** Can become harder to manage as UI complexity grows. A lightweight framework might offer better structure sooner.
- **Alternative: Server-Rendered Pages for Settings/Billing:**
  - Instead of building all billing management UI into the extension (options.html), link out to simple server-rendered pages (e.g., hosted on Vercel/Netlify, or even simple Supabase-hosted pages if possible) for managing subscription, viewing payment history, or buying larger packs. Stripe offers hosted billing portals.
  - **Pros:** Moves complex UI out of the extension. Can leverage mature web frameworks. Stripe Portal handles much of this.
  - **Cons:** User experience involves leaving the extension. Requires a separate web frontend project.

### 11.6 BYOK Migration (Phase M)

- **Alternative: Optional Migration with Incentives (M-02, M-03):**
  - Allow BYOK to continue indefinitely but offer strong incentives (e.g., larger one-time credit grant, discounted first pack) for migrating to the new credit system. No hard cut-off, or a much longer one.
  - **Pros:** Less disruptive for existing power users who prefer BYOK. Reduces risk of user frustration from a forced change.
  - **Cons:** Prolongs the need to support two systems. May result in lower adoption of the monetized system from the existing user base.

### 11.7 General Considerations

- **Feature Flagging:** Aggressively use feature flags (e.g., using a simple `chrome.storage` flag initially, or a more robust system later) for all new backend-dependent features. This allows for phased rollouts, A/B testing (e.g., of pricing), and quick rollbacks.
- **Graceful Degradation:** If the proxy or billing system has issues, can the extension degrade gracefully? (e.g., temporarily re-enable BYOK if the proxy is down, though this adds complexity).
- **Cost Monitoring:** From day one of the proxy handling requests with your own key, closely monitor OpenAI API costs. Ensure your pricing and credit model is sustainable.

These alternatives offer different trade-offs in terms of speed, complexity, user experience, and risk. The best path often depends on specific team strengths, risk appetite, and evolving business priorities.

---

## Backlog Stories (Post v2 Launch / For Future Consideration)

| ID        | Title                                     | Files / Areas | Complexity | Test Notes                                                  |
| --------- | ----------------------------------------- | ------------- | ---------- | ----------------------------------------------------------- |
| **PX‑06** | Implement streaming completions via proxy | PX            | L          | Target: keep ≤ 1.5 s p95 latency for AI response initiation |
| A‑04      | Email link banner after 10 free credits   | CS, EXT UI    | S          | bonus 50 credits on link; prompt is dismissible             |

---

## Final Feasibility Review (Post-Consolidation)

This consolidated PRD version is well-structured and incorporates many crucial details for the v2 launch. The phased approach is logical. Here's a final review focusing on suitability and feasibility from the current BYOK architecture:

**Overall:**

- **Clear Improvement:** This version is much more concrete than the initial brainstorming and roadmap. The story breakdown is actionable.
- **Complexity Acknowledgement:** The plan implicitly (and sometimes explicitly, e.g., streaming in backlog) acknowledges the large leap from a simple client-side BYOK extension to a backend-supported SaaS.
- **Phased Approach is Key:** The success of this will heavily rely on disciplined, incremental implementation and testing of each phase, especially Phase -1 (Proxy Skeleton) and Phase A (Authentication), as these are foundational for everything else.

**Key Strengths in this Version:**

- **Proxy CI/CD (PX-00):** Excellent addition. Essential for reliable proxy deployments.
- **Clearer Phasing for Metering:** The shift from initial DB `usage_events` (P0-01) to later OpenMeter integration (Phase 1) is a good de-risking strategy. This allows the core proxy and credit logic to be validated before adding another external dependency for metering.
- **Specific Test Notes:** The test notes, especially regarding idempotency (P2-02, P3-03) and JWT refresh (A-01), are much improved and critical for robust implementation.
- **Stripe Portal Usage (P3-03):** Leveraging Stripe's hosted portal for billing history is a smart move to reduce custom UI work.
- **Backlog for Non-MVP:** Moving streaming (PX-06) and the email link banner (A-04) to a clear backlog is good for focus.

**Points for Final Consideration (Suitability & Feasibility from BYOK):**

1.  **Initial User Experience & `deviceId` Robustness (Phase A):**

    - The `deviceId` stored in `chrome.storage.sync` is good for zero-friction start and roaming if the user is synced in Chrome.
    - **Consideration:** What happens if a user _isn't_ using Chrome sync, or clears their local storage/`sync` data _before_ linking an email? Their anonymous credits and `deviceId` would be lost. While `sync` is more resilient than `local` for this, it's not infallible across devices or if a user intentionally clears it.
    - **Mitigation/Feasibility:** This is an accepted risk for "anonymous" access in many systems. The prompt to link email (now in backlog as A-04) becomes more important. Ensure the UI subtly message this (e.g. "Link email to secure your credits across devices").

2.  **Migration Path from `usage_events` to OpenMeter (Phase 0 to Phase 1):**

    - P0-01 now writes to a `usage_events` table. P1-02 says "Proxy emits `LLM_TOKEN` events" (presumably to OpenMeter).
    - **Consideration:** Will P2-02 ("Debit credits on webhook") initially be triggered by a process reading the internal `usage_events` table, and then switched to listen to OpenMeter webhooks in Phase 1? The PRD implies OpenMeter webhooks are used for P2-02.
    - **Feasibility:** This needs to be clear. The PRD text for P2-02 (Debit credits on webhook) has two entries; one mentions "idempotent: repeat event → no double debit" and the other mentions "integration with OpenMeter webhook payload." This implies that OpenMeter is indeed the trigger. The sequence P0-01 (DB logging) -> P1-01/P1-02 (Setup and emit to OpenMeter) -> P2-02 (Debit based on OpenMeter webhook) now seems logical and consistent.

3.  **Error Handling & User Communication for Proxy/Billing Failures:**

    - **Consideration:** While risks like "Stripe webhook fails" are noted, how will the _extension UI_ react and inform the user if, for example:
      - The proxy `/enhance` call fails due to a proxy bug or OpenAI issue?
      - A credit purchase via Stripe checkout succeeds from Stripe's perspective, but the webhook to grant credits is delayed or fails?
    - **Feasibility:** This requires robust error handling in the `background.js` and `content.js`/`popup.js` to provide informative (but not overly technical) messages. This isn't a specific story but an overarching concern.
    - **Suggestion:** Add a general NFR or a testing note to cover user-facing error states for common proxy/billing issues. Perhaps a backlog item: "Implement comprehensive user-facing error handling for proxy and billing operations."

4.  **Complexity of `popup.js` (P3-01):**

    - As noted in previous reviews, `popup.js` is currently a simple, copied JS file. Displaying dynamic, color-coded credit pills and potentially other account info will make it more complex.
    - **Feasibility:** This is still doable with vanilla JS, but it's a point where the team might feel the pinch of not having a lightweight UI framework if many more UI features are added to the popup. The current scope seems manageable.

5.  **Security of `deviceId` JWTs (A-01):**

    - The JWT is signed with the `deviceId`.
    - **Consideration:** This means the `deviceId` itself could be seen as a client-managed secret for these JWTs. If a `deviceId` leaks and the signing method was trivial or also compromised, it might be an issue.
    - **Feasibility/Suggestion:** JWTs are typically signed with a server-side secret. If the JWT is signed _by the server_ after receiving/generating the `deviceId`, and the server uses its own private key, that is standard and secure. If the _client_ is signing a JWT using the `deviceId` as a key, that's less common and its security depends heavily on the implementation details (e.g., how the `deviceId` is protected on the client, the strength of the signing algorithm if any actual crypto is done client-side). The PRD says "JWT signed with deviceId". For clarity and security, it should ideally mean: client sends `deviceId` (or asks server to generate one), server generates a JWT _containing_ the `deviceId` (and other claims) and signs this JWT with a _server-side secret_. The client then stores and uses this server-signed JWT. If the intention _is_ client-side signing, this needs careful security review.
    - Assuming server-side signing with a proper secret: The short-lived nature (1h) and the refresh mechanism are good. The proxy must validate the signature using the server's public key (or shared secret).

6.  **Developer Resources & Ramp-up:**
    - **Consideration:** The project introduces backend development (Supabase Edge Functions - Deno/TypeScript), database management (Postgres), CI/CD for backend, and integrations with Stripe & OpenMeter.
    - **Feasibility:** Ensure the team has, or has a plan to acquire, the necessary skills. The 5.5-week timeline is ambitious and assumes proficiency or quick learning in these areas.

**Duplicated Story Text & Minor Formatting:**

- Noticed a few places where story titles/test notes are duplicated in the table (e.g., P2-02, P3-03, P5-01 have their last line repeated). This is likely a copy-paste artifact in the source text. It doesn't affect feasibility but could be cleaned up for clarity.
- The section header for Phase M is duplicated: "Phase M – BYOK Migration (1 wk) – BYOK Migration (1 wk)".

**Conclusion of Final Review:**

The PRD is comprehensive and provides a solid plan. The phased rollout, clear story definitions, and inclusion of CI/CD from the start are strong positives. The main challenges remain the technical execution of the new backend components and the transition from a purely client-side architecture. Addressing the points above, especially clarifying the JWT signing process and ensuring robust error handling, will further strengthen the plan.
