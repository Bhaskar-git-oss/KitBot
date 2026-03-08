const figlet = require("figlet");
const gradient = require("gradient-string");
const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals: { GoalBlock } } = require("mineflayer-pathfinder");
const mcDataLoader = require("minecraft-data");
const readline = require("readline");
const fs = require("fs");
const { Vec3 } = require("vec3");

let config = require("./config.json");

console.log(gradient.pastel.multiline(figlet.textSync("> KitBot", { font: "Slant" })));

// ===== Colors + Logger =====
const C = { reset:"\x1b[0m", gray:"\x1b[90m", green:"\x1b[32m", red:"\x1b[31m", yellow:"\x1b[33m", cyan:"\x1b[36m", magenta:"\x1b[35m", blue:"\x1b[34m" };
const LOG_COLORS = { BOOT:C.cyan, EVENT:C.green, ERROR:C.red, KIT:C.magenta, MOVE:C.yellow, CONSOLE:C.gray, WHISPER:C.blue, OP:C.magenta };

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${C.cyan}kitbot>${C.reset} ` });

function log(type, msg, bot = null) {                             const time = new Date().toISOString().split("T")[1].split(".")[0];
  const color = LOG_COLORS[type] || C.gray;
  const prefix = bot ? `${C.yellow}[${bot}]${C.reset} ` : "";
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(`${C.gray}[${time}]${C.reset} ${color}[${type}]${C.reset} ${prefix}${msg}`);
  rl.prompt(true);
}

// ===== Operator list (persisted to config.json) =====
const ops = new Set(config.bots[0]?.allowedPlayers || []);

function saveOps() {
  config.bots[0].allowedPlayers = [...ops];
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}

function opAdd(target, by = "console") {
  if (ops.has(target)) return `${target} is already allowed.`;
  ops.add(target); saveOps();
  log("OP", `${by} added ${target}`);
  return `Added ${target}.`;
}

function opRemove(target, by = "console") {
  if (!ops.has(target)) return `${target} is not in the list.`;
  ops.delete(target); saveOps();
  log("OP", `${by} removed ${target}`);
  return `Removed ${target}.`;
}

// ===== Helpers =====
const setMovements = bot => bot.pathfinder.setMovements(new Movements(bot, mcDataLoader(bot.version)));

// Returns coords N blocks forward relative to entity facing direction
function forwardPos(entity, dist) {
  return {
    x: Math.floor(entity.position.x - Math.sin(entity.yaw) * dist),
    y: Math.floor(entity.position.y),
    z: Math.floor(entity.position.z - Math.cos(entity.yaw) * dist),
  };
}

// ===== Bot factory =====
function createBot(botConfig, isMain) {
  const name = botConfig.username;
  const state = { bot: null, busy: false, initialSetupDone: false, reconnectAttempts: 0, msgInterval: null, headInterval: null };
  const _db = {};

  // Debounced log — avoids spam for repeated events within 500ms
  const dlog = (type, msg, key) => {
    const k = key || `${type}:${msg}`, now = Date.now();
    if (_db[k] && now - _db[k] < 500) return;
    _db[k] = now; log(type, msg, name);
  };

  function cleanup() {
    clearInterval(state.msgInterval); clearInterval(state.headInterval);
    state.msgInterval = state.headInterval = null;
    state.busy = state.initialSetupDone = false;
  }

  function scheduleReconnect() {
    const rc = botConfig.reconnect || config.reconnect;
    if (!rc?.enabled) return;
    if (state.reconnectAttempts >= rc.maxAttempts) return log("ERROR", "Max reconnects reached, giving up.", name);
    state.reconnectAttempts++;
    log("BOOT", `Reconnecting in ${rc.delay / 1000}s... (${state.reconnectAttempts}/${rc.maxAttempts})`, name);
    setTimeout(spawn, rc.delay);
  }

  // Auto-messages — random pick from pool, skips while busy
  function startAutoMessages() {
    const am = botConfig.autoMessages || config.autoMessages;
    if (!am?.messages?.length) return;
    state.msgInterval = setInterval(() => {
      if (state.busy) return;
      const msg = am.messages[Math.floor(Math.random() * am.messages.length)];
      state.bot.chat(msg);
      log("CONSOLE", `[AUTO] ${msg}`, name);
    }, am.interval || 60000);
    log("BOOT", "Auto messages started", name);
  }

  // Head movement — random idle rotations every 2.5s
  function startHeadMovement() {
    state.headInterval = setInterval(() => {
      if (state.busy) return;
      state.bot.look(Math.random() * Math.PI * 2 - Math.PI, Math.random() * 1.2 - 0.6, false);
    }, 2500);
    log("BOOT", "Head movement started", name);
  }

  // ===== Kit delivery =====
  // navigate to chest → withdraw → TPA → drop shulkers → /kill
  async function handleKit(username, kitType, count) {
    const KIT_CHESTS = botConfig.kitChests;
    const MAX_KITS = botConfig.maxKits || config.maxKits || 9;
    count = Math.max(1, Math.min(count || 1, MAX_KITS));

    if (!KIT_CHESTS?.[kitType]) return state.bot.chat(`/w ${username} Invalid kit.`);

    try {
      state.busy = true;
      log("KIT", `${username} ordered ${count}x ${kitType}`, name);

      const cp = KIT_CHESTS[kitType];
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

      if (!taken) return state.bot.chat(`/w ${username} Chest empty.`);
      log("KIT", `Withdrew ${taken}`, name);

      state.bot.chat(`/tpa ${username}`);
      log("KIT", `TPA sent to ${username}`, name);

      const start = Date.now();
      let delivered = false;
      while (Date.now() - start < 45000) {
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
        return log("KIT", `Timed out on ${username}`, name);
      }

      log("KIT", "Done, /kill in 3s", name);
      await new Promise(r => setTimeout(r, 3000));
      state.bot.chat("/kill");
    } catch (err) {
      log("ERROR", err.message, name);
    } finally {
      state.busy = false;
    }
  }

  // Kit module — whisper listener (main bot only)
  function startKitModule() {
    state.bot.on("whisper", async (username, message) => {
      if (username === state.bot.username) return;
      const args = message.trim().split(" ");
      const isAllowed = ops.has(username);

      // In-game op management via whisper
      if (isAllowed && args[0] === "addplayer") {
        const reply = args[1] ? opAdd(args[1], username) : "Usage: addplayer <username>";
        return state.bot.chat(`/w ${username} ${reply}`);
      }
      if (isAllowed && args[0] === "removeplayer") {
        const reply = args[1] ? opRemove(args[1], username) : "Usage: removeplayer <username>";
        return state.bot.chat(`/w ${username} ${reply}`);
      }

      if (!isAllowed) return;
      if (state.busy) return state.bot.chat(`/w ${username} Bot busy.`);
      if (args[0] === "kit") await handleKit(username, args[1], parseInt(args[2]));
    });
    log("BOOT", "Kit module started", name);
  }

  function spawn() {
    cleanup();
    state.bot = mineflayer.createBot({ host: config.host, port: config.port, username: name, auth: botConfig.auth || "offline", version: "1.20.1" });
    state.bot.loadPlugin(pathfinder);

    state.bot.on("connect",  () => dlog("EVENT", "Connected"));
    state.bot.on("login",    () => dlog("EVENT", "Logged in", "login"));
    state.bot.on("error",    e  => log("ERROR", e.message, name));
    state.bot.on("kicked",   r  => { log("ERROR", `Kicked: ${r}`, name); scheduleReconnect(); });
    state.bot.on("end",      () => { dlog("EVENT", "Disconnected"); scheduleReconnect(); });
    state.bot.on("respawn",  () => { dlog("EVENT", "Respawned", "respawn"); state.bot.pathfinder.stop(); setMovements(state.bot); });

    state.bot.on("spawn", async () => {
      dlog("EVENT", "Spawned", "spawn");
      state.bot.pathfinder.stop();

      // On reconnects, just re-init pathfinder and skip full setup
      if (state.initialSetupDone) return setMovements(state.bot);

      state.initialSetupDone = true;
      state.reconnectAttempts = 0;

      // Send login command 2s after spawn
      const loginCmd = botConfig.loginCommand || config.loginCommand;
      if (loginCmd) setTimeout(() => { state.bot.chat(loginCmd); log("BOOT", "Sent login command", name); }, 2000);

      await state.bot.waitForTicks(40);
      setMovements(state.bot);
      log("BOOT", "Pathfinder ready", name);

      if (isMain) startKitModule();
      startAutoMessages();

      // Portal walk — walks forward N blocks on spawn
      setTimeout(async () => {
        const dist = botConfig.portalWalkDistance || config.portalWalkDistance || 13;
        const { x, y, z } = forwardPos(state.bot.entity, dist);
        log("MOVE", `Walking ${dist} blocks into portal`, name);
        try { await state.bot.pathfinder.goto(new GoalBlock(x, y, z)); log("MOVE", "Portal walk done", name); }
        catch { log("MOVE", "Portal walk timed out", name); }
        startHeadMovement();
      }, 6000);

      state.bot.on("whisper", (username, message) => {
        if (username !== state.bot.username) log("WHISPER", `${username}: ${message}`, name);
      });

      log("BOOT", "Bot ready", name);
    });
  }

  spawn();
  return { ...state, handleKit };
}

// ===== Launch all bots with 3.5s stagger =====
const instances = config.bots.map((cfg, i) => {
  let inst = null;
  setTimeout(() => { inst = createBot(cfg, i === 0); instances[i] = inst; }, i * 3500);
  return inst;
});

const mainBot = () => instances[0]?.bot;

// ===== Console REPL =====
rl.prompt();
rl.on("line", async (line) => {
  const args = line.trim().split(" ");
  const [cmd, a1, a2, a3] = args;
  const bot = mainBot();

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
        log("CONSOLE", `-> Whisper sent to ${a1}`); break;

      case "kit":
        if (args.length < 3) break;
        await instances[0]?.handleKit(a1, a2, parseInt(a3)); break;

      case "status":
        instances.forEach((inst, i) => log("CONSOLE", `bot${i} (${config.bots[i].username}) busy=${inst?.busy}`)); break;

      case "op":
        if (a1 === "add")    { log("OP", a2 ? opAdd(a2)    : "Usage: op add <username>"); break; }
        if (a1 === "remove") { log("OP", a2 ? opRemove(a2) : "Usage: op remove <username>"); break; }
        if (a1 === "list")   { log("OP", `Allowed: ${[...ops].join(", ") || "none"}`); break; }
        log("CONSOLE", "Usage: op <add|remove|list> [username]"); break;

      default: log("CONSOLE", "Unknown command");
    }
  } catch (e) { log("ERROR", e.message); }

  rl.prompt();
});