# Chunk's KitBot

> Mineflayer bot for 6b6t anarchy. Handles kit delivery, auto-messages, head movement, auto-portal-walk, and reconnects. Configurable via `config.json`.

> **Beta** — works, but expect rough edges.

---

## Features

- Kit delivery to authorized players via whisper (`kit <type> <amount>`)
- Pathfinds to chests, withdraws items, TPAs to player, tosses shulkers
- Auto-portal walk on spawn (configurable distance)
- Auto-messages module (random interval chat)
- Head movement module (idle anti-AFK)
- Auto-reconnect with configurable delay & max attempts
- Web viewer on port `3007`
- Interactive terminal console

---

## Requirements

### Linux / Windows
- Node.js ≥ 20
- npm

### Android (Termux)
```bash
pkg install nodejs git
# Optional (for canvas/viewer):
pkg install build-essential cairo libjpeg-turbo-dev giflib libpng-dev
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
  "host": "play.6b6t.org",
  "port": 25565,
  "username": "YourBotName",
  "auth": "offline",
  "loginCommand": "/login YourPassword",
  "allowedPlayers": ["player1", "player2"],
  "kitChests": {
    "tools": { "x": 0, "y": 0, "z": 0 },
    "armor": { "x": 0, "y": 0, "z": 0 },
    "pvp3":  { "x": 0, "y": 0, "z": 0 },
    "pvp2":  { "x": 0, "y": 0, "z": 0 },
    "pvp1":  { "x": 0, "y": 0, "z": 0 }
  },
  "maxKits": 9,
  "portalWalkDistance": 14,
  "reconnect": {
    "enabled": true,
    "delay": 5000,
    "maxAttempts": 5
  },
  "modules": {
    "kitBot": true,
    "autoMessages": true,
    "headMovement": true
  },
  "autoMessages": {
    "interval": 60000,
    "messages": [
      "your message here",
      "another message"
    ]
  }
}
```

| Field | Description |
|---|---|
| `host` / `port` | Server address |
| `username` / `auth` | Bot name, use `"offline"` for cracked |
| `loginCommand` | Sent 2s after spawn (e.g. `/login pass`) |
| `allowedPlayers` | Who can whisper kit requests |
| `kitChests` | Named chest coords for each kit type |
| `maxKits` | Max items per order (capped server-side too) |
| `portalWalkDistance` | Blocks to walk forward on spawn (for portal entry) |
| `reconnect.delay` | MS to wait before reconnect |
| `reconnect.maxAttempts` | Max reconnects before shutdown |
| `modules.*` | Toggle kitBot / autoMessages / headMovement |
| `autoMessages.interval` | MS between auto-messages |
| `autoMessages.messages` | Pool of messages (random pick) |

---

## Usage

### Whisper commands (in-game)
Only players listed in `allowedPlayers` can use these.
```
kit <type> <amount>
```
Example: `kit pvp1 3`

Bot will:
1. Pathfind to the chest
2. Withdraw items
3. `/tpa` to you
4. Toss shulkers when within 6 blocks
5. `/kill` itself to reset

### Console commands (terminal)

| Command | Description |
|---|---|
| `say <msg>` | Send chat message |
| `pos` | Print bot position |
| `gm` | Print current gamemode |
| `goto <x> <y> <z>` | Pathfind to coords |
| `walk <blocks>` | Walk forward N blocks |
| `msg <player> <msg>` | Send whisper |
| `kit <player> <type> <amount>` | Manual kit delivery |
| `inv` | Print inventory |
| `status` | Print busy state + module status |
| `clear` | Clear terminal |
| `exit` | Shutdown |

### Web viewer
Open `http://localhost:3007` — first-person view of the bot.

> Block textures may look off in the viewer, that's normal.

---

## Notes

- Bot auto-walks into the portal `portalWalkDistance` blocks forward ~10s after spawn. Make sure it's facing the portal on login.
- If spawning in a lobby, manually `/skiplobby` on the account first.
- Head movement and auto-messages pause during kit delivery.
- After delivery the bot `/kill`s itself — this is intentional to reset inventory state.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `ECONNREFUSED` | Check `host` / `port` in config |
| Kits not delivered | Check `kitChests` coords and `allowedPlayers` |
| Canvas errors (Termux) | Install `cairo`, `libpng`, etc. |
| Stuck in lobby | Log in manually and run `/skiplobby` |
| Reconnect loop | Check `maxAttempts`, may need a longer `delay` |

---

## License

MIT

---

## Thanks

- THC (The Helpful Clan) — main clan on 6b6t
- Celery (very healthy vegetable, 10/10)
- Banana (also good)
