const mineflayer = require("mineflayer");
const {
  pathfinder,
  goals: { GoalBlock },
} = require("mineflayer-pathfinder");
const { log, C } = require("../logger");
const { setMovements, forwardPos } = require("../helpers/movement");

const _db = {};
const dlog = (type, msg, key) => {
  const k = key || `${type}:${msg}`,
    now = Date.now();
  if (_db[k] && now - _db[k] < 500) return;
  _db[k] = now;
  log(type, msg);
};

function createSpawnHandler(bot, state, botConfig, config, isMain, callbacks) {
  return async () => {
    dlog("EVENT", "Spawned", "spawn");
    if (!bot.entity) {
      log("ERROR", "Spawn handler: bot.entity is undefined", bot.username);
      return;
    }
    try {
      bot.pathfinder.stop();
    } catch (e) {
      log("ERROR", `Failed to stop pathfinder: ${e.message}`, bot.username);
    }
    state.consecutiveKicks = 0;

    if (state.initialSetupDone) {
      try {
        setMovements(bot);
      } catch (e) {
        log(
          "ERROR",
          `Failed to set movements on respawn: ${e.message}`,
          bot.username,
        );
      }
      return;
    }

    state.initialSetupDone = true;
    state.reconnectAttempts = 0;

    const loginCmd = botConfig.loginCommand || config.loginCommand;
    if (loginCmd)
      setTimeout(() => {
        bot.chat(loginCmd);
        log("BOOT", "Sent login command", bot.username);
      }, 2000);
    await bot.waitForTicks(40);

    try {
      setMovements(bot);
      log("BOOT", "Pathfinder ready", bot.username);
    } catch (e) {
      log(
        "ERROR",
        `Failed to initialize pathfinder: ${e.message}`,
        bot.username,
      );
      return;
    }

    if (isMain && callbacks.startViewer) callbacks.startViewer(bot);
    if (isMain && callbacks.startKitModule) callbacks.startKitModule();
    if (callbacks.startAutoMessages)
      callbacks.startAutoMessages(bot, state, botConfig, config);

    setTimeout(async () => {
      if (!bot.entity) {
        log(
          "ERROR",
          "Portal walk cancelled: bot.entity is undefined",
          bot.username,
        );
        return;
      }

      const dist =
        botConfig.portalWalkDistance || config.portalWalkDistance || 14;
      try {
        const { x, y, z } = forwardPos(bot.entity, dist);
        log("MOVE", `Walking ${dist} blocks into portal`, bot.username);
        await bot.pathfinder.goto(new GoalBlock(x, y, z));
        log("MOVE", "Portal walk done", bot.username);
      } catch (err) {
        log(
          "MOVE",
          `Portal walk timed out or failed: ${err.message}`,
          bot.username,
        );
      }

      if (callbacks.startHeadMovement) callbacks.startHeadMovement(bot, state);
    }, 6000);

    log("BOOT", "Bot ready", bot.username);
  };
}

function cleanup(state) {
  clearInterval(state.msgInterval);
  clearInterval(state.headInterval);
  state.msgInterval = state.headInterval = null;
  state.busy = state.initialSetupDone = false;
}

function scheduleReconnect(spawn, state, botConfig, config, bot) {
  const rc = botConfig.reconnect || config.reconnect;
  if (!rc?.enabled) return;
  if (state.reconnectAttempts >= rc.maxAttempts)
    return log("ERROR", "Max reconnects reached, giving up.", bot.username);
  state.reconnectAttempts++;
  log(
    "BOOT",
    `Reconnecting in ${rc.delay / 1000}s... (${state.reconnectAttempts}/${rc.maxAttempts})`,
    bot.username,
  );
  setTimeout(spawn, rc.delay);
}

function createBot(botConfig, isMain, config, callbacks) {
  const name = botConfig.username;
  const state = {
    bot: null,
    busy: false,
    initialSetupDone: false,
    reconnectAttempts: 0,
    msgInterval: null,
    headInterval: null,
    consecutiveKicks: 0,
  };

  function spawn() {
    cleanup(state);
    state.bot = mineflayer.createBot({
      host: config.host,
      port: config.port,
      username: name,
      auth: botConfig.auth || "offline",
      version: "1.20.1",
    });
    state.bot.loadPlugin(pathfinder);

    state.bot.on("connect", () => dlog("EVENT", "Connected"));
    state.bot.on("login", () => dlog("EVENT", "Logged in", "login"));
    state.bot.on("error", (e) => log("ERROR", e.message, name));
    state.bot.on("kicked", (r) => {
      state.consecutiveKicks++;
      log("ERROR", `Kicked: ${r}`, name);
      if (state.consecutiveKicks >= 5) {
        log(
          "ALERT",
          `${name} kicked 5+ times consecutively - CHECK SERVER!`,
          name,
        );
      }
      scheduleReconnect(spawn, state, botConfig, config, state.bot);
    });

    state.bot.on("end", () => {
      dlog("EVENT", "Disconnected");
      scheduleReconnect(spawn, state, botConfig, config, state.bot);
    });

    state.bot.on("respawn", () => {
      dlog("EVENT", "Respawned", "respawn");
      try {
        state.bot.pathfinder.stop();
      } catch (e) {
        log("ERROR", `Respawn: pathfinder stop failed: ${e.message}`, name);
      }
      try {
        setMovements(state.bot);
      } catch (e) {
        log("ERROR", `Respawn: setMovements failed: ${e.message}`, name);
      }
    });

    state.bot.on(
      "spawn",
      createSpawnHandler(
        state.bot,
        state,
        botConfig,
        config,
        isMain,
        callbacks,
      ),
    );
  }

  spawn();
  return {
    get busy() {
      return state.busy;
    },
    get bot() {
      return state.bot;
    },
    state,
  };
}

module.exports = {
  createBot,
};
