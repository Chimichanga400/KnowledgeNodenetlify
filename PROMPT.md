# The Improved Prompt

Your original prompt, rewritten so any AI (or human consultant) can act on it
precisely. Reuse it whenever you want this work re-done, extended, or audited.

---

## Master Prompt (copy-paste)

> **Role:** Act as a startup operator and technical co-founder with experience
> in the South African market, solo-founder SaaS, and AI-agent-assisted
> operations.
>
> **Goal:** Design and deliver a business that reaches **R100,000/month in
> revenue**, operated by **one person (me) plus AI agents** that handle admin,
> marketing, support, research, and logistics.
>
> **Hard constraints:**
> 1. I already own a working product: KnowledgeNode, an AI study-coach web/PWA
>    app with a Netlify backend, AI proxy, admin dashboard, and paywall.
>    Prefer building on this asset over starting from zero.
> 2. Startup budget: under R5,000/month in tooling and API costs until revenue
>    covers it.
> 3. Everything you produce must be immediately usable: deployable code,
>    copy-paste agent prompts, and a plan with numbers — not vague advice.
> 4. Revenue math must be in ZAR with explicit assumptions (price, subscribers,
>    churn, CAC). Do not promise outcomes; show the model and its sensitivity.
>
> **Deliverables:**
> 1. A business plan: positioning, target customer, pricing in ZAR, unit
>    economics to R100k/month, cost structure, and a 90-day launch roadmap
>    with weekly actions.
> 2. A deployable website/app change-set I can push live today (landing page,
>    pricing page, payment path).
> 3. A set of AI-agent job descriptions with full system prompts I can run in
>    Claude/ChatGPT: an ops/admin agent, a marketing/content agent, a customer
>    support agent, a market-research agent, and a finance/metrics agent.
> 4. A weekly operating rhythm: what I do personally (max 15 hrs/week) vs.
>    what each agent does, and the exact inputs/outputs between us.
> 5. A risk register: the 5 most likely ways this fails and the mitigation for
>    each.
>
> **Quality bar:** If a claim isn't backed by a number or a source, label it as
> an assumption. If a step needs a decision from me, list it in a "Decisions
> needed" section instead of guessing.

---

## What changed from your original prompt, and why

| Your version | Improved version | Why it matters |
|---|---|---|
| "build a saas business that can generate 100k rands per month" | Explicit revenue model with price × subscribers × churn assumptions | "Can generate" is unverifiable; a model you can sanity-check is actionable |
| "you cant make a mistake" | A quality bar + risk register | No plan is mistake-free; forcing risks into the open beats pretending they don't exist |
| "actual app if needed or website that I can just deploy" | "Prefer building on the product I already own" | You already have a shippable app — rebuilding from zero would waste your biggest asset |
| "ai agent to do research on products", "another agent will do logistics" | Five named agent roles with system prompts and defined inputs/outputs | Agents only work when their job, inputs, and outputs are specified |
| No budget, no timeline | R5k/month budget cap, 90-day roadmap, 15 hrs/week founder time | Constraints are what make a plan realistic instead of a wish |
