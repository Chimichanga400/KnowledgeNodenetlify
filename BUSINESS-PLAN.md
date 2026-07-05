# KnowledgeNode — Plan to R100,000/month
**One founder + an AI agent team. Written 5 July 2026.**

---

## 0. Honest framing (read this first)

No plan can *guarantee* R100k/month — anyone who promises that is lying to you.
What this plan does is give you:

- a product that already exists and works (this repo),
- a price and customer mix where R100k/month equals a **specific, countable
  target** (below),
- a 90-day roadmap timed to the biggest exam season of the South African year,
- and an AI agent team so the operation fits in ~15 hours/week of your time.

Every number is labelled. Where something is an assumption, it says so.

---

## 1. The business

**KnowledgeNode — an AI study coach for South African students.**

You are not building anything new. This repo *is* the product:

| Already built | Where |
|---|---|
| Full study app: upload notes (incl. photos/OCR), AI-generated study plans, spaced repetition, Socratic tutor, understanding checks, progress dashboard | `index.html`, `js/` |
| PWA — installs on any phone like an app, works offline | `manifest.json`, `sw.js` |
| AI proxy with per-user and global daily cost caps (protects you from bill shock) | `netlify/functions/claude-proxy.js` |
| Paywall (RevenueCat entitlement check) | proxy, `MANAGED_ONLY` |
| Admin dashboard — switch AI models live, watch usage | `admin.html` |
| Marketing landing page with ZAR pricing | `landing.html` (new, this branch) |

**Why this beats a product/e-commerce business for your goal:** no stock, no
suppliers, no shipping, ~90% gross margin, and "logistics" is literally just
software — which is exactly what AI agents are good at running.

### Who buys it (in order of priority)

1. **Matric learners (Gr 11–12) & their parents.** Parents already pay
   R250–R500/hour for human tutors. Trials are in Aug–Sep, finals Oct–Nov 2026
   — the buying season starts **now**.
2. **University students** — exam blocks in Oct–Nov.
3. **Schools & tutoring centres (B2B)** — one deal replaces hundreds of retail
   sales. Tutoring centres can white-label it as "their" AI tool.

---

## 2. The R100k/month math

### Pricing (ZAR)

| Plan | Price | Notes |
|---|---|---|
| Free | R0 | 7-day full trial, then heavily capped — the funnel |
| **Premium** | **R79/month** | Anchor price: one hour of human tutoring pays for 3+ months |
| Premium Annual | R699/year (≈R58/mo) | Cash upfront, kills monthly churn |
| **Matric Finals Pass** | **R349 once-off** (July–Dec access) | The seasonal hero product — parents buy outcomes, not subscriptions |
| **School / Tutor-centre licence** | **R4,999/month** per 100 learners | B2B anchor; a school pays R50/learner vs R79 retail |

### Three ways to reach R100k/month — pick your mix

| Path | Composition | Monthly revenue |
|---|---|---|
| Retail-only | 1,266 × R79 subscribers | R100,014 |
| **Blended (recommended)** | 8 school licences (R39,992) + 500 × R79 subs (R39,500) + 60 Matric Passes/mo (R20,940) | **R100,432** |
| B2B-heavy | 20 school licences | R99,980 |

The blended path is the realistic one: **8 schools + 500 subscribers + 60
seasonal passes**. In a country with ~25,000 schools and ~1.1M matric
candidates over Gr 11–12, that is a 0.03% market-share target.
(Assumption: school deals close at ~1 in 10 pitched; you need ~80 pitches —
your AI research agent builds that pipeline, section 4.)

### Costs at the R100k level (est.)

| Item | Monthly (est.) |
|---|---|
| AI API (via OpenRouter cheap models, proxy caps on) — assume R10–R18/active user × ~1,300 users | R13,000–R23,000 |
| Netlify (Pro) + Upstash Redis | ~R700 |
| Paystack fees (~2.9% + R1) on retail | ~R2,000 |
| Tools (email, analytics, agent subscriptions) | ~R1,500 |
| **Total** | **~R17k–R27k → 73–83% gross margin** |

The proxy's `DAILY_USER_MAX` / `DAILY_GLOBAL_MAX` env vars are your circuit
breaker — set them from day one so a heavy user can never cost more than they
pay.

### Break-even

Fixed costs pre-revenue are under R1,500/month. **~20 Premium subscribers
covers the tooling.** Everything after that funds growth.

---

## 3. Payments — the one real gap, and the bridge

The paywall today checks **RevenueCat** (built for app-store billing). For a
web SaaS selling in ZAR you want **Paystack** (or Payfast) — subscriptions,
debit orders, ~2.9% fees, pays out to an SA bank account.

**Bridge plan (start selling this week, no code):**
1. Create a Paystack account (free) → create Payment Pages for R79/mo,
   R699/yr, R349 once-off. Link the landing page buttons to them.
2. When a payment lands, grant the customer access manually via RevenueCat's
   dashboard ("grant entitlement") — 2 minutes per customer, your support
   agent drafts the welcome email.
3. **Phase 2 (weeks 3–6):** add a small Netlify function that receives
   Paystack webhooks and grants/revokes the entitlement automatically. That
   removes you from the loop entirely. (This is the first engineering task on
   the roadmap — I can build it next if you say go.)

---

## 4. Your AI agent team

Five agents, full system prompts in `agents/`. Run each as its own Claude
Project / recurring chat. You are the CEO; agents produce, you approve.

| Agent | File | Job | Cadence |
|---|---|---|---|
| **Ops & Admin** | `agents/ops-admin-agent.md` | Onboarding checklists, entitlement grants list, cost-cap monitoring instructions, weekly ops report | Daily 15-min run |
| **Marketing & Content** | `agents/marketing-agent.md` | 5 TikTok/IG scripts + 3 posts + 1 email per week, exam-calendar campaign planning, landing-page copy tests | 2× per week |
| **Customer Support** | `agents/support-agent.md` | Drafts replies to every support email/WhatsApp, maintains FAQ, flags refunds/bugs to you | Daily |
| **Market Research** | `agents/research-agent.md` | Builds the 80-school/tutor-centre pipeline, pricing intel, competitor watch, new-segment research | Weekly deep-dive |
| **Finance & Metrics** | `agents/finance-agent.md` | Weekly dashboard: MRR, churn, CAC, AI cost per user, runway; flags when a metric drifts | Weekly |

**Division of labour:** agents do 100% of drafting, research, analysis, and
checklists. **You** do the ~15 hrs/week that legally or practically requires a
human: approving/posting content, sales calls with schools, banking/Paystack,
and final say on refunds.

---

## 5. 90-day roadmap (July 6 → Oct 4, 2026)

Timed so you are fully live before **matric trials (Aug–Sep)** and scaled
before **finals (Oct–Nov)** — the two highest-intent buying windows of the
year.

### Phase 1 — Launch (Weeks 1–2, by July 19)
- [ ] Deploy this repo to Netlify (`NETLIFY-DEPLOY.md`), set env vars incl.
      `DAILY_USER_MAX`/`DAILY_GLOBAL_MAX`
- [ ] Buy a domain (e.g. knowledgenode.co.za, ~R99/yr) and attach it
- [ ] Paystack account + 3 payment pages; wire landing-page buttons to them
- [ ] Stand up all 5 agents (paste prompts from `agents/`)
- [ ] Marketing agent produces launch content batch #1; you post
- [ ] **Target: first 10 paying customers (friends/family/local groups) — proof, not profit**

### Phase 2 — Retail engine (Weeks 3–6, by Aug 16)
- [ ] Paystack webhook function → fully automatic access on payment
- [ ] TikTok/IG posting rhythm: 5 pieces/week ("watch AI turn my notes into a
      study plan" demo content performs best — assumption to test)
- [ ] Seed 20 school/university WhatsApp study groups (research agent finds
      them, you join/post)
- [ ] Launch **Matric Finals Pass** campaign aimed at *parents* on Facebook
      (R1,500 test budget)
- [ ] **Target: 100 paying users ≈ R10k/month**

### Phase 3 — B2B + scale (Weeks 7–13, by Oct 4)
- [ ] Research agent delivers 80-prospect school/tutor-centre pipeline with
      contact names
- [ ] You pitch 8–10/week (email drafted by marketing agent, 15-min demo call
      by you); free 2-week school pilots
- [ ] Referral programme: 1 free month per successful referral
- [ ] Double down on whichever retail channel Phase 2 proved cheapest
- [ ] **Target: 3 school licences + 300 retail ≈ R40–45k/month**

### Phase 4 — Exam season peak (Oct–Nov)
- Finals panic-buying window: heaviest ad spend + "Finals Pass" pushes.
- **Target: R100k/month run-rate by end of November.**
- If you hit 60–70% of target, this is still a business worth continuing into
  the Jan "new school year" wave — the second-biggest buying window.

---

## 6. Risk register — top 5 failure modes

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **Nobody converts from free → paid** | The classic SaaS killer | 7-day *full* trial then hard cap (not a crippled free tier); Finals Pass as low-commitment entry; exit-survey on cancel (support agent runs it) |
| 2 | **AI API costs eat the margin** | Medium | Proxy caps already built — set them day 1; admin dashboard lets you switch to cheaper OpenRouter models live |
| 3 | **School sales cycles too slow** | High (terms, committees) | Sell to *tutoring centres* first (owner decides in one call); free 2-week pilots; retail keeps cash flowing meanwhile |
| 4 | **Content marketing gets zero traction** | Medium | Agent produces at high volume + weekly metric review kills losing formats fast; WhatsApp groups & referrals as the organic fallback |
| 5 | **You burn out doing everything** | Medium | The agent team exists precisely for this; if a week's founder-hours exceed ~20, cut scope, not sleep |

---

## 7. Decisions needed from you

1. **Pricing sign-off:** R79/mo, R699/yr, R349 Finals Pass, R4,999 school —
   approve or adjust (landing page updates in one edit).
2. **Payment provider:** Paystack (recommended) vs Payfast.
3. **Domain name** to buy.
4. **Go/no-go on the Paystack webhook function** — say the word and it gets
   built on this branch.
