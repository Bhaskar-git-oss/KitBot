# NOTE

- The bot is completely written by AI(GPT-5). You might hate me for that, that's not wrong, I hate it too. But still I have tested the bot myself and it works on my test environment.
- The bot is also in its BETA phase so stuff might not work as intended.
- Contributors are limited, so not everyone's contribution will be accepted.
- AND the bot currently doesn't work on 6b6t, as 6b6t kicks it, if someone can find a fix make a pull-request.
- and btw you have to make the bot enter the portal in the login world youself with `walk 14` in the console
- The console needs some updates, it's good but gets messy overtime.

# KitBot

Mineflayer bot for Minecraft that handles kit delivery and has a simple console & web viewer. Configurable via `config.json`.

---

## Features
- Deliver kits automatically to authorized players (`kit <type> <amount>` via whisper)
- Pathfind to chests and give items
- Interactive terminal commands (`say`, `goto`, `inv`, etc.)
- Web viewer on port 3007

---

## Requirements

### Linux
- Node.js ≥ 18
- NPM

### Android (Termux)
- Termux app
- Node.js ≥ 18 (`pkg install nodejs`)
- Git (`pkg install git`)
- Optional canvas libs: `pkg install build-essential cairo libjpeg-turbo-dev giflib libpng-dev`

---

## Installation

```bash
git clone https://github.com/Bhaskar-git-oss/KitBot.git
cd kit-bot
npm install
node index.js
````

---

## Configuration (`config.json`)

Edit `config.json`:

```json
{
  "host": "alt2.6b6t.org", //this one works to join 6b
  "port": 25565,
  "username": "{bot-name}",
  "auth": "offline",
  "loginCommand": "/login {password}",
  "allowedPlayers": ["player1", "player2", "player3"],
  "kitChests": {
    "kit5": { "x": 100, "y": 64, "z": 100 },
    "kit4": { "x": 101, "y": 64, "z": 100 },
    "kit3": { "x": 102, "y": 64, "z": 100 },
    "kit2": { "x": 103, "y": 64, "z": 100 },
    "kit1": { "x": 104, "y": 64, "z": 100 }
  },
  "maxKits": 6
}
```

* `host` / `port` – Minecraft server
* `username` / `auth` – Bot name and auth type(use offline)
* `loginCommand` – `/login` command
* `allowedPlayers` – Players allowed to use `/kit`
* `kitChests` – Chest coordinates for each kit type
* `maxKits` – Max items per order

---

## Commands

**Via whispers:**

```
kit <type> <amount>
```

**Console commands:**

* `say <message>` – Chat
* `pos` – Show bot position
* `gm` – Show gamemode
* `goto <x> <y> <z>` – Move bot
* `msg <player> <message>` – Whisper
* `kit <player> <type> <amount>` – Manual kit delivery
* `inv` – List items in the inventory
* `walk <blocks>` – Move forward
* `clear` – Clear terminal
* `exit` – Stop bot

**Viewer:** open `http://localhost:3007`

---

## Troubleshooting

* `ECONNREFUSED` → Check server host/port
* Kits not delivered → Check `kitChests` & `allowedPlayers`
* Canvas errors (Termux) → Install required libs (`cairo`, `libpng`, etc.)
* In the Prismarine Viewer the blocks might be random, so be aware.
* If the bot spawns in the lobby, you need to log on the account and run /skiplobby in the world.

---

## License

MIT

## Thanks to

- Myself (for the bot)
- THC (The Helpful Clan) (for being my main clan)
- Celery (very healthy vebetable, you should try too)
- Bannana (good fruit)
