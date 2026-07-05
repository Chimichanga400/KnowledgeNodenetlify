# KnowledgeNode — Path to R100,000/month

**Business type:** SaaS (B2C subscriptions + B2B site licences)
**Founder:** solo, assisted by AI agents (see `AI-AGENTS.md`)
**Product:** already built, in this repository. This plan is about *launching and selling* it.

---

## 1. The one-page strategy

**What we sell:** KnowledgeNode — an AI study tutor that turns a student's own notes into
a personal study system: spaced-repetition review, AI-guided study sessions, Socratic
tutoring, OCR import of handwritten/photographed notes, and auto-built study plans.

**Who buys it:**
1. **Primary (B2C):** South African university students and Grade 10–12 (matric) learners —
   exam-driven, mobile-first, price-sensitive but already paying for help.
2. **Secondary (B2B):** tutoring centres and private/semi-private schools who buy site
   licences as a value-add for their students.

**Why they pay:** Human tutoring in SA costs **R100–R450/hour** ([Superprof](https://www.superprof.co.za/blog/understanding-tutor-prices/),
[Turtlejar](https://turtlejar.co.za/online-tutoring)). KnowledgeNode Premium at **R99/month**
costs less than *one hour* of the cheapest human tutor and is available at 2am before the
exam. That is the entire pitch: *"A tutor in your pocket for less than one hour of tutoring."*

**Why now:** SA's edtech market is ~**US$1.25bn (2025)** growing ~11%/yr
([IMARC](https://www.imarcgroup.com/south-africa-edtech-market)), the country is
mobile-first with 45M+ internet users, and post-pandemic demand for personalised digital
learning keeps rising. Exam seasons (May/June, Oct/Nov) create predictable demand spikes.

**Moat (realistic for a solo founder):** not technology — speed, niche focus (SA curriculum,
ZAR pricing, low-data mobile use), and the student's accumulated knowledge graph (their
notes + mastery history live in the app, so switching costs grow every week they use it).

---

## 2. Pricing

| Plan | Price | What's included |
|---|---|---|
| **Free** | R0 | Notes, library, spaced repetition, study plans — no AI. The hook + POPIA-friendly trial. |
| **Premium** | **R99/month** or **R799/year** (33% off — sell the annual hard at exam season) | Full AI: tutor, OCR, AI Director, understanding checks. Daily fair-use cap (already enforced by proxy `DAILY_USER_MAX`). |
| **School/Tutor licence** | **R59/learner/month, min 25 learners** (from R1,475/mo) | Premium for all learners + a usage report emailed to the centre monthly. |

Pricing logic: R99 sits below the psychological R100 line, is ~½ the cheapest tutoring hour,
and clears AI costs ~4–8x over (see unit economics). The annual plan smooths the
post-exam churn cliff.

---

## 3. Unit economics

Per Premium subscriber per month (assumptions marked ✱):

| Item | B2C (Paystack web) | B2C (Google Play) |
|---|---|---|
| Revenue | R99.00 | R99.00 |
| AI inference ✱ (quota-capped, cheap models via OpenRouter for routine tasks, Claude for tutoring) | −R12 to −R30 | −R12 to −R30 |
| Payment fees | −R3.90 (2.9% + R1) | −R14.85 (15%) |
| RevenueCat (free < $2.5k MTR, then ~1%) | −R0 to −R1 | −R0 to −R1 |
| **Gross profit** | **R64–R83 (65–84%)** | **R53–R72** |

✱ AI cost estimate: heavy user ≈ 60–150 AI calls/day cap × ~2k tokens average on a
budget-model mix ≈ US$0.60–1.60/user/month. The admin dashboard in this repo can switch
the whole fleet to cheaper models live if margin compresses — this is your margin dial.

**Fixed costs (monthly):** Netlify Pro ~R380, Upstash free tier R0, domain ~R15,
Google Play account R0 (once-off $25), marketing budget R1,000–R5,000 discretionary.
Total fixed: **under R1,500/month before marketing.** Break-even ≈ **20 subscribers.**

### Subscriber math for R100k/month

| Mix | What it takes |
|---|---|
| Pure B2C monthly | 1,010 subs × R99 |
| Realistic blend (target) | **600 B2C** (R59.4k) + **500 B2B seats** across ~8–12 centres (R29.5k) + **annuals amortised** (~R11k) ≈ **R100k** |
| B2B-heavy fallback | 25 centres × 60 seats avg × R59 = R88.5k + small B2C tail |

600 paying B2C users from a national pool of >1M university students + ~900k matric
candidates = capturing **0.03%** of the market. The target is small; execution is the risk.

---

## 4. What's missing before you can charge (launch blockers)

The product works; the *business* has four gaps. In order:

1. **Web payments (biggest gap).** RevenueCat is wired for Google Play only. Web users
   can't pay. Fastest fix, no code: create a **Paystack Payment Page** (subscription,
   R99/month), and on payment success manually grant the user via RevenueCat's dashboard
   (Customer → Grant entitlement) or issue a promo code. Do this manually for the first
   50 customers — it's 2 minutes each and lets you talk to every early customer. Automate
   with a Paystack webhook → RevenueCat REST API function later (build it when >5
   signups/day). **[FOUNDER ACTION: open Paystack account — needs ID + bank account]**
2. **A marketing front door.** Built: `landing.html` in this repo — pricing, FAQ, and a
   Netlify Forms waitlist that emails you every lead. Deploy and it works; zero backend.
3. **Deploy + keys.** Follow `NETLIFY-DEPLOY.md`. Set `ANTHROPIC_API_KEY` (and/or
   `OPENROUTER_API_KEY`), `ADMIN_TOKEN`, `PROXY_APP_TOKEN`, Upstash vars, RevenueCat keys.
   **[FOUNDER ACTION: API keys + Netlify account]**
4. **Legal minimum.** See §7.

---

## 5. Go-to-market (the honest version)

Nothing here requires ad spend to start. Priority order:

1. **Founder-led distribution (weeks 1–8).** You personally post 3–5×/week on TikTok +
   Instagram Reels: screen-recordings of the app turning messy notes into a study plan,
   "study with me" content, exam-cram tips. The Marketing Agent writes every script and
   caption (see `AI-AGENTS.md`); you record 15–60s of screen + voiceover. SA study-tok is
   an underserved niche; this is the single highest-leverage activity.
2. **Campus ambassadors (weeks 4–12).** 1 student per campus, free Premium + R20/paid
   referral (unique promo codes). 10 ambassadors ≈ a distributed sales force costing ~R2k/mo.
3. **WhatsApp study groups.** Where SA students actually live. Ambassadors drop demo
   clips + links; never spam — always a useful artefact (a shared study plan, a mnemonic sheet).
4. **B2B outreach (from week 6).** Growth Agent drafts personalised emails to tutoring
   centres (Teach Me 2-style operators, local matric-rescue centres): free 30-day pilot
   for 25 learners → R59/learner/month. You close on a 20-minute call. 1 close per 15
   emails is a fine early rate.
5. **SEO (compounding, from month 2).** Content Agent writes 2 posts/week targeting
   "how to study for [subject] matric", "past paper study plan", etc. Slow but free and
   compounding into exam seasons.

**Seasonality is the strategy:** SA exam peaks are May–June and Oct–Nov. Push annual
plans and school pilots hard in March–April and August–September; expect B2C churn in
December — that's what the B2B layer and annual plans are for.

---

## 6. Milestones and kill criteria

### Days 1–14 (launch)
| Day | Action |
|---|---|
| 1 | Deploy to Netlify with keys; smoke-test proxy + admin dashboard |
| 2 | Buy domain (e.g. knowledgenode.co.za), connect to Netlify. Deploy `landing.html` |
| 3 | **[FOUNDER]** Paystack account application; CIPC company registration (~R125, online) |
| 4–5 | Run agents: Research Agent competitor scan; Marketing Agent 30-day content calendar |
| 6–7 | Record + post first 3 TikToks; set up Instagram; app link in every bio |
| 8–10 | Recruit 10 beta users (friends/family/WhatsApp groups) — watch them use it, fix friction |
| 11–12 | Paystack payment page live; first paying customer (even at 50% founding-member discount) |
| 13–14 | Support Agent FAQ + templates live; week-1 metrics review (Ops Agent digest) |

### 90-day targets
- **Day 30:** 300 waitlist/free users, **10 paying** (~R1k MRR). *Kill/pivot check: if <100 free signups despite 15+ posts, the message is wrong — re-run Research Agent on positioning before spending anything.*
- **Day 60:** 25–40 paying, first B2B pilot started (~R3–5k MRR).
- **Day 90:** 60–100 paying, 1–2 B2B pilots converting (~R8–12k MRR). *Kill/pivot check: if <R3k MRR and churn >20%/mo, the product isn't retaining — stop marketing, fix retention.*

### Months 4–12 (MRR ladder)
| Month | MRR target | Main lever |
|---|---|---|
| 4 | R15k | Exam-season annual push (May/June exams) |
| 5–6 | R25k | 3–5 B2B centres live; 10 ambassadors |
| 7–8 | R40k | Automate Paystack→RevenueCat webhook; paid ads test (R3k, only if organic CAC proven) |
| 9–10 | R60k | Oct/Nov exam-season peak; school pilots signed in Aug/Sep convert |
| 11–12 | **R100k** | 600 B2C + ~500 B2B seats; December churn buffered by annuals |

### The 3 most likely failure modes (pre-planned responses)
1. **Retention failure** (students churn after exams): push annual plans at a discount only
   during exam season; build the streak/mastery features you already have into weekly email
   nudges (Ops Agent); B2B revenue doesn't churn with exam cycles.
2. **AI cost blowout** (margin <50%): use the admin dashboard to shift routine calls to a
   cheaper OpenRouter model; lower `DAILY_USER_MAX`; introduce a mid-tier at R59 with a
   smaller cap. You can act on this within one hour — it's a dashboard setting.
3. **Distribution failure** (content doesn't convert): the kill checks above trigger a
   Research Agent re-run on audience/message; pivot channel (WhatsApp-first instead of
   TikTok-first) before pivoting product.

---

## 7. Legal & admin (South Africa)

- **CIPC:** register a private company (Pty Ltd), ~R125–R175 online at bizportal.gov.za. **[FOUNDER ACTION — needs ID]**
- **SARS:** company auto-registered for income tax; register for VAT only once turnover
  approaches the R1m/12-month threshold (that's the goal, not day 1).
- **POPIA:** you store study data. Minimum compliance: a plain-language privacy policy
  (Ops Agent drafts, you review), data kept in the user's device/localStorage where possible
  (already the app's architecture — an advantage), a delete-my-data email route.
- **Paystack/PayFast onboarding:** needs registered company or sole prop + bank account. **[FOUNDER ACTION]**
- **Google Play:** $25 once-off developer account for the Android build. **[FOUNDER ACTION]**
- **Terms of service:** Ops Agent drafts; state clearly the AI can make mistakes and is a
  study aid, not a guarantee of results.

---

## 8. Sources
- [IMARC — South Africa EdTech Market](https://www.imarcgroup.com/south-africa-edtech-market)
- [GlobalData — South Africa Edtech](https://www.globaldata.com/store/report/south-africa-edtech-market-analysis/)
- [Superprof — tutoring prices SA](https://www.superprof.co.za/blog/understanding-tutor-prices/)
- [Turtlejar — online tutoring rates](https://turtlejar.co.za/online-tutoring)
- [DigitalDefynd — Africa EdTech statistics](https://digitaldefynd.com/IQ/africa-edtech-statistics/)

Assumptions marked ✱ in the text are estimates to validate in the first 30 days with real
usage data (the admin dashboard + Upstash counters give you this).
