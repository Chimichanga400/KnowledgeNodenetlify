# The Improved Prompt

This is the upgraded version of the original request. Reuse it (with any AI) whenever you
want the business re-planned, re-checked, or extended. What changed and why is explained
at the bottom.

---

## The prompt

> **Role:** You are my business co-founder and operator. I am a solo founder in South
> Africa. I will do high-level decisions, sales conversations, and anything requiring a
> human; AI agents will handle admin, research, marketing content, and support.
>
> **Goal:** Build a business that reaches **R100,000/month in revenue within 12 months**,
> with a realistic milestone ladder (R5k → R25k → R60k → R100k), not a hockey stick.
>
> **My starting assets (audit these first before proposing anything):**
> - An existing codebase/product: KnowledgeNode — an AI-powered study app (spaced
>   repetition, AI tutor, OCR note import, study plans) with a deployed-ready Netlify
>   backend (AI proxy, admin dashboard, usage quotas) and a RevenueCat paywall for Android.
> - My time: [X hours/week]. My budget: [R Y/month]. My skills: [list].
>
> **Constraints:**
> 1. Prefer leveraging existing assets over starting from zero — justify any deviation.
> 2. Every revenue number must come with unit economics: price, cost per user (including
>    AI inference), payment fees, and how many customers that implies.
> 3. Every claim about the market must be verifiable (cite sources or mark as assumption).
> 4. The plan must survive contact with reality: include the 3 most likely failure modes
>    and the pre-planned response to each.
> 5. Payments must work for South Africans on the web (Paystack/Yoco/PayFast), not only
>    Google Play.
>
> **Deliverables:**
> 1. A one-page strategy: what we sell, to whom, at what price, and why they'll pay.
> 2. A milestone plan: first 14 days (daily), first 90 days (weekly), months 4–12 (monthly),
>    each milestone with a revenue target and a kill/pivot criterion.
> 3. Unit economics table and the exact subscriber/customer count needed for R100k/month
>    under 2–3 pricing mixes (B2C only vs B2C+B2B).
> 4. The AI agent org chart: each agent's job description, its full copy-paste system
>    prompt, its cadence (daily/weekly), its KPIs, and the hard list of things it must
>    escalate to me (payments, refunds, legal, pricing changes, anything sent to a customer
>    the first 3 times).
> 5. Any missing product surface built and deployable today (e.g., a marketing landing
>    page with pricing and a lead-capture form) — real files, not descriptions.
> 6. A legal/admin checklist for South Africa: CIPC registration, SARS, POPIA, payment
>    provider onboarding.
>
> **Rules of engagement:** Be specific over comprehensive. Ranges are fine; vagueness is
> not. If a step depends on something only I can do (bank account, ID verification, app
> store account), flag it clearly as **[FOUNDER ACTION]**.

---

## What was improved, and why

| Original | Problem | Fix |
|---|---|---|
| "build a saas business that can generate 100k rands per month" | No timeframe, no starting point, ignores existing assets | 12-month target with milestone ladder; audit existing assets first (you already own a near-launch SaaS) |
| "you cant make a mistake" | Impossible demand; produces overconfident, unverifiable plans | Replaced with verifiability rules: cite sources, mark assumptions, pre-plan failure modes |
| "product, service or saas" | Choice paralysis — three business types is no decision | Constraint: leverage existing assets unless there's a justified reason not to |
| "ai agents to do admin related tasks etc" | "etc" = undefined jobs, so agents can't be built | Explicit agent org chart with prompts, cadence, KPIs, and escalation rules |
| "actual app if needed or website that I can just deploy" | Vague deliverable | "Real files, not descriptions" + payments must work for SA web users |
| "a nothing agent will do logistics" (typo: another) | Logistics only matters for physical products | Scoped out by choosing the SaaS route; research agent covers sourcing if ever pivoting to products |
