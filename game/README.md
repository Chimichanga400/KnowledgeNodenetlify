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
| 🌱 Grow | Buy seeds (street cash), plant, keep watered, harvest. Better strains unlock with reputation. |
| 🤝 Street | Buyers appear 09:00–02:00 with offers. Sell, **haggle** (once per buyer), or decline. Every deal adds **heat**. |
| 🎩 Crew | Gardeners automate watering/harvest, Runners auto-sell, Fixers cool heat, a Barrister softens raids. Wages due at dawn. |
| 🏛️ Business | Front businesses launder dirty **cash** into clean **bank** money (10% fee, settles at dawn). Lords and estates only accept bank money. |
| 🚨 Heat | Above 70, dawn raids become likely. At 100, a major crackdown torches everything. Bribe, hire fixers, or lie low until dawn. |
| 📜 Events | Gentlemen-style dilemmas — blackmailing heirs, rival crews, journalists, poker nights. Choices have consequences. |

**Win:** bank **£500,000 clean** and buy *The Gentleman's Exit*.

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
