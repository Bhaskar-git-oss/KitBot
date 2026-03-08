// ===== Banner =====
const figlet = require("figlet");
const gradient = require("gradient-string");
console.log(
  gradient.pastel.multiline(
    figlet.textSync("> KitBot", { font: "Slant" }),
  ),
);

// ===== Imports =====
const mineflayer = require("mineflayer");
const {
  pathfinder,
  Movements,
  goals: { GoalBlock },
} = require("mineflayer-pathfinder");
const mcDataLoader = require("minecraft-data");
const readline = require("readline");
const config = require("./config.json");
const { Vec3 } = require("vec3");

// ===== ANSI color codes for terminal output =====
const C = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

// ===== Terminal / REPL setup =====
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `${C.cyan}kitbot>${C.reset} `,
});

// Timestamped, color-coded logger with optional bot name prefix
function log(type, msg, botName = null) {
  const time = new Date().toISOString().split("T")[1].split(".")[0];
  const color =
    {
      BOOT: C.cyan,
      EVENT: C.green,
      ERROR: C.red,
      KIT: C.magenta,
      MOVE: C.yellow,
      VIEWER: C.cyan,
      CONSOLE: C.gray,
      WHISPER: C.blue,
      OP: C.magenta,
    }[type] || C.gray;
  const prefix = botName ? `${C.yellow}[${botName}]${C.reset} ` : "";
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(
    `${C.gray}[${time}]${C.reset} ${color}[${type}]${C.reset} ${prefix}${msg}`,
  );
  rl.prompt(true);
}

// ===== Operator list =====
// Loaded from config.bots[0].allowedPlayers, editable at runtime via console or whisper
const runtimeAllowedPlayers = new Set(
  config.bots[0]?.allowedPlayers || []
);

// ===== Bot factory =====
// Creates and manages a single bot instance (reconnect, modules, events)
function createBotInstance(botConfig, isMain) {
  const state = {
    bot: null,
    busy: false,
    viewerStarted: false,
    initialSetupDone: false,
    reconnectAttempts: 0,
    msgInterval: null,
    headInterval: null,
  };

  const name = botConfig.username;
  const _debounce = {};

  // Debounced log — prevents log spam for repeated events within 500ms
  function dlog(type, msg, key) {
    const k = key || `${type}:${msg}`;
    const now = Date.now();
    if (_debounce[k] && now - _debounce[k] < 500) return;
    _debounce[k] = now;
    log(type, msg, name);
  }

  // ===== Auto Messages =====
  // Sends random messages from config at a set interval, skips if bot is busy
  function startAutoMessages() {
    const amCfg = botConfig.autoMessages || config.autoMessages;
    if (!amCfg?.messages?.length) return;

    state.msgInterval = setInterval(() => {
      if (state.busy) return;
      const msg =
        amCfg.messages[Math.floor(Math.random() * amCfg.messages.length)];
      state.bot.chat(msg);
      log("CONSOLE", `[AUTO] ${msg}`, name);
    }, amCfg.interval || 60000);

    log("BOOT", "Auto messages started", name);
  }

  // ===== Head Movement =====
  // Randomly rotates the bot's head every 2.5s to appear more human
  function startHeadMovement() {
    state.headInterval = setInterval(() => {
      if (state.busy) return;
      const yaw = Math.random() * Math.PI * 2 - Math.PI;
      const pitch = Math.random() * 1.2 - 0.6;
      state.bot.look(yaw, pitch, false);
    }, 2500);

    log("BOOT", "Head movement started", name);
  }

  // ===== Kit Module (main bot only) =====
  // Listens for whisper commands from allowed players to dispense kits
  function startKitModule() {
    const KIT_CHESTS = botConfig.kitChests;
    const MAX_KITS = botConfig.maxKits || config.maxKits || 9;

    state.bot.on("whisper", async (username, message) => {
      if (username === state.bot.username) return;

      const isAllowed = runtimeAllowedPlayers.has(username);
      const args = message.trim().split(" ");

      // Allowed players can add new players via whisper: "addplayer <username>"
      if (isAllowed && args[0] === "addplayer") {
        const target = args[1];
        if (!target) {
          return state.bot.chat(`/w ${username} Usage: addplayer <username>`);
        }
        if (runtimeAllowedPlayers.has(target)) {
          return state.bot.chat(`/w ${username} ${target} is already allowed.`);
        }
        runtimeAllowedPlayers.add(target);
        log("OP", `${username} added ${target} to allowed players`, name);
        return state.bot.chat(`/w ${username} Added ${target} to allowed players.`);
      }

      if (!isAllowed) return;
      if (state.busy) return state.bot.chat(`/w ${username} Bot busy.`);
      if (args[0] !== "kit") return;

      const type = args[1];
      const count = Math.max(1, Math.min(parseInt(args[2]) || 1, MAX_KITS));
      if (!KIT_CHESTS?.[type])
        return state.bot.chat(`/w ${username} Invalid kit.`);

      await handleKit(username, type, count, KIT_CHESTS, MAX_KITS);
    });

    log("BOOT", "Kit module started", name);
  }

  // Handles the full kit delivery flow: navigate → open chest → withdraw → TPA → toss items → /kill
  async function handleKit(username, kitType, count, KIT_CHESTS, MAX_KITS) {
    try {
      state.busy = true;
      log("KIT", `${username} ordered ${count}x ${kitType}`, name);

      const posData = KIT_CHESTS[kitType];
      const chestPos = new Vec3(posData.x, posData.y, posData.z);

      // Navigate to chest if not already close enough
      if (state.bot.entity.position.distanceTo(chestPos) > 2) {
        try {
          log(
            "MOVE",
            `Going to chest at ${chestPos.x}, ${chestPos.y}, ${chestPos.z}`,
            name,
          );
          await state.bot.pathfinder.goto(
            new GoalBlock(chestPos.x, chestPos.y, chestPos.z),
          );
        } catch {
          /* close enough, continue */
        }
      }

      // Open chest and withdraw up to `count` stacks
      const block = state.bot.blockAt(chestPos);
      if (!block) throw new Error("Chest not found");
      const chest = await state.bot.openContainer(block);

      let taken = 0;
      for (const item of chest.containerItems()) {
        if (taken >= count) break;
        const amt = Math.min(item.count, count - taken);
        await chest.withdraw(item.type, null, amt);
        taken += amt;
      }
      await chest.close();

      if (!taken) return state.bot.chat(`/w ${username} Chest empty.`);
      log("KIT", `Withdrew ${taken}`, name);

      // TPA to player and wait up to 45s for them to be in range
      state.bot.chat(`/tpa ${username}`);
      log("KIT", `TPA sent to ${username}`, name);

      const start = Date.now();
      let delivered = false;

      while (Date.now() - start < 45000) {
        await state.bot.waitForTicks(20);
        const target = state.bot.players[username]?.entity;
        if (!target) continue;

        // Drop all shulker boxes when player is within 6 blocks
        if (state.bot.entity.position.distanceTo(target.position) < 6) {
          log("KIT", `${username} nearby, delivering`, name);
          await state.bot.lookAt(target.position.offset(0, 1.6, 0), true);
          for (const item of state.bot.inventory.items()) {
            if (!item.name.includes("shulker")) continue;
            await state.bot.tossStack(item);
            await state.bot.waitForTicks(10);
          }
          delivered = true;
          break;
        }
      }

      if (!delivered) {
        state.bot.chat(`/w ${username} Delivery timed out.`);
        log("KIT", `Timed out delivering to ${username}`, name);
        return;
      }

      // /kill after delivery to reset inventory/position
      log("KIT", "Done, /kill in 3s", name);
      await new Promise((r) => setTimeout(r, 3000));
      state.bot.chat("/kill");
    } catch (err) {
      log("ERROR", err.message, name);
    } finally {
      state.busy = false;
    }
  }

  // ===== Cleanup =====
  // Clears all intervals and resets state (called before reconnect)
  function cleanup() {
    if (state.msgInterval) {
      clearInterval(state.msgInterval);
      state.msgInterval = null;
    }
    if (state.headInterval) {
      clearInterval(state.headInterval);
      state.headInterval = null;
    }
    state.busy = false;
    state.initialSetupDone = false;
  }

  // ===== Reconnect =====
  // Schedules a reconnect attempt with delay, up to maxAttempts
  function scheduleReconnect() {
    const reconnectCfg = botConfig.reconnect || config.reconnect;
    if (!reconnectCfg?.enabled) return;

    const { delay, maxAttempts } = reconnectCfg;
    if (state.reconnectAttempts >= maxAttempts) {
      log("ERROR", `Max reconnect attempts reached. Giving up.`, name);
      return;
    }

    state.reconnectAttempts++;
    log(
      "BOOT",
      `Reconnecting in ${delay / 1000}s... (${state.reconnectAttempts}/${maxAttempts})`,
      name,
    );
    setTimeout(() => spawnBot(), delay);
  }

  // ===== Bot spawn =====
  // Creates the mineflayer bot, loads plugins, and wires up all event listeners
  function spawnBot() {
    cleanup();

    state.bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: botConfig.username,
      auth: botConfig.auth || config.auth || "offline",
      version: "1.20.1",
    });

    state.bot.loadPlugin(pathfinder);

    state.bot.on("connect", () => dlog("EVENT", "Connected"));
    state.bot.on("login", () => dlog("EVENT", "Logged in", "login"));
    state.bot.on("end", () => {
      dlog("EVENT", "Disconnected");
      scheduleReconnect();
    });
    state.bot.on("kicked", (r) => {
      log("ERROR", `Kicked: ${r}`, name);
      scheduleReconnect();
    });
    state.bot.on("error", (e) => log("ERROR", e.message, name));

    // Re-init pathfinder movements after respawn
    state.bot.on("respawn", () => {
      dlog("EVENT", "Respawned", "respawn");
      state.bot.pathfinder.stop();
      const mcData = mcDataLoader(state.bot.version);
      state.bot.pathfinder.setMovements(new Movements(state.bot, mcData));
    });

    state.bot.on("spawn", async () => {
      dlog("EVENT", "Spawned", "spawn");
      state.bot.pathfinder.stop();

      // On reconnects, just re-init pathfinder and skip full setup
      if (state.initialSetupDone) {
        const mcData = mcDataLoader(state.bot.version);
        state.bot.pathfinder.setMovements(new Movements(state.bot, mcData));
        return;
      }

      state.initialSetupDone = true;
      state.reconnectAttempts = 0;

      // Send login command (e.g. /login <password>) after a short delay
      const loginCmd = botConfig.loginCommand || config.loginCommand;
      if (loginCmd) {
        setTimeout(() => {
          state.bot.chat(loginCmd);
          log("BOOT", "Sent login command", name);
        }, 2000);
      }

      await state.bot.waitForTicks(40);

      const mcData = mcDataLoader(state.bot.version);
      state.bot.pathfinder.setMovements(new Movements(state.bot, mcData));
      log("BOOT", "Pathfinder ready", name);

      // Kit module — main bot only
      if (isMain) startKitModule();

      // Auto messages + head movement — all bots
      startAutoMessages();

      // Walk forward into portal on spawn to get to the right dimension/location
      setTimeout(async () => {
        const dist =
          botConfig.portalWalkDistance || config.portalWalkDistance || 13;
        const yaw = state.bot.entity.yaw;
        const tx = state.bot.entity.position.x + -Math.sin(yaw) * dist;
        const ty = state.bot.entity.position.y;
        const tz = state.bot.entity.position.z + -Math.cos(yaw) * dist;
        log("MOVE", `Auto-walking ${dist} blocks into portal`, name);
        try {
          await state.bot.pathfinder.goto(
            new GoalBlock(Math.floor(tx), Math.floor(ty), Math.floor(tz)),
          );
          log("MOVE", "Portal walk done", name);
        } catch {
          log("MOVE", "Portal walk timed out", name);
        }
        startHeadMovement();
      }, 6000);

      // Log incoming whispers with distinct color
      state.bot.on("whisper", (username, message) => {
        if (username === state.bot.username) return;
        log("WHISPER", `${username}: ${message}`, name);
      });

      log("BOOT", "Bot ready", name);
    });
  }

  spawnBot();
  return state;
}

// ===== Launch all bots =====
// Stagger spawns by 3.5s each to avoid simultaneous login spam
const botConfigs = config.bots;
const instances = botConfigs.map(() => null);

botConfigs.forEach((botCfg, i) => {
  setTimeout(() => {
    instances[i] = createBotInstance(botCfg, i === 0);
  }, i * 3500);
});

const mainState = {
  get bot() {
    return instances[0]?.bot;
  },
};

// ===== Console REPL (controls main bot) =====
rl.prompt();

rl.on("line", async (line) => {
  const args = line.trim().split(" ");
  const cmd = args[0];
  const bot = mainState.bot;

  try {
    switch (cmd) {
      // Send a chat message
      case "say":
        bot.chat(args.slice(1).join(" "));
        break;

      // Run any in-game command directly
      case "cmd":
        if (args.length < 2) {
          log("CONSOLE", "Usage: cmd <command>");
          break;
        }
        bot.chat(args.slice(1).join(" "));
        log("CONSOLE", `-> Ran: ${args.slice(1).join(" ")}`);
        break;

      // Print current bot position
      case "pos":
        log("CONSOLE", JSON.stringify(bot.entity?.position));
        break;

      // Print current gamemode
      case "gm":
        log("CONSOLE", `Gamemode: ${bot.game?.gameMode}`);
        break;

      // Pathfind to absolute coordinates
      case "goto":
        if (args.length < 4) break;
        await bot.pathfinder.goto(
          new GoalBlock(
            parseInt(args[1]),
            parseInt(args[2]),
            parseInt(args[3]),
          ),
        );
        log("MOVE", "Arrived");
        break;

      // Whisper a player
      case "msg":
        if (args.length < 3) break;
        bot.chat(`/w ${args[1]} ${args.slice(2).join(" ")}`);
        log("CONSOLE", `-> Whisper sent to ${args[1]}`);
        break;

      // Manually trigger a kit delivery from console
      case "kit":
        if (args.length < 3) break;
        (await mainState.bot.pathfinder) &&
          instances[0].handleKit?.(args[1], args[2], parseInt(args[3]));
        break;

      // Print inventory contents
      case "inv":
        log("CONSOLE", JSON.stringify(bot.inventory.items(), null, 2));
        break;

      // Walk N blocks forward relative to current facing direction
      case "walk": {
        if (args.length < 2) break;
        const blocks = parseFloat(args[1]);
        if (isNaN(blocks) || blocks <= 0) break;
        const yaw = bot.entity.yaw;
        const tx = bot.entity.position.x + -Math.sin(yaw) * blocks;
        const ty = bot.entity.position.y;
        const tz = bot.entity.position.z + -Math.cos(yaw) * blocks;
        log("MOVE", `Walking ${blocks} blocks forward`);
        await bot.pathfinder.goto(
          new GoalBlock(Math.floor(tx), Math.floor(ty), Math.floor(tz)),
        );
        log("MOVE", "Arrived");
        break;
      }

      // Print busy status for all bot instances
      case "status":
        instances.forEach((inst, i) => {
          log(
            "CONSOLE",
            `bot${i} (${botConfigs[i].username}) busy=${inst?.busy}`,
          );
        });
        break;

      // Manage the runtime allowed players list
      case "op": {
        const subCmd = args[1];
        const target = args[2];

        if (subCmd === "add") {
          if (!target) { log("CONSOLE", "Usage: op add <username>"); break; }
          if (runtimeAllowedPlayers.has(target)) {
            log("OP", `${target} is already an allowed player`);
            break;
          }
          runtimeAllowedPlayers.add(target);
          log("OP", `Added ${target} to allowed players`);
        } else if (subCmd === "remove") {
          if (!target) { log("CONSOLE", "Usage: op remove <username>"); break; }
          if (!runtimeAllowedPlayers.has(target)) {
            log("OP", `${target} is not in the allowed list`);
            break;
          }
          runtimeAllowedPlayers.delete(target);
          log("OP", `Removed ${target} from allowed players`);
        } else if (subCmd === "list") {
          log("OP", `Allowed players: ${[...runtimeAllowedPlayers].join(", ") || "none"}`);
        } else {
          log("CONSOLE", "Usage: op <add|remove|list> [username]");
        }
        break;
      }

      case "clear":
        console.clear();
        break;

      case "exit":
        log("BOOT", "Shutting down");
        process.exit(0);
        break;

      default:
        log("CONSOLE", "Unknown command");
    }
  } catch (e) {
    log("ERROR", e.message);
  }

  rl.prompt();
});
