# Ark Horizon

A browser-based 3D spaceship-management game built with Three.js, inspired by
Mass Effect: Andromeda and FTL. You command the colony ark *Horizon*, searching
the cluster for a habitable "golden world" while managing crew, resources and
alien ambushes.

**Play:** deploy this repo and open `/game/`, or serve locally:

```
python3 -m http.server 8000   # from the repo root
# → http://localhost:8000/game/
```

No build step — plain ES modules. Three.js (v0.160) is vendored in `lib/` so
the game is fully self-contained and works under the site's CSP.

## How it plays

- **Choose your ship** — every new voyage starts with a hangar screen offering four
  hulls with different stats and room grids: the *Horizon* colony ark (balanced),
  the *Nighthawk* stealth corvette (deadly guns, cheap jumps, thin hull), the
  *Atlas* industrial hauler (huge hull and cargo yields, weak guns) and the
  *Vanguard* assault cruiser (combat all-rounder).
- **Manage the interior** — the 🛠 Ship button opens a 3D deck plan. Crew figures
  stand in the rooms matching their stations and walk when reassigned; damaged
  systems flash red alarms in their rooms. Spend alloys on empty slots to build
  gun turrets, medbays, hydroponics, quarters, engineering bays, shield
  capacitors and cargo pods — rooms gate station capacity (2 crew per turret,
  etc.) and grant passive bonuses.
- **Explore** — jump between stars on the galaxy map (costs fuel), scan planets,
  send ground expeditions for alloys / fuel / food. Skim gas giants for fuel.
- **Crew** — assign everyone to stations (gunnery, helm, repair bays, medbay,
  hydroponics). Matching specialists are twice as effective. Crew eats daily.
- **Combat** — aliens ambush you in dangerous systems and attack in waves.
  Shields absorb hits, then hull and ship systems take damage. Reassign crew
  mid-fight to repair systems and man the guns, or attempt an emergency jump.
- **Expand** — found outposts (≥40% habitability) for daily supply income.
- **Win** — colonize a golden world (≥85% habitability, 120 alloys, 6+ crew).
  Lose the hull or the whole crew and the voyage ends.

Progress autosaves to `localStorage`.

## Code layout

| File | Purpose |
|---|---|
| `js/data.js` | Constants, balance numbers, seeded RNG, name generators |
| `js/state.js` | Game state, procedural galaxy generation, derived stats, save/load |
| `js/scene.js` | All Three.js rendering: views, ship/planet/alien models, effects |
| `js/combat.js` | Wave-based combat encounter logic |
| `js/sim.js` | Once-per-second simulation (food, repairs, missions, outposts) |
| `js/ui.js` | DOM HUD, panels and modals |
| `js/main.js` | Bootstrap, actions, view switching, main loop |

Debug hook: `window.__ark` exposes `state` and `actions` in the console.
