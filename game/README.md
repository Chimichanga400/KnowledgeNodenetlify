# 🌿 Emerald Estates — An Underground Empire

A satirical, single-file browser tycoon game inspired by *The Gentlemen* and *Schedule I* —
lease the cellars of broke aristocrats, grow product, deal on the street, launder the
takings, dodge the law, and retire spotless.

**Entirely fictional entertainment.** No external dependencies, works fully offline,
saves automatically to your device.

## ▶️ Play it

- **Any browser (PC or mobile):** open `https://<your-netlify-site>/game/`
- **Locally:** `npx serve .` from the repo root, then open `http://localhost:3000/game/`
  (or just open `game/index.html` directly — everything is inline).

## 🎮 How it plays

| Loop | What you do |
|---|---|
| 🌱 Grow | Buy seeds (street cash), plant, keep watered, harvest. 8 strains unlock with reputation, across 7 leasable estates. Plants are drawn live and visibly grow, wilt, and ripen. |
| 🤝 Street | Buyers appear 09:00–02:00 with offers. Sell, **haggle** (once per buyer), or decline. Every deal adds **heat**. Market prices shift every dawn — sell into hot markets. |
| 📜 Contracts | Timed bulk orders that pay 140–180% of value straight into the **bank**. Miss the deadline and your reputation suffers. |
| 🗺️ Turf | Five districts run by named rival crews (Penny Boys → Dockside Syndicate). Hire **Enforcers** and take corners by force — held turf pays street cash every dawn, but crews hit back and undefended corners get retaken. |
| 🎩 Crew | 7 roles: Gardeners automate watering/harvest, Runners auto-sell, Enforcers take and hold turf, Fixers cool heat, Botanists boost yield, Gamekeepers cut raid chance, a Barrister softens raids. Wages due at dawn. |
| 🏛️ Business | 6 front businesses launder dirty **cash** into clean **bank** money (10% fee, settles at dawn). A **Private Bank** lets you withdraw clean money back into street cash any time, free. 9 upgrades. Lords and estates only accept bank money. |
| 💎 Lifestyle | 6 luxury assets — watch, vintage Jaguar, speedboat, racehorse, penthouse, art collection — each grants reputation plus a permanent perk (better haggling, more buyers, longer contract deadlines, prize money, faster heat decay, a cheaper exit). |
| 🚨 Heat | Above 70, dawn raids become likely. At 100, a major crackdown torches everything. Bribe, hire fixers, or lie low until dawn. |
| 🎭 Events | 29 dilemmas — Gentlemen-style aristocratic capers plus a gang layer straight out of Top Boy/Power/Snowfall: torched vans, truce summits, snitches in the firm, runners getting jumped, poaching, tribute demands. Choices have consequences. |
| 🏆 Extras | 15 achievements, and a living scenery panel: the sky cycles dawn→night with a moving sun and moon, stars come out, the manor's windows light up, and a police car rolls in when you're running hot. |

**Win:** bank **£500,000 clean** and buy *The Gentleman's Exit* — how cleanly you
played (raids survived, final heat, reputation) decides which of four endings you get.

Controls: tap/click everything. Speed controls (⏸ 1× 2× 4×) and a 🌙 *Dawn* skip live in
the top bar. Progress autosaves to `localStorage` every 15 seconds.

## 📱 Get it on Android

Three options, easiest first:

### 1. Install as a PWA (no build tools, 30 seconds)
Open `/game/` in Chrome on Android → menu (⋮) → **Add to Home screen / Install app**.
It installs fullscreen with its own icon and works offline (scoped service worker).

### 2. Native APK with Capacitor
```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Emerald Estates" com.example.emeraldestates --web-dir game
npx cap add android
npx cap sync
npx cap open android   # opens Android Studio → Build → Build APK(s)
```
The game is a single self-contained page, so no bundler or build step is needed —
`game/` is the web dir as-is.

### 3. Trusted Web Activity (Play-Store-ready wrapper)
```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://<your-netlify-site>/game/manifest.json
bubblewrap build
```
Produces a signed APK/AAB that wraps the live site — updates ship by deploying, no
app-store re-release needed.

## 🗂 Files

| File | Purpose |
|---|---|
| `index.html` | The whole game — markup, styles, and engine, no dependencies |
| `manifest.json` | PWA manifest (scoped to `/game/`) |
| `sw.js` | Offline service worker (network-first, `/game/` scope only) |
| `icon.svg` | App icon |
