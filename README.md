# KitBot

> Mineflayer-based kitbot for anarchy servers. Handles kit delivery, queue management, auto-messages, head movement, portal-walk, operator management, and multi-bot support — all configurable via `config.json`.

> **Beta** — works, but expect rough edges.

---

## Changelog

### Latest
- FIFO queue system with 10-minute cooldown windows — one player served per window, others stack up in order
- Per-player queue notifications — told when queued, their position, ETA, and when it's their turn
- Unauthorized whisper detection — unknown players trying known commands get rejected
- `stocks` command — bot scans all configured chests and reports contents in-game and in console
- `help` command — available via whisper and console; op commands hidden from players
- `window` / `cooldown` console commands — check remaining cooldown window time
- `queue` console command — view current delivery queue

### Previous
- Refactored and trimmed codebase (~515 → ~230 lines, no functionality lost)

---

## Features

- Kit delivery via whisper — pathfinds to chest, withdraws shulkers, TPAs to player, drops items, `/kill`s to reset
- FIFO queue with cooldown windows — one delivery per 10-minute window, fair ordering, automatic ETA updates
- Chest stock scanning — checks all kit chests and reports what's in them
- Multi-bot support — run multiple bots with staggered logins (3.5s apart)
- Runtime operator management — add/remove allowed players via console or whisper, persisted to `config.json`
- Auto-portal walk on spawn (configurable distance)
- Auto-messages — random chat messages at a set interval, paused during delivery
- Head movement — random idle rotations for anti-AFK, paused during delivery
- Auto-reconnect with configurable delay and max attempts
- Color-coded, timestamped terminal logger
- Interactive terminal REPL (controls main bot)

---

## Requirements

- Node.js ≥ 20
- npm

### Android (Termux)
```bash
pkg install nodejs git
# Optional (for canvas/viewer):
pkg install build-essential libjpeg-turbo giflib libpng
```

---

## Installation

```bash
git clone https://github.com/Bhaskar-git-oss/KitBot.git
cd KitBot
npm install
node index.js
```

---

## Configuration (`config.json`)

```json
{
  "host": "your.server.ip",
  "port": 25565,
  "reconnect": {
    "enabled": true,
    "delay": 5000,
    "maxAttempts": 5
  },
  "portalWalkDistance": 14,
  "kitCooldownMs": 600000,
  "deliveryTimeoutMs": 45000,
  "queueNotifyOnStart": true,
  "autoMessages": {
    "interval": 60000,
    "messages": [
      "Your ad message here!",
      "Another message here."
    ]
  },
  "bots": [
    {
      "username": "YourMainBot",
      "auth": "offline",
      "loginCommand": "/login yourpassword",
      "allowedPlayers": ["YourUsername"],
      "kitChests": {
        "tools":  { "x": 0, "y": 0, "z": 0 },
        "armor":  { "x": 0, "y": 0, "z": 0 },
        "random": { "x": 0, "y": 0, "z": 0 },
        "tsr":    { "x": 0, "y": 0, "z": 0 },
        "pvp":    { "x": 0, "y": 0, "z": 0 }
      },
      "maxKits": 9
    },
    {
      "username": "YourSecondBot",
      "auth": "offline",
      "loginCommand": "/login yourpassword"
    }
  ]
}
```

| Field | Description |
|---|---|
| `host` / `port` | Server address |
| `reconnect.enabled` | Toggle auto-reconnect |
| `reconnect.delay` | MS to wait before reconnecting |
| `reconnect.maxAttempts` | Max reconnects before giving up |
| `portalWalkDistance` | Blocks to walk forward on spawn |
| `kitCooldownMs` | Cooldown window length in ms (default 600000 = 10min) |
| `deliveryTimeoutMs` | How long to wait for TPA before timing out (default 45000) |
| `queueNotifyOnStart` | Notify player when it's their turn (default true) |
| `autoMessages.interval` | MS between auto-messages |
| `autoMessages.messages` | Message pool (random pick each interval) |
| `bots` | Array of bot configs (first bot = main kit bot) |
| `bots[].username` / `auth` | Bot name, use `"offline"` for cracked |
| `bots[].loginCommand` | Sent 2s after spawn (e.g. `/login pass`) |
| `bots[].allowedPlayers` | Who can use whisper commands (main bot only) |
| `bots[].kitChests` | Named chest coords for each kit type |
| `bots[].maxKits` | Max stacks per order |

> **Multi-bot:** The first entry in `bots[]` is always the main kit bot. Additional bots only get auto-messages and head movement — no kit module.

---

## Usage

### Whisper commands (in-game)

Only players in `allowedPlayers` can request kits. `help` and `stocks` are open to anyone.

| Command | Description |
|---|---|
| `kit <type> [count]` | Request a kit — queued if window is active |
| `stocks` | Show what's currently in each kit chest |
| `help` | Show available commands |
| `addplayer <username>` | Add a player to the whitelist (ops only) |
| `removeplayer <username>` | Remove a player from the whitelist (ops only) |

**Kit delivery flow:**
1. Bot pathfinds to the chest
2. Withdraws up to `<count>` stacks
3. `/tpa`s to you
4. Tosses shulkers when within 6 blocks
5. `/kill`s itself to reset

**Queue flow:**
- Orders are processed one at a time, FIFO
- A 10-minute cooldown window starts after each delivery
- Players are notified of their queue position and estimated wait
- When it's your turn you get a notification before the bot starts

---

### Console commands (terminal)

| Command | Description |
|---|---|
| `say <msg>` | Send a chat message |
| `cmd <command>` | Run any in-game command |
| `pos` | Print current bot position |
| `gm` | Print current gamemode |
| `inv` | Print inventory contents |
| `goto <x> <y> <z>` | Pathfind to coordinates |
| `walk <blocks>` | Walk N blocks forward (relative to facing) |
| `msg <player> <msg>` | Send a whisper |
| `kit <player> <type> [count]` | Manually trigger a kit delivery |
| `stocks` | Scan all kit chests and print contents |
| `queue` | Show current delivery queue |
| `window` / `cooldown` | Show remaining cooldown window time |
| `status` | Show busy state for all bot instances |
| `op add <username>` | Add a player to the whitelist (saved to config) |
| `op remove <username>` | Remove a player from the whitelist (saved to config) |
| `op list` | List all currently allowed players |
| `clear` | Clear terminal |
| `exit` | Shutdown |
| `help` | Show all commands |

---

## Notes

- The bot auto-walks `portalWalkDistance` blocks forward ~6s after spawn. Make sure it's facing the portal on login.
- If spawning in a lobby, manually run `/skiplobby` on the account first.
- Head movement and auto-messages pause automatically during kit delivery.
- After delivery the bot `/kill`s itself — intentional, resets inventory and position.
- `op` console commands and `addplayer`/`removeplayer` whisper commands all write to `config.json` immediately — changes survive restarts.
- All bots stagger login by 3.5s to avoid simultaneous connection spam.
- The cooldown window is bot-wide, not per-player. One player per window, everyone else waits in queue.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `ECONNREFUSED` | Check `host` / `port` in config |
| Kits not delivered | Verify `kitChests` coords and that your name is in `allowedPlayers` |
| Bot stuck / not walking | Check `portalWalkDistance`, make sure bot is facing the portal |
| Canvas errors (Termux) | Install `cairo`, `libpng`, etc. (see Requirements) |
| Stuck in lobby | Log in manually and run `/skiplobby` |
| Reconnect loop | Increase `delay` or `maxAttempts` in reconnect config |
| Both bots connect simultaneously on first run | Server ghost sessions from previous run — wait a few seconds before restarting |
| Delivery timed out | Player didn't accept TPA in time — increase `deliveryTimeoutMs` or re-order |

---

## License

MIT

---

## Thanks

- NoSleepSmoke (Shrek) — original idea and motivation to get it working
- THC (The Helpful Clan)
- Celery (very healthy vegetable, 10/10)
- Banana (also good)
