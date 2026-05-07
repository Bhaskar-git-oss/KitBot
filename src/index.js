const figlet = require("figlet");
const gradient = require("gradient-string");
const { initLogger, log } = require("./logger");
const { initOperators } = require("./operators");
const { initQueue } = require("./queue");
const { createBotInstance } = require("./bot-factory");
const { createREPL } = require("./repl");
const readline = require("readline");

let config = require("../config.json");

console.log(
  gradient.pastel.multiline(figlet.textSync("> KitBot", { font: "Slant" })),
);

// Initialize readline for logger
const tempRl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `kitbot> `,
});

initLogger(tempRl);
initOperators(config);
initQueue(config);

// Create bot instances
const instances = new Array(config.bots.length).fill(null);
config.bots.forEach((cfg, i) => {
  setTimeout(() => {
    instances[i] = createBotInstance(cfg, i === 0, config);
  }, i * 3500);
});

const mainBot = () => instances[0]?.bot;
const mainInst = () => instances[0];

// Create REPL
createREPL(
  mainBot,
  instances,
  config,
  (username, kitType, count) =>
    mainInst()?.enqueueKit(username, kitType, count),
  (username, kitType, count) => mainInst()?.handleKit(username, kitType, count),
);
