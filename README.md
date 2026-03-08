# KitBot

> Mineflayer-based kitbot for anarchy servers. Handles kit delivery, auto-messages, head movement, portal-walk, operator management, and multi-bot support — all configurable via `config.json`.

> **Beta** — works, but expect rough edges.

---

## Features

- Kit delivery via whisper — pathfinds to chest, withdraws shulkers, TPAs to player, drops items, `/kill`s to reset
- Multi-bot support — run multiple bots with staggered spawns (3.5s apart)
- Runtime operator management — add/remove allowed players via console or whisper without restarting
- Auto-portal walk on spawn (configurable distance)
- Auto-messages — random chat messages at a set interval
- Head movement — random idle rotations for anti-AFK
- Auto-reconnect with configurable delay and max attempts
- Color-coded, timestamped terminal logger
- Interactive terminal REPL (controls main bot)

---

## Requirements

- Node.js ≥ 20
- npm

### Android (Termux) — ⚠️ not fully working yet
```bash
pkg install nodejs git
# Optional (for canvas/viewer):
pkg install build-essential cairo libjpeg-turbo-dev giflib libpng-dev
```

---

## Installation

```bash
git clone https://github.com/your-username/KitBot.git
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

Only players in `allowedPlayers` can use these.

```
kit <type> <amount>
```
Example: `kit pvp 3`

The bot will:
1. Pathfind to the chest
2. Withdraw up to `<amount>` stacks
3. `/tpa` to you
4. Toss shulkers when within 6 blocks
5. `/kill` itself to reset

```
addplayer <username>
```
Lets an allowed player add another player to the runtime list (no restart needed).

---

### Console commands (terminal)

| Command | Description |
|---|---|
| `say <msg>` | Send a chat message |
| `cmd <command>` | Run any in-game command directly |
| `pos` | Print current bot position |
| `gm` | Print current gamemode |
| `goto <x> <y> <z>` | Pathfind to coordinates |
| `walk <blocks>` | Walk N blocks forward (relative to facing) |
| `msg <player> <msg>` | Send a whisper |
| `kit <player> <type> <amount>` | Manually trigger a kit delivery |
| `inv` | Print inventory contents |
| `status` | Show busy state for all bot instances |
| `op add <username>` | Add a player to the runtime allowed list |
| `op remove <username>` | Remove a player from the allowed list |
| `op list` | List all currently allowed players |
| `clear` | Clear terminal |
| `exit` | Shutdown |

---

## Notes

- The bot auto-walks `portalWalkDistance` blocks forward ~6s after spawn. Make sure it's facing the portal on login.
- If spawning in a lobby, manually run `/skiplobby` on the account first.
- Head movement and auto-messages pause automatically during kit delivery.
- After delivery the bot `/kill`s itself — intentional, resets inventory and position.
- Operators added via `op add` or `addplayer` whisper only persist until restart. Edit `allowedPlayers` in config for permanent access.
- All bots stagger login by 3.5s each to avoid simultaneous connection spam.

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
| Second bot not connecting | Check stagger timing — it spawns 3.5s after the first |

---

## License

MIT

---

## Thanks

- NoSleepSmoke (Shrek) — original idea and motivation to get it working
- THC (The Helpful Clan)
- Celery (very healthy vegetable, 10/10)
- Banana (also good)
