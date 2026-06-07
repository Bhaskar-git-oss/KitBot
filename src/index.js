const figlet = require("figlet");
const gradient = require("gradient-string");
const { initLogger, log } = require("./logger");
const { initOperators } = require("./operators");
const { initQueue } = require("./queue");
const { createBotInstance } = require("./bot-factory");
const { createREPL } = require("./repl");
const config = require("../config.json");

console.log(
  gradient.pastel.multiline(figlet.textSync("> KitBot", { font: "Slant" })),
);

initLogger();
initOperators(config);
initQueue(config);
const instances = new Array(config.bots.length).fill(null);
config.bots.forEach((cfg, i) => {
  setTimeout(() => {
    instances[i] = createBotInstance(cfg, i === 0, config);
  }, i * 3500);
});

const mainBot = () => instances[0]?.bot;
const mainInst = () => instances[0];
createREPL(
  mainBot,
  instances,
  config,
  (username, kitType, count) => {
    if (!mainInst()) {
      log("ERROR", "Bot not ready yet");
      return;
    }
    mainInst().enqueueKit(username, kitType, count);
  },
  (username, kitType, count) => {
    if (!mainInst()) {
      log("ERROR", "Bot not ready yet");
      return;
    }
    mainInst().handleKit(username, kitType, count);
  },
);
