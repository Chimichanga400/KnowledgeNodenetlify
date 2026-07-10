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
| 🌱 Grow | Buy seeds (street cash), plant, keep watered, harvest. 8 strains unlock with reputation, across 7 leasable estates. The tab opens with a live isometric **cellar grow room** — pots under magenta grow lights showing your plants at their real growth stages, with a gardener tending. Plants are drawn live and visibly grow, wilt, and ripen. **Hand-harvesting** launches a timing "trim" minigame — land the marker in the golden band for a Perfect Trim (+40% yield). Gardeners auto-harvest but only at base yield, so skilled manual play out-earns automation. |
| 🏙️ Street | Tops with a live isometric **city** view — every estate you own is a building on a grid of streets (grandest at the centre), tower blocks and terraces fill in as you grow, turf flies green flags, and the public and your crew walk the avenues; gang wars play out here. Below it: buyers appear 09:00–02:00 with offers. Sell, or **haggle** with a push-your-luck timing bar — push the price higher for a bigger cut, but push into the red and the buyer walks. Every deal adds **heat**. Market prices shift every dawn. |
| 📜 Contracts | Timed bulk orders that pay 140–180% of value straight into the **bank**. Miss the deadline and your reputation suffers. |
| 🗺️ Turf | Five districts run by named rival crews (Penny Boys → Dockside Syndicate). Hire **Enforcers** and take corners by force — held turf pays street cash every dawn, but crews hit back and undefended corners get retaken. |
| 🎩 Crew | Tops with an isometric view of **all your estates** laid out on the grounds (grandest flies the flag) with your actual hired staff milling in the central courtyard. Below it, 7 roles to hire: Gardeners automate watering/harvest, Runners auto-sell, Enforcers take and hold turf, Fixers cool heat, Botanists boost yield, Gamekeepers cut raid chance, a Barrister softens raids. Wages due at dawn. |
| 🏛️ Business | 6 front businesses launder dirty **cash** into clean **bank** money (10% fee, settles at dawn). A **Private Bank** lets you withdraw clean money back into street cash any time, free. 9 upgrades. Lords and estates only accept bank money. |
| 💎 Lifestyle | 6 luxury assets — watch, vintage Jaguar, speedboat, racehorse, penthouse, art collection — each grants reputation plus a permanent perk (better haggling, more buyers, longer contract deadlines, prize money, faster heat decay, a cheaper exit). |
| ❤️ Life | Build relationships with four distinct characters — a civilian florist, a rival crew lieutenant, a defence solicitor, a grime artist — each with their own tastes. Spend evenings together to raise affection, then commit, **marry**, and start a **family**. Each committed partner grants a lasting perk, and your family changes your ending. |
| 🏘️ Community | Fund five community projects (youth club, food pantry, boxing programme, scholarship, people's centre) to build a **Community Trust** meter that cools heat, silences witnesses, and unlocks the *People's Champion* ending. |
| 🎯 Wet work | Order **hits** on rival crew leadership to permanently weaken a district, or deal with **witnesses** — high reward, but heat and trust suffer and a civilian partner will never look at you the same way. |
| ⚔️ The Vendetta | **Cornelius Vane**, kingpin of the Dockside Syndicate, is your permanent antagonist — so the late game never coasts. A **Beef** meter (shown on Turf, with a five-tier read from *Beneath his notice* → *War*) rises the bigger you get: every corner you hold, every rep milestone, every hit, and above all any move on his docks feed it; lying low, staying small, or a marrying a lieutenant cool it. As beef climbs, Vane **retaliates** at dawn with escalating force — shaking down runners, torching vans, snatching corners and shipments, tipping the police, hospitalising enforcers, burning grows. **Send tribute** (£5,000 → −20 beef) to buy breathing room. Let it hit 100 and he calls a **showdown at the docks**: bring the whole firm, set a trap, sue for a 20-day truce, or back down. Win and the **docks are yours**, +80 rep, and a dedicated *Last Kingpin* ending; lose and you're routed but survive — rebuild and the beef boils up again for a rematch. |
| 🚨 Heat | Above 70, dawn raids become likely. At 100, a major crackdown torches everything. Bribe, hire fixers, or lie low until dawn. **Three crackdowns and you're nicked** — game over, for real. |
| 📉 Bankruptcy | Run out of cash *and* bank *and* anything left to sell for three dawns running, and the empire quietly runs out of road. Stakes are real on both ends. |
| 👆 Tappable scenes | The cellar, city and estate grounds aren't just decoration — tap a pot to water/plant/harvest it, tap a building to jump to it, tap a shop or turf flag to jump to that section, tap a crew member to see who they are. In 3D the taps are true raycasts into the scene, with generous invisible hit-targets sized for thumbs. |
| 🎮 Real-time 3D | All three living scenes are rendered in **true 3D with three.js** (embedded inline — still one file, still offline): an orthographic iso camera, real directional **sunlight with soft shadows** that arcs across the sky by game time, a moon and stars after dark, distance fog, ACES filmic tone mapping, emissive night windows, glowing street lamps, waving flags, walking low-poly citizens/crew/police with strobing beacons, gang-war flare-ups with smoke and muzzle-flash light, a fountain on the grounds, and a cellar grow room lit by volumetric magenta light cones with drifting dust motes. Devices without WebGL (or that lose the GPU context) drop back automatically to the original Canvas-2D painter — same scenes, same taps, no breakage. |
| 💷 Books | Ledger → **Books** is an income/expense report (P&L) that genuinely **resets every dawn** — toggle **Today** (live, empties out at each dawn) vs. **Yesterday** (the last fully-closed day), so one-off historical costs never linger and inflate the picture. Categorises every flow — street sales, turf, contracts vs. wages, rent, upkeep, the 10% laundering fee, seeds, bribes, fines, purchases — with bars flagging your **biggest drain**, plus a separate **Lifetime** total that (unlike the daily view) intentionally keeps accumulating. |
| 🎭 Events | 31 dilemmas — Gentlemen-style aristocratic capers plus a gang layer straight out of Top Boy/Power/Snowfall: torched vans, truce summits, snitches, witnesses, runners jumped, poaching, tribute demands. Choices have consequences. |
| 🏆 Extras | 19 achievements, procedural sound effects (with a mute toggle), an animated title screen, and a living scenery panel: the sky cycles dawn→night with a moving sun and moon, stars come out, the manor's windows light up, and a police car rolls in when you're running hot. |

**Win:** bank **£500,000 clean** and buy *The Gentleman's Exit*. How you lived —
family and clean hands, community goodwill, a trail of bodies, low heat, or high
reputation, or a rival kingpin left broken behind you — decides which of eight endings you get.

Controls: tap/click everything. Speed controls (⏸ 1× 2× 4×) and a 🌙 *Dawn* skip (lie
low to cool your heat) live in the top bar. Each busy tab has a **segmented sub-tab bar**
(e.g. Business → Fronts / Lifestyle / Upgrades / Bank) so you switch between sections
instead of scrolling one long list. Progress autosaves to `localStorage` every 15 seconds
— and you can **export/import a save** from Ledger → Log (as a downloadable `.json` file
or a paste-able text block) to back it up or move it to another device.

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
| `index.html` | The whole game — markup, styles, engine, and an embedded copy of three.js (r147, MIT) so it stays a single self-contained file |
| `manifest.json` | PWA manifest (scoped to `/game/`) |
| `sw.js` | Offline service worker (network-first, `/game/` scope only) |
| `icon.svg` | App icon |
