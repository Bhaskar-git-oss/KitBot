# KitBot

> Mineflayer-based kitbot for anarchy. Whisper a kit type, get your stuff — queue system, multi-bot support, chest scanning, the works. Config lives in `config.json`.

> **Maintence Mode** — it works, and I believe it might be enough, but there might be a ton of features people might need so open up a issue for suggestions.

---

## Changelog

### Latest
- FIFO queue with 10-min cooldown windows — one delivery per window, rest stack up in order
- Queue notifications — players get told their position, ETA, and when it's their turn
- Unauthorized whisper detection — randoms trying commands get rejected
- `stocks` — bot scans all configured chests and dumps contents in-game + console
- `help` — works via whisper and console; op commands stay hidden from players
- `window` / `cooldown` — check remaining cooldown time from console
- `queue` — see who's waiting

---

## Features

- Kit delivery via whisper — pathfinds to chest, grabs shulkers, TPAs to player, drops items, `/kill`s to reset
- FIFO queue with cooldown windows — one delivery per 10 mins, fair order, auto ETA updates
- Chest stock scanning — check all kit chests at once
- Multi-bot support — staggered logins (3.5s apart)
- Runtime op management — add/remove players via console or whisper, saves to `config.json`
- Auto portal walk on spawn (configurable distance)
- Auto-messages — random chat spam at set intervals, pauses during delivery
- Head movement — random idle rotations so it doesn't look AFK, pauses during delivery
- Auto-reconnect — configurable delay and max attempts
- Color-coded timestamped terminal logger
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

## Setup (same for Android and Linux)

```bash
git clone https://github.com/Bhaskar-git-oss/KitBot.git
cd KitBot
npm install
node index.js
```

---

## Config (`config.json`)

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
        "tsr-kit":    { "x": 0, "y": 0, "z": 0 },
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
| `reconnect.delay` | MS before reconnecting |
| `reconnect.maxAttempts` | Give up after this many attempts |
| `portalWalkDistance` | Blocks to walk forward on spawn |
| `kitCooldownMs` | Cooldown window length (default 600000 = 10min) |
| `deliveryTimeoutMs` | TPA wait timeout (default 45000) |
| `queueNotifyOnStart` | Ping player when it's their turn (default true) |
| `autoMessages.interval` | MS between auto-messages |
| `autoMessages.messages` | Message pool, picks randomly |
| `bots` | Bot array — first entry is always the main kit bot |
| `bots[].username` / `auth` | Bot name, use `"offline"` for cracked |
| `bots[].loginCommand` | Sent 2s after spawn |
| `bots[].allowedPlayers` | Who can use kit commands (main bot only) |
| `bots[].kitChests` | Named coords for each kit type |
| `bots[].maxKits` | Max stacks per order |

> **Multi-bot:** First entry in `bots[]` = main kit bot. Extra bots only get auto-messages and head movement — no kit module.

---

## Usage

### Whisper commands

Only players in `allowedPlayers` can request kits. `help` and `stocks` are open to anyone.

| Command | Description |
|---|---|
| `kit <type> [count]` | Request a kit — gets queued if cooldown is active |
| `stocks` | See what's in each chest |
| `help` | Show available commands |
| `addplayer <username>` | Whitelist a player (ops only) |
| `removeplayer <username>` | Remove a player (ops only) |

**Delivery flow:**
1. Bot pathfinds to chest
2. Grabs up to `<count>` stacks
3. `/tpa`s to you
4. Drops shulkers when within 6 blocks
5. `/kill`s to reset

**Queue flow:**
- FIFO, one at a time
- 10-min cooldown window starts after each delivery
- Everyone gets their position + ETA
- You get pinged when it's your turn

---

### Console commands

| Command | Description |
|---|---|
| `say <msg>` | Send chat |
| `cmd <command>` | Run any in-game command |
| `pos` | Print bot position |
| `gm` | Print gamemode |
| `inv` | Print inventory |
| `goto <x> <y> <z>` | Pathfind to coords |
| `walk <blocks>` | Walk N blocks forward |
| `msg <player> <msg>` | Send a whisper |
| `kit <player> <type> [count]` | Manually trigger delivery |
| `stocks` | Scan all chests |
| `queue` | Show current queue |
| `window` / `cooldown` | Show remaining cooldown time |
| `status` | Busy state for all bots |
| `op add <username>` | Whitelist a player (saves to config) |
| `op remove <username>` | Remove a player (saves to config) |
| `op list` | List all allowed players |
| `clear` | Clear terminal |
| `exit` | Shutdown |
| `help` | Show all commands |

---

## Notes

- Bot auto-walks `portalWalkDistance` blocks ~6s after spawn. Make sure it's facing the portal on login.
- If it spawns in a lobby, log in manually and run `/skiplobby` first.
- Head movement and auto-messages pause during delivery automatically.
- The `/kill` after delivery is intentional — resets inventory and position.
- `op` and `addplayer`/`removeplayer` commands write to `config.json` immediately. Changes survive restarts.
- Bots stagger login by 3.5s to avoid spamming the server.
- Cooldown is bot-wide, not per-player — one delivery per window, everyone else waits.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `ECONNREFUSED` | Check `host` / `port` in config |
| Kits not delivering | Check `kitChests` coords + make sure you're in `allowedPlayers` |
| Bot stuck / not walking | Check `portalWalkDistance`, make sure it's facing the portal |
| Canvas errors (Termux) | Install `cairo`, `libpng`, etc. — see Requirements |
| Stuck in lobby | Log in manually, run `/skiplobby` |
| Reconnect loop | Bump up `delay` or `maxAttempts` |
| Both bots connect at the same time on first run | Ghost sessions from the last run — wait a few seconds then restart |
| Delivery timed out | Player didn't accept TPA in time — increase `deliveryTimeoutMs` or re-order |

---

## License

MIT

---

## Thanks

- NoSleepSmoke (Shrek) — original idea + reason this exists
- THC (The Helpful Clan)