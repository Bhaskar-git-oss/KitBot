const { log } = require("./logger");
const { handleKit } = require("./modules/kit-delivery");
const { scanChests } = require("./modules/chest-scan");
const { startKitModule } = require("./modules/whisper-handler");
const {
  startAutoMessages,
  startHeadMovement,
} = require("./modules/auto-behaviors");
const { startViewer } = require("./modules/viewer");
const { createBot } = require("./modules/spawn-lifecycle");
const queue = require("./queue");
const { formatTime } = require("./helpers/formatting");

function createBotInstance(botConfig, isMain, config) {
  let enqueueKit;
  let bot, state;
  const callbacksObj = {
    startKitModule: null,
    startViewer: isMain
      ? (b) => startViewer(b, config.viewerPort || 3000)
      : null,
    startAutoMessages: (bot, state, botConfig, config) => {
      startAutoMessages(bot, state, botConfig, config);
    },
    startHeadMovement: (bot, state) => {
      startHeadMovement(bot, state);
    },
  };
  const botInstance = createBot(botConfig, isMain, config, callbacksObj);
  bot = botInstance.bot;
  state = botInstance.state;
  enqueueKit = function (username, kitType, count) {
    const alreadyQueued = queue
      .getKitQueue()
      .some((j) => j.username === username);
    if (alreadyQueued) {
      const pos =
        queue.getKitQueue().findIndex((j) => j.username === username) + 1;
      bot.chat(`/w ${username} Already queued at position ${pos}.`);
      return;
    }

    queue.getKitQueue().push({ username, kitType, count: count || 1 });
    const pos = queue.getKitQueue().length;
    const rem = queue.getWindowRemaining();

    if (pos === 1 && rem === 0)
      bot.chat(`/w ${username} Processing your kit now.`);
    else
      bot.chat(
        `/w ${username} Queued at position ${pos} — est. wait ${formatTime(rem + queue.getCooldownMS() * (pos - 1))}.`,
      );

    log(
      "QUEUE",
      `${username} queued for ${kitType} x${count || 1} (pos ${pos})`,
      bot.username,
    );
    processQueue();
  };
  callbacksObj.startKitModule = () => {
    if (bot && enqueueKit) {
      startKitModule(bot, botConfig, enqueueKit);
    }
  };
  async function processQueue() {
    if (queue.getQueueRunning()) return;
    queue.setQueueRunning(true);

    while (queue.getKitQueue().length > 0) {
      const remaining = queue.getWindowRemaining();
      if (remaining > 0) {
        log(
          "QUEUE",
          `Window active, waiting ${formatTime(remaining)}`,
          bot.username,
        );
        await new Promise((r) => setTimeout(r, remaining));
      }
      if (queue.getKitQueue().length === 0) break;

      const job = queue.getKitQueue().shift();
      log(
        "QUEUE",
        `Serving ${job.username} — ${queue.getKitQueue().length} still queued`,
        bot.username,
      );

      if (queue.getQueueNotify())
        bot.chat(
          `/w ${job.username} Your turn! Preparing your ${job.kitType} kit now.`,
        );

      await handleKit(
        bot,
        state,
        botConfig,
        job.username,
        job.kitType,
        job.count,
      );

      queue.setWindowUntil(Date.now() + queue.getCooldownMS());
      log(
        "QUEUE",
        `Window started — next slot in ${formatTime(queue.getCooldownMS())}`,
        bot.username,
      );

      queue.getKitQueue().forEach((j, i) => {
        const eta = queue.getCooldownMS() * (i + 1);
        bot.chat(
          `/w ${j.username} Queue position ${i + 1} — est. wait ${formatTime(eta)}.`,
        );
      });
    }

    queue.setQueueRunning(false);
    log("QUEUE", "Queue empty", bot.username);
  }

  return {
    get busy() {
      return state.busy;
    },
    get bot() {
      return bot;
    },
    handleKit: (username, kitType, count) =>
      handleKit(bot, state, botConfig, username, kitType, count),
    enqueueKit,
    scanChests: () => scanChests(bot, botConfig),
  };
}

module.exports = {
  createBotInstance,
};
