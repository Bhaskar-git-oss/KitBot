const figlet     = require("figlet");
const gradient   = require("gradient-string");
const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals: { GoalBlock } } = require("mineflayer-pathfinder");
const mcData     = require("minecraft-data");
const readline   = require("readline");
const fs         = require("fs");
const { Vec3 }   = require("vec3");

let config = require("./config.json");

console.log(gradient.pastel.multiline(figlet.textSync("> KitBot", { font: "Slant" })));

// =============================================================================
// LOGGER
// Colored, timestamped output that plays nicely with the readline prompt.
// =============================================================================

const C = {
  reset: "\x1b[0m", gray: "\x1b[90m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", magenta: "\x1b[35m", blue: "\x1b[34m",
};

const LOG_COLORS = {
  BOOT: C.cyan, EVENT: C.green, ERROR: C.red, KIT: C.magenta,
  MOVE: C.yellow, CONSOLE: C.gray, WHISPER: C.blue, OP: C.magenta, QUEUE: C.cyan,
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `${C.cyan}kitbot>${C.reset} `,
});

function log(type, msg, bot = null) {
  const time   = new Date().toISOString().split("T")[1].split(":").slice(0, 2).join(":");
  const color  = LOG_COLORS[type] || C.gray;
  const prefix = bot ? `${C.yellow}[${bot}]${C.reset} ` : "";
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(`${C.gray}[${time}]${C.reset} ${color}[${type}]${C.reset} ${prefix}${msg}`);
  rl.prompt(true);
}

// =============================================================================
// OPERATOR LIST
// Loaded from config on startup, persisted back to config.json on every change.
// Only operators (allowedPlayers) can request kits or manage the whitelist.
// =============================================================================

const ops = new Set(config.bots[0]?.allowedPlayers || []);

function saveOps() {
  config.bots[0].allowedPlayers = [...ops];
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}

function opAdd(target, by = "console") {
  if (ops.has(target)) return `${target} is already allowed.`;
  ops.add(target);
  saveOps();
  log("OP", `${by} added ${target}`);
  return `Added ${target}.`;
}

function opRemove(target, by = "console") {
  if (!ops.has(target)) return `${target} is not in the list.`;
  ops.delete(target);
  saveOps();
  log("OP", `${by} removed ${target}`);
  return `Removed ${target}.`;
}

// =============================================================================
// QUEUE + COOLDOWN WINDOW
// One delivery per cooldown window. After each delivery a timer starts — no one
// else is served until it expires. Queued players are notified when it's their
// turn and get updated ETAs after each delivery.
// =============================================================================

const COOLDOWN_MS      = config.kitCooldownMs      || 600000; // 10 min default
const DELIVERY_TIMEOUT = config.deliveryTimeoutMs  || 45000;  // TPA wait limit
const QUEUE_NOTIFY     = config.queueNotifyOnStart !== false; // notify on turn start

const kitQueue   = []; // pending jobs: [{ username, kitType, count }]
let windowUntil  = 0;  // epoch ms when the current cooldown window expires
let queueRunning = false;

// How many ms until the window is open again (0 = open now)
const windowRemaining = () => Math.max(0, windowUntil - Date.now());

// Human-readable time from milliseconds, e.g. "9m 30s"
function formatTime(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// =============================================================================
// DISPLAY NAME HELPER
// Shulker boxes on anarchy servers often have custom names set via anvil.
// Mineflayer returns them as raw JSON text components which may also contain
// legacy § formatting codes. This strips both and falls back to registry name.
// =============================================================================

function getDisplayName(item) {
  if (!item.customName) return item.name;
  try {
    const parsed = JSON.parse(item.customName);
    const raw = typeof parsed === "string"
      ? parsed
      : (parsed.text || parsed.extra?.map(e => e.text || "").join("") || item.name);
    return raw.replace(/§[0-9a-fk-or]/gi, "").trim() || item.name;
  } catch {
    return item.customName.replace(/§[0-9a-fk-or]/gi, "").trim() || item.name;
  }
}

// =============================================================================
// HELP TEXT
// Players only see user-facing commands. Op commands stay hidden from whispers.
// =============================================================================

const PLAYER_HELP = [
  "kit <type> [count] - request a kit",
  "stocks            - show chest contents",
  "help              - show this message",
];

const CONSOLE_HELP = [
  "say <msg>              - chat as bot",
  "cmd <command>          - run a slash command",
  "pos                    - current bot position",
  "gm                     - current gamemode",
  "inv                    - inventory contents",
  "goto <x> <y> <z>       - pathfind to coords",
  "walk <blocks>          - walk N blocks forward",
  "msg <user> <text>      - whisper a player",
  "kit <user> <type> [n]  - manually trigger a kit delivery",
  "stocks                 - scan and dump all chest contents",
  "queue                  - show current delivery queue",
  "window / cooldown      - show cooldown window status",
  "status                 - show busy state of all bots",
  "op add|remove|list [u] - manage the operator whitelist",
  "clear                  - clear the console",
  "exit                   - shut down",
  "help                   - show this message",
];

// =============================================================================
// HELPERS
// =============================================================================

// Applies pathfinder movement settings for a bot instance
const setMovements = bot =>
  bot.pathfinder.setMovements(new Movements(bot, mcData(bot.version)));

// Returns the block position N blocks ahead of an entity based on its yaw
function forwardPos(entity, dist) {
  return {
    x: Math.floor(entity.position.x - Math.sin(entity.yaw) * dist),
    y: Math.floor(entity.position.y),
    z: Math.floor(entity.position.z - Math.cos(entity.yaw) * dist),
  };
}

// =============================================================================
// BOT FACTORY
// Each bot in config.bots gets its own instance with isolated state.
// Only the first bot (isMain) runs the kit module and handles whispers.
// =============================================================================

function createBot(botConfig, isMain) {
  const name  = botConfig.username;
  const state = {
    bot: null, busy: false,
    initialSetupDone: false, reconnectAttempts: 0,
    msgInterval: null, headInterval: null,
  };

  // Simple debounce map to suppress duplicate log spam within 500ms
  const _db = {};
  const dlog = (type, msg, key) => {
    const k = key || `${type}:${msg}`, now = Date.now();
    if (_db[k] && now - _db[k] < 500) return;
    _db[k] = now;
    log(type, msg, name);
  };

  // Clear intervals and reset state flags (called before every reconnect)
  function cleanup() {
    clearInterval(state.msgInterval);
    clearInterval(state.headInterval);
    state.msgInterval = state.headInterval = null;
    state.busy = state.initialSetupDone = false;
  }

  // Schedule a reconnect attempt using delay/maxAttempts from config
  function scheduleReconnect() {
    const rc = botConfig.reconnect || config.reconnect;
    if (!rc?.enabled) return;
    if (state.reconnectAttempts >= rc.maxAttempts)
      return log("ERROR", "Max reconnects reached, giving up.", name);
    state.reconnectAttempts++;
    log("BOOT", `Reconnecting in ${rc.delay / 1000}s... (${state.reconnectAttempts}/${rc.maxAttempts})`, name);
    setTimeout(spawn, rc.delay);
  }

  // Sends a random message from the pool on a timer; skipped while delivering
  function startAutoMessages() {
    const am = botConfig.autoMessages || config.autoMessages;
    if (!am?.messages?.length) return;
    state.msgInterval = setInterval(() => {
      if (state.busy) return;
      state.bot.chat(am.messages[Math.floor(Math.random() * am.messages.length)]);
    }, am.interval || 60000);
    log("BOOT", "Auto messages started", name);
  }

  // Random idle look rotations to avoid appearing AFK; skipped while delivering
  function startHeadMovement() {
    state.headInterval = setInterval(() => {
      if (state.busy) return;
      state.bot.look(Math.random() * Math.PI * 2 - Math.PI, Math.random() * 1.2 - 0.6, false);
    }, 2500);
    log("BOOT", "Head movement started", name);
  }

  // ---------------------------------------------------------------------------
  // CHEST STOCK SCAN
  // Pathfinds to each configured kit chest, opens it, and reads item names.
  // Falls back to registry name if custom name can't be parsed.
  // ---------------------------------------------------------------------------

  async function scanChests() {
    const chests = botConfig.kitChests;
    if (!chests) return "No chests configured.";
    const results = [];

    for (const [kitType, cp] of Object.entries(chests)) {
      try {
        const pos = new Vec3(cp.x, cp.y, cp.z);
        if (state.bot.entity.position.distanceTo(pos) > 4)
          try { await state.bot.pathfinder.goto(new GoalBlock(cp.x, cp.y, cp.z)); } catch { /* close enough */ }

        const block = state.bot.blockAt(pos);
        if (!block) { results.push(`[${kitType}] chest not found`); continue; }

        const chest = await state.bot.openContainer(block);
        const items = chest.containerItems();
        results.push(items.length
          ? `[${kitType}] ${items.map(i => `${i.name}x${i.count}`).join(", ")}`
          : `[${kitType}] EMPTY`
        );
        await chest.close();
      } catch (err) {
        results.push(`[${kitType}] error: ${err.message}`);
      }
    }
    return results.join("\n");
  }

  // ---------------------------------------------------------------------------
  // KIT DELIVERY
  // Core delivery logic: navigate to chest → withdraw → TPA → drop shulkers → /kill
  // Queue and cooldown logic lives in enqueueKit/processQueue, not here.
  // ---------------------------------------------------------------------------

  async function handleKit(username, kitType, count) {
    const chests  = botConfig.kitChests;
    const maxKits = botConfig.maxKits || config.maxKits || 9;
    count = Math.max(1, Math.min(count || 1, maxKits));

    if (!chests?.[kitType]) {
      state.bot.chat(`/w ${username} Invalid kit. Types: ${Object.keys(chests || {}).join(", ")}`);
      return false;
    }

    try {
      state.busy = true;
      log("KIT", `Delivering ${count}x ${kitType} to ${username}`, name);

      const cp       = chests[kitType];
      const chestPos = new Vec3(cp.x, cp.y, cp.z);

      if (state.bot.entity.position.distanceTo(chestPos) > 2) {
        log("MOVE", `Going to chest at ${chestPos}`, name);
        try { await state.bot.pathfinder.goto(new GoalBlock(cp.x, cp.y, cp.z)); } catch { /* close enough */ }
      }

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

      if (!taken) {
        state.bot.chat(`/w ${username} Chest empty.`);
        return false;
      }
      log("KIT", `Withdrew ${taken} item(s)`, name);

      // Send TPA request and wait up to DELIVERY_TIMEOUT for the player to be nearby
      state.bot.chat(`/tpa ${username}`);
      log("KIT", `TPA sent to ${username}`, name);

      const start = Date.now();
      let delivered = false;

      while (Date.now() - start < DELIVERY_TIMEOUT) {
        await state.bot.waitForTicks(20);
        const target = state.bot.players[username]?.entity;
        if (!target) continue;
        if (state.bot.entity.position.distanceTo(target.position) < 6) {
          log("KIT", `${username} nearby, dropping items`, name);
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
        log("KIT", `Timed out on ${username}`, name);
        return false;
      }

      state.bot.chat(`/w ${username} Kit delivered! Next window opens in ${formatTime(COOLDOWN_MS)}.`);
      log("KIT", `Delivered to ${username}`, name);

      await new Promise(r => setTimeout(r, 3000));
      state.bot.chat("/kill");
      return true;

    } catch (err) {
      log("ERROR", err.message, name);
      return false;
    } finally {
      state.busy = false;
    }
  }

  // ---------------------------------------------------------------------------
  // QUEUE PROCESSOR
  // Runs as a single async loop. Waits for the cooldown window to expire, then
  // pops the next job, notifies the player, delivers, and starts a new window.
  // Remaining players get updated positions and ETAs after each delivery.
  // ---------------------------------------------------------------------------

  async function processQueue() {
    if (queueRunning) return;
    queueRunning = true;

    while (kitQueue.length > 0) {
      const remaining = windowRemaining();
      if (remaining > 0) {
        log("QUEUE", `Window active, waiting ${formatTime(remaining)}`, name);
        await new Promise(r => setTimeout(r, remaining));
      }
      if (kitQueue.length === 0) break;

      const job = kitQueue.shift();
      log("QUEUE", `Serving ${job.username} — ${kitQueue.length} still queued`, name);

      if (QUEUE_NOTIFY)
        state.bot.chat(`/w ${job.username} Your turn! Preparing your ${job.kitType} kit now.`);

      await handleKit(job.username, job.kitType, job.count);

      // Open a new cooldown window after delivery
      windowUntil = Date.now() + COOLDOWN_MS;
      log("QUEUE", `Window started — next slot in ${formatTime(COOLDOWN_MS)}`, name);

      // Update everyone still in queue with their current position and ETA
      kitQueue.forEach((j, i) => {
        const eta = COOLDOWN_MS * (i + 1);
        state.bot.chat(`/w ${j.username} Queue position ${i + 1} — est. wait ${formatTime(eta)}.`);
      });
    }

    queueRunning = false;
    log("QUEUE", "Queue empty", name);
  }

  // Validates and adds a kit request to the queue, notifying the player of their position
  function enqueueKit(username, kitType, count) {
    const alreadyQueued = kitQueue.some(j => j.username === username);
    if (alreadyQueued) {
      const pos = kitQueue.findIndex(j => j.username === username) + 1;
      state.bot.chat(`/w ${username} Already queued at position ${pos}.`);
      return;
    }

    kitQueue.push({ username, kitType, count: count || 1 });
    const pos = kitQueue.length;
    const rem = windowRemaining();

    if (pos === 1 && rem === 0)
      state.bot.chat(`/w ${username} No queue — processing now.`);
    else
      state.bot.chat(`/w ${username} Queued at position ${pos} — est. wait ${formatTime(rem + COOLDOWN_MS * (pos - 1))}.`);

    log("QUEUE", `${username} queued for ${kitType} x${count || 1} (pos ${pos})`, name);
    processQueue();
  }

  // ---------------------------------------------------------------------------
  // WHISPER LISTENER (main bot only)
  // Handles player commands via /msg. Unauthorized players are rejected if they
  // try a known command. Op management commands are hidden from the help menu.
  // ---------------------------------------------------------------------------

  const KNOWN_COMMANDS = ["kit", "stocks", "help", "addplayer", "removeplayer"];

  function startKitModule() {
    state.bot.on("whisper", async (username, message) => {
      if (username === state.bot.username) return;
      log("WHISPER", `${username}: ${message}`, name);

      const args      = message.trim().split(" ");
      const cmd       = args[0].toLowerCase();
      const isAllowed = ops.has(username);

      // Reject unauthorized players attempting known commands (except help)
      if (!isAllowed && KNOWN_COMMANDS.includes(cmd) && cmd !== "help") {
        state.bot.chat(`/w ${username} You're not authorized.`);
        return;
      }

      switch (cmd) {
        case "help":
          PLAYER_HELP.forEach(line => state.bot.chat(`/w ${username} ${line}`));
          break;

        case "stocks":
          state.bot.chat(`/w ${username} Scanning chests...`);
          (await scanChests()).split("\n").forEach(line => state.bot.chat(`/w ${username} ${line}`));
          break;

        case "addplayer":
          if (isAllowed) state.bot.chat(`/w ${username} ${args[1] ? opAdd(args[1], username) : "Usage: addplayer <username>"}`);
          break;

        case "removeplayer":
          if (isAllowed) state.bot.chat(`/w ${username} ${args[1] ? opRemove(args[1], username) : "Usage: removeplayer <username>"}`);
          break;

        case "kit":
          if (!isAllowed) return;
          if (!args[1]) { state.bot.chat(`/w ${username} Usage: kit <type> [count]`); break; }
          enqueueKit(username, args[1], parseInt(args[2]) || 1);
          break;
      }
    });
    log("BOOT", "Kit module started", name);
  }

  // ---------------------------------------------------------------------------
  // SPAWN / RECONNECT
  // Creates the mineflayer bot, registers all event listeners, and runs first-
  // time setup (login command, pathfinder, portal walk, modules).
  // On reconnects, only the pathfinder is re-initialised — setup is skipped.
  // ---------------------------------------------------------------------------

  function spawn() {
    cleanup();
    state.bot = mineflayer.createBot({
      host: config.host, port: config.port,
      username: name, auth: botConfig.auth || "offline",
      version: "1.20.1",
    });
    state.bot.loadPlugin(pathfinder);

    state.bot.on("connect", () => dlog("EVENT", "Connected"));
    state.bot.on("login",   () => dlog("EVENT", "Logged in", "login"));
    state.bot.on("error",   e  => log("ERROR", e.message, name));
    state.bot.on("kicked",  r  => { log("ERROR", `Kicked: ${r}`, name); scheduleReconnect(); });
    state.bot.on("end",     () => { dlog("EVENT", "Disconnected"); scheduleReconnect(); });
    state.bot.on("respawn", () => { dlog("EVENT", "Respawned", "respawn"); state.bot.pathfinder.stop(); setMovements(state.bot); });

    state.bot.on("spawn", async () => {
      dlog("EVENT", "Spawned", "spawn");
      state.bot.pathfinder.stop();

      // Reconnect path — skip full setup, just re-init movement
      if (state.initialSetupDone) return setMovements(state.bot);

      state.initialSetupDone  = true;
      state.reconnectAttempts = 0;

      const loginCmd = botConfig.loginCommand || config.loginCommand;
      if (loginCmd) setTimeout(() => { state.bot.chat(loginCmd); log("BOOT", "Sent login command", name); }, 2000);

      await state.bot.waitForTicks(40);
      setMovements(state.bot);
      log("BOOT", "Pathfinder ready", name);

      if (isMain) startKitModule();
      startAutoMessages();

      // Walk forward into spawn portal 6s after spawning
      setTimeout(async () => {
        const dist = botConfig.portalWalkDistance || config.portalWalkDistance || 13;
        const { x, y, z } = forwardPos(state.bot.entity, dist);
        log("MOVE", `Walking ${dist} blocks into portal`, name);
        try { await state.bot.pathfinder.goto(new GoalBlock(x, y, z)); log("MOVE", "Portal walk done", name); }
        catch { log("MOVE", "Portal walk timed out", name); }
        startHeadMovement();
      }, 6000);

      log("BOOT", "Bot ready", name);
    });
  }

  spawn();
  return {
    get busy() { return state.busy; },
    get bot()  { return state.bot; },
    handleKit,
    enqueueKit,
    scanChests,
  };
}

// =============================================================================
// LAUNCH
// Bots are staggered by 3.5s to avoid simultaneous logins getting flagged.
// =============================================================================

const instances = new Array(config.bots.length).fill(null);
config.bots.forEach((cfg, i) => {
  setTimeout(() => { instances[i] = createBot(cfg, i === 0); }, i * 3500);
});

const mainBot  = () => instances[0]?.bot;
const mainInst = () => instances[0];

// =============================================================================
// CONSOLE REPL
// Local operator shell. Commands map directly to bot actions and queue controls.
// =============================================================================

rl.prompt();
rl.on("line", async (line) => {
  const args = line.trim().split(" ");
  const [cmd, a1, a2, a3] = args;
  const bot  = mainBot();

  try {
    switch (cmd) {
      case "say":    bot.chat(args.slice(1).join(" ")); break;
      case "cmd":    if (a1) { bot.chat(args.slice(1).join(" ")); log("CONSOLE", `-> ${args.slice(1).join(" ")}`); } break;
      case "pos":    log("CONSOLE", JSON.stringify(bot.entity?.position)); break;
      case "gm":     log("CONSOLE", `Gamemode: ${bot.game?.gameMode}`); break;
      case "inv":    log("CONSOLE", JSON.stringify(bot.inventory.items(), null, 2)); break;
      case "clear":  console.clear(); break;
      case "exit":   log("BOOT", "Shutting down"); process.exit(0); break;

      case "goto":
        if (args.length < 4) break;
        await bot.pathfinder.goto(new GoalBlock(parseInt(a1), parseInt(a2), parseInt(a3)));
        log("MOVE", "Arrived"); break;

      case "walk": {
        const blocks = parseFloat(a1);
        if (!blocks || blocks <= 0) break;
        const { x, y, z } = forwardPos(bot.entity, blocks);
        log("MOVE", `Walking ${blocks} blocks`);
        await bot.pathfinder.goto(new GoalBlock(x, y, z));
        log("MOVE", "Arrived"); break;
      }

      case "msg":
        if (args.length < 3) break;
        bot.chat(`/w ${a1} ${args.slice(2).join(" ")}`);
        log("CONSOLE", `-> Whisper to ${a1}`); break;

      case "kit":
        if (args.length < 3) { log("CONSOLE", "Usage: kit <user> <type> [count]"); break; }
        mainInst()?.enqueueKit(a1, a2, parseInt(a3) || 1); break;

      case "stocks": {
        log("CONSOLE", "Scanning chests...");
        const result = await mainInst()?.scanChests();
        result?.split("\n").forEach(l => log("CONSOLE", l));
        break;
      }

      case "queue":
        if (!kitQueue.length) { log("QUEUE", "Queue is empty"); break; }
        kitQueue.forEach((j, i) => log("QUEUE", `${i + 1}. ${j.username} -> ${j.kitType} x${j.count}`));
        break;

      case "window":
      case "cooldown": {
        const rem = windowRemaining();
        log("CONSOLE", rem > 0 ? `Window active — ${formatTime(rem)} remaining` : "Window open, ready to serve");
        break;
      }

      case "status":
        instances.forEach((inst, i) =>
          log("CONSOLE", `bot${i} (${config.bots[i].username}) busy=${inst?.busy ?? "not started"}`)
        ); break;

      case "op":
        if (a1 === "add")    { log("OP", a2 ? opAdd(a2)    : "Usage: op add <username>"); break; }
        if (a1 === "remove") { log("OP", a2 ? opRemove(a2) : "Usage: op remove <username>"); break; }
        if (a1 === "list")   { log("OP", `Allowed: ${[...ops].join(", ") || "none"}`); break; }
        log("CONSOLE", "Usage: op <add|remove|list> [username]"); break;

      case "help":
        CONSOLE_HELP.forEach(l => log("CONSOLE", l)); break;

      default:
        if (cmd) log("CONSOLE", "Unknown command. Type 'help' for a list.");
    }
  } catch (e) { log("ERROR", e.message); }

  rl.prompt();
});
