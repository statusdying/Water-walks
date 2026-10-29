# Tak dlouho se chodí se džbánem pro vodu, až se ucho utrhne (1st-Person 3D Co-op Game)

A complete browser-based cooperative First-Person 3D low-poly multiplayer game built with **Three.js / React Three Fiber**, **Vite**, **TypeScript**, **Web Audio API**, and **Node.js WebSockets (`ws`)**.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Multiplayer Server & Client Together
```bash
npm run dev
```
- **Client (Vite):** `http://localhost:5173`
- **WebSocket Server (`ws`):** `ws://localhost:3001`

## Controls (First-Person POV)
- **Look Around:** Click inside the 3D scene to lock the mouse pointer and look around (or use `Left` / `Right` Arrow keys).
- **Walk & Balance Pitcher:**
  - `W` / `S` — Walk forward / backward along the 240m winding mountain trail.
  - `A` / `D` — Strafe left / right to **balance the pitcher in your right hand**! Walking only in a straight line causes the pitcher to tip over and spill your water on the ground.
- **Left-Hand Off-Hand Items:**
  - `1` — **Cigarette (`Cigareta`)**
  - `2` — **Butterfly Knife (`Motýlek`)**
  - `3` — **Fidget Spinner (`Fidget Spinner`)**
  - `R`, `Q`, or `Left Click` — **Perform Left-Hand Item Action** (smoke cigarette & exhale 3D smoke cloud, flip butterfly knife tricks, or flick & spin the fidget spinner).
- **Fill Pitcher (at Valley Spring) / Pour Water (at Hilltop Well):** Hold `E` or `Space`
- **Open Merchant Upgrade Cart:** Press `F` or `B` (or click **Kupecký Vůz** in the top-right HUD)
