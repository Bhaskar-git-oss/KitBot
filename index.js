// ===== Pretty Boot Banner =====
const figlet = require("figlet");
const gradient = require("gradient-string");

const data = figlet.textSync("> Chunk's KitBot", { font: "Slant" });
console.log(gradient.pastel.multiline(data));

// ===== Modules =====
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

// ===== Colored Logger =====
const C = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function log(type, msg) {
  const time = new Date().toISOString().split("T")[1].split(".")[0];
  const colors = {
    BOOT: C.cyan,
    EVENT: C.green,
    ERROR: C.red,
    KIT: C.magenta,
    MOVE: C.yellow,
    VIEWER: C.cyan,
    CONSOLE: C.gray,
  };
  const color = colors[type] || C.gray;
  console.log(
    `${C.gray}[${time}]${C.reset} ${color}[${type}]${C.reset} ${msg}`,
  );
}

// ===== Bot Creation =====
log("BOOT", "Creating bot");

const bot = mineflayer.createBot({
  host: config.host,
  port: config.port,
  username: config.username,
  auth: config.auth,
  version: "1.20.1",
});

bot.loadPlugin(pathfinder);

// ===== Viewer Control Flag =====
let viewerStarted = false; // ensures viewer starts once

// ===== Bot Events =====
bot.on("connect", () => log("EVENT", "Connected"));
bot.on("login", () => log("EVENT", "Logged in"));
bot.on("respawn", () => {
  log("EVENT", "Respawned");

  // Reset pathfinder after respawn
  const mcData = mcDataLoader(bot.version);
  bot.pathfinder.setMovements(new Movements(bot, mcData));
});
bot.on("spawn", async () => {
  log("EVENT", "Spawned");

  if (config.loginCommand) {
    setTimeout(() => {
      bot.chat(config.loginCommand);
      log("BOOT", "Sent login command");
    }, 2000);
  }
  let idlePos = null; // new global variable

  await bot.waitForTicks(40); // ~2s wait

  // Setup pathfinder movements
  const mcData = mcDataLoader(bot.version);
  bot.pathfinder.setMovements(new Movements(bot, mcData));
  log("BOOT", "Pathfinder ready");

  // Start Prismarine viewer only once
  if (!viewerStarted) {
    try {
      viewer(bot, { port: 3007, firstPerson: true });
      log("VIEWER", "Web viewer running on :3007");
      viewerStarted = true;

      // redraw console prompt cleanly
      rl.prompt(true);
    } catch (e) {
      log("ERROR", e.message);
    }
  }

  log("BOOT", "Bot ready and idle");
});

bot.on("end", () => log("EVENT", "Disconnected"));
bot.on("kicked", (r) => log("ERROR", `Kicked: ${r}`));
bot.on("error", (e) => log("ERROR", e.message));

// ===== Kit System =====
const allowedPlayers = config.allowedPlayers;
let busy = false;

// Chest coordinates
const KIT_CHESTS = config.kitChests;

const MAX_KITS = config.maxKits;

// ===== Handle Whisper Kit Requests =====
bot.on("whisper", async (username, message) => {
  if (username === bot.username) return; // ignore self
  if (!allowedPlayers.includes(username)) return; // ignore unauthorized
  if (busy) return bot.chat(`/w ${username} Bot busy.`);

  const args = message.trim().split(" ");
  if (args[0] !== "kit") return; // only handle "kit" commands

  const type = args[1];
  let count = parseInt(args[2]) || 1;

  if (!KIT_CHESTS[type]) {
    bot.chat(`/w ${username} Invalid kit.`);
    return;
  }

  count = Math.max(1, Math.min(count, MAX_KITS));
  handleKit(username, type, count);
});

// ===== Main Kit Handler =====
async function handleKit(username, kitType, count) {
  try {
    busy = true;
    log("KIT", `${username} ordered ${count}x ${kitType}`);

    // Get chest position
    const posData = KIT_CHESTS[kitType];
    const chestPos = new Vec3(posData.x, posData.y, posData.z);

    // Pathfind to chest if far
    if (bot.entity.position.distanceTo(chestPos) > 2) {
      try {
        log(
          "MOVE",
          `Going to chest at ${chestPos.x}, ${chestPos.y}, ${chestPos.z}`,
        );
        await bot.pathfinder.goto(
          new GoalBlock(chestPos.x, chestPos.y, chestPos.z),
        );
      } catch (err) {
        log("MOVE", "Pathfinder skipped: " + err.message);
      }
    } else {
      log("MOVE", "Already near chest, skipping pathfinder");
    }

    // Open chest and withdraw items
    const block = bot.blockAt(chestPos);
    if (!block) throw new Error("Chest not found");
    const chest = await bot.openContainer(block);
    const items = chest.containerItems();

    let taken = 0;
    for (const item of items) {
      if (taken >= count) break;
      const amt = Math.min(item.count, count - taken);
      await chest.withdraw(item.type, null, amt);
      taken += amt;
    }
    await chest.close();

    if (!taken) {
      bot.chat(`/w ${username} Chest empty.`);
      return;
    }

    log("KIT", `Withdrew ${taken}`);

    // Send TPA request
    bot.chat(`/tpa ${username}`);
    log("KIT", `TPA request sent to ${username}`);

    // Wait for player to appear (up to 45s)
    const timeout = 45000;
    const start = Date.now();
    let delivered = false;

    while (Date.now() - start < timeout) {
      await bot.waitForTicks(20);
      const target = bot.players[username]?.entity;
      if (!target) continue;

      const distance = bot.entity.position.distanceTo(target.position);
      if (distance < 6) {
        log("KIT", `${username} nearby, delivering kits`);

        // Step 1: Face the player
        bot.lookAt(target.position.offset(0, 1.6, 0), true);

        // Step 2: Toss all shulker stacks 2 blocks in front
        for (const item of bot.inventory.items()) {
          if (!item.name.includes("shulker")) continue;

          const dx = -Math.sin(bot.entity.yaw) * 2;
          const dz = -Math.cos(bot.entity.yaw) * 2;
          const dropPos = bot.entity.position.offset(dx, 0, dz);

          await bot.tossStack(item, dropPos);
          await bot.waitForTicks(30);
        }

        delivered = true;
        break;
      }
    }

    if (!delivered) {
      bot.chat(`/w ${username} Delivery timed out.`);
      log("KIT", `Delivery to ${username} timed out`);
      return;
    }

    // Step 3: Delay then /kill
    log("KIT", "Delivered kits, running /kill in 3s");
    await new Promise((r) => setTimeout(r, 3000));
    bot.chat("/kill");
  } catch (err) {
    log("ERROR", err.message);
  } finally {
    busy = false;
  }
}

// ===== Interactive Terminal =====
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `${C.cyan}kitbot>${C.reset} `,
});

rl.prompt();

// Forward whispers to console
bot.on("whisper", (username, message) => {
  if (username === bot.username) return;
  log("CONSOLE", `[WHISPER] ${username}: ${message}`);
});

// Console commands
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
      case "walk":
        if (args.length < 2) break;
        const blocks = parseFloat(args[1]);
        if (isNaN(blocks) || blocks <= 0) break;

        const yaw = bot.entity.yaw;
        const dx = -Math.sin(yaw) * blocks;
        const dz = -Math.cos(yaw) * blocks;

        const targetX = bot.entity.position.x + dx;
        const targetY = bot.entity.position.y;
        const targetZ = bot.entity.position.z + dz;

        log("MOVE", `Walking ${blocks} blocks forward`);

        await bot.pathfinder.goto(
          new GoalBlock(
            Math.floor(targetX),
            Math.floor(targetY),
            Math.floor(targetZ),
          ),
        );

        log("MOVE", "Arrived");
        break;
      default:
        log("CONSOLE", "Unknown command");
    }
  } catch (e) {
    log("ERROR", e.message);
  }

  rl.prompt();
});
