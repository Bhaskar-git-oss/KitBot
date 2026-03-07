// ===== Banner =====
const figlet = require("figlet");
const gradient = require("gradient-string");
console.log(
  gradient.pastel.multiline(
    figlet.textSync("> Chunk's KitBot", { font: "Slant" }),
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
const { mineflayer: viewer } = require("prismarine-viewer");
const readline = require("readline");
const config = require("./config.json");
const { Vec3 } = require("vec3");

// ===== Colors =====
const C = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

// ===== Terminal =====
// Defined before log() so prompt can be redrawn after each log line
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `${C.cyan}kitbot>${C.reset} `,
});

function log(type, msg) {
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
    }[type] || C.gray;
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(
    `${C.gray}[${time}]${C.reset} ${color}[${type}]${C.reset} ${msg}`,
  );
  rl.prompt(true);
}

// ===== State =====
let bot = null;
let busy = false;
let viewerStarted = false;
let initialSetupDone = false;
let reconnectAttempts = 0;

// Active module intervals — stored so they can be cleared on reconnect
let msgInterval = null;
let headInterval = null;

// Debounce map — swallows duplicate events fired within 500ms
const _debounce = {};
function dlog(type, msg, key) {
  const k = key || `${type}:${msg}`;
  const now = Date.now();
  if (_debounce[k] && now - _debounce[k] < 500) return;
  _debounce[k] = now;
  log(type, msg);
}

// ===== Module: Auto Messages =====
function startAutoMessages() {
  if (!config.modules?.autoMessages) return;
  const { interval, messages } = config.autoMessages;
  if (!messages?.length) return;

  msgInterval = setInterval(() => {
    if (busy) return; // pause during kit delivery
    const msg = messages[Math.floor(Math.random() * messages.length)];
    bot.chat(msg);
    log("CONSOLE", `[AUTO] ${msg}`);
  }, interval);

  log("BOOT", "Auto messages module started");
}

// ===== Module: Head Movement =====
function startHeadMovement() {
  if (!config.modules?.headMovement) return;

  headInterval = setInterval(() => {
    if (busy) return; // pause during kit delivery
    const yaw = Math.random() * Math.PI * 2 - Math.PI; // -π to π
    const pitch = Math.random() * 1.2 - 0.6; // -0.6 to 0.6 (noticeable range)
    bot.look(yaw, pitch, false);
  }, 2500); // every 2.5s

  log("BOOT", "Head movement module started");
}

// ===== Module: Kit System =====
const KIT_CHESTS = config.kitChests;
const MAX_KITS = config.maxKits;
const allowedPlayers = config.allowedPlayers;

function startKitModule() {
  if (!config.modules?.kitBot) return;

  // Respond to allowed players whispering "kit <type> <count>"
  bot.on("whisper", async (username, message) => {
    if (username === bot.username) return;
    if (!allowedPlayers.includes(username)) return;
    if (busy) return bot.chat(`/w ${username} Bot busy.`);

    const args = message.trim().split(" ");
    if (args[0] !== "kit") return;

    const type = args[1];
    const count = Math.max(1, Math.min(parseInt(args[2]) || 1, MAX_KITS));
    if (!KIT_CHESTS[type]) return bot.chat(`/w ${username} Invalid kit.`);

    handleKit(username, type, count);
  });

  log("BOOT", "Kit module started");
}

async function handleKit(username, kitType, count) {
  try {
    busy = true;
    log("KIT", `${username} ordered ${count}x ${kitType}`);

    const posData = KIT_CHESTS[kitType];
    const chestPos = new Vec3(posData.x, posData.y, posData.z);

    // Navigate to chest if not already nearby
    if (bot.entity.position.distanceTo(chestPos) > 2) {
      try {
        log(
          "MOVE",
          `Going to chest at ${chestPos.x}, ${chestPos.y}, ${chestPos.z}`,
        );
        await bot.pathfinder.goto(
          new GoalBlock(chestPos.x, chestPos.y, chestPos.z),
        );
      } catch {
        // Timeout is fine if close enough to still open the chest
      }
    }

    // Open chest and withdraw items
    const block = bot.blockAt(chestPos);
    if (!block) throw new Error("Chest not found");
    const chest = await bot.openContainer(block);

    let taken = 0;
    for (const item of chest.containerItems()) {
      if (taken >= count) break;
      const amt = Math.min(item.count, count - taken);
      await chest.withdraw(item.type, null, amt);
      taken += amt;
    }
    await chest.close();

    if (!taken) return bot.chat(`/w ${username} Chest empty.`);
    log("KIT", `Withdrew ${taken}`);

    // TPA to player then wait up to 45s for them to be nearby
    bot.chat(`/tpa ${username}`);
    log("KIT", `TPA sent to ${username}`);

    const start = Date.now();
    let delivered = false;

    while (Date.now() - start < 45000) {
      await bot.waitForTicks(20);
      const target = bot.players[username]?.entity;
      if (!target) continue;

      if (bot.entity.position.distanceTo(target.position) < 6) {
        log("KIT", `${username} nearby, delivering`);

        // Face player then toss all shulkers toward them
        await bot.lookAt(target.position.offset(0, 1.6, 0), true);
        for (const item of bot.inventory.items()) {
          if (!item.name.includes("shulker")) continue;
          await bot.tossStack(item);
          await bot.waitForTicks(10);
        }

        delivered = true;
        break;
      }
    }

    if (!delivered) {
      bot.chat(`/w ${username} Delivery timed out.`);
      log("KIT", `Timed out delivering to ${username}`);
      return;
    }

    // Kill bot to reset after delivery
    log("KIT", "Done, /kill in 3s");
    await new Promise((r) => setTimeout(r, 3000));
    bot.chat("/kill");
  } catch (err) {
    log("ERROR", err.message);
  } finally {
    busy = false;
  }
}

// ===== Cleanup =====
// Clears all module intervals and resets state for reconnect
function cleanup() {
  if (msgInterval) {
    clearInterval(msgInterval);
    msgInterval = null;
  }
  if (headInterval) {
    clearInterval(headInterval);
    headInterval = null;
  }
  busy = false;
  initialSetupDone = false;
}

// ===== Reconnect =====
function scheduleReconnect() {
  if (!config.reconnect?.enabled) return;

  const { delay, maxAttempts } = config.reconnect;
  if (reconnectAttempts >= maxAttempts) {
    log(
      "ERROR",
      `Max reconnect attempts (${maxAttempts}) reached. Shutting down.`,
    );
    process.exit(1);
  }

  reconnectAttempts++;
  log(
    "BOOT",
    `Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts}/${maxAttempts})`,
  );
  setTimeout(() => createBot(), delay);
}

// ===== Bot Factory =====
function createBot() {
  cleanup();

  bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    auth: config.auth,
    version: "1.20.1",
  });

  bot.loadPlugin(pathfinder);

  // ===== Events =====
  bot.on("connect", () => dlog("EVENT", "Connected"));
  bot.on("login", () => dlog("EVENT", "Logged in", "login"));
  bot.on("end", () => {
    dlog("EVENT", "Disconnected");
    scheduleReconnect();
  });
  bot.on("kicked", (r) => {
    log("ERROR", `Kicked: ${r}`);
    scheduleReconnect();
  });
  bot.on("error", (e) => log("ERROR", e.message));

  bot.on("respawn", () => {
    dlog("EVENT", "Respawned", "respawn");
    // Stop pathfinder so it doesn't resume a stale goal after world change
    bot.pathfinder.stop();
    const mcData = mcDataLoader(bot.version);
    bot.pathfinder.setMovements(new Movements(bot, mcData));
  });

  bot.on("spawn", async () => {
    dlog("EVENT", "Spawned", "spawn");
    bot.pathfinder.stop(); // clear any lingering goals

    if (initialSetupDone) {
      // Re-spawned or changed dimension — just refresh movements
      const mcData = mcDataLoader(bot.version);
      bot.pathfinder.setMovements(new Movements(bot, mcData));
      return;
    }
    initialSetupDone = true;
    reconnectAttempts = 0; // successful spawn resets reconnect counter

    // Send login command
    if (config.loginCommand) {
      setTimeout(() => {
        bot.chat(config.loginCommand);
        log("BOOT", "Sent login command");
      }, 2000);
    }

    await bot.waitForTicks(40);

    const mcData = mcDataLoader(bot.version);
    bot.pathfinder.setMovements(new Movements(bot, mcData));
    log("BOOT", "Pathfinder ready");

    // Start web viewer once (suppress its own stdout message)
    if (!viewerStarted) {
      try {
        const _write = process.stdout.write.bind(process.stdout);
        process.stdout.write = (chunk, ...args) => {
          if (typeof chunk === "string" && chunk.includes("Prismarine viewer"))
            return true;
          return _write(chunk, ...args);
        };
        viewer(bot, { port: 3007, firstPerson: true });
        process.stdout.write = process.stdout.write; // restore (noop, write was rebound)
        log("VIEWER", "Web viewer running on :3007");
        viewerStarted = true;
        rl.prompt(true);
      } catch (e) {
        log("ERROR", e.message);
      }
    }

    // Start modules
    startKitModule();
    startAutoMessages();

    // Auto-walk into portal 10s after login, start head movement only after
    setTimeout(async () => {
      const dist = config.portalWalkDistance || 13;
      const yaw = bot.entity.yaw;
      const tx = bot.entity.position.x + -Math.sin(yaw) * dist;
      const ty = bot.entity.position.y;
      const tz = bot.entity.position.z + -Math.cos(yaw) * dist;
      log("MOVE", `Auto-walking ${dist} blocks into portal`);
      try {
        await bot.pathfinder.goto(
          new GoalBlock(Math.floor(tx), Math.floor(ty), Math.floor(tz)),
        );
        log("MOVE", "Portal walk done");
      } catch {
        log("MOVE", "Portal walk timed out");
      }
      startHeadMovement(); // start only after walk finishes or fails
    }, 10000);

    // Log whispers to console
    bot.on("whisper", (username, message) => {
      if (username === bot.username) return;
      log("CONSOLE", `[WHISPER] ${username}: ${message}`);
    });

    log("BOOT", "Bot ready and idle");
  });
}

// ===== Console =====
rl.prompt();

rl.on("line", async (line) => {
  const args = line.trim().split(" ");
  const cmd = args[0];

  try {
    switch (cmd) {
      case "say":
        bot.chat(args.slice(1).join(" "));
        break;
      case "pos":
        log("CONSOLE", JSON.stringify(bot.entity?.position));
        break;
      case "gm":
        log("CONSOLE", `Gamemode: ${bot.game?.gameMode}`);
        break;
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
      case "msg":
        if (args.length < 3) break;
        bot.chat(`/w ${args[1]} ${args.slice(2).join(" ")}`);
        log("CONSOLE", `-> Whisper sent to ${args[1]}`);
        break;
      case "kit":
        if (args.length < 3) break;
        await handleKit(args[1], args[2], parseInt(args[3]));
        break;
      case "inv":
        log("CONSOLE", JSON.stringify(bot.inventory.items(), null, 2));
        break;
      case "clear":
        console.clear();
        break;
      case "exit":
        log("BOOT", "Shutting down");
        process.exit(0);
        break;
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
      case "status":
        log(
          "CONSOLE",
          `busy=${busy} | modules: kit=${config.modules?.kitBot} msgs=${config.modules?.autoMessages} head=${config.modules?.headMovement}`,
        );
        break;
      default:
        log("CONSOLE", "Unknown command");
    }
  } catch (e) {
    log("ERROR", e.message);
  }

  rl.prompt();
});

// ===== Start =====
log("BOOT", "Creating bot");
createBot();
