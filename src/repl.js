const readline = require("readline");
const { log, C } = require("./logger");
const { handleConsoleCommand } = require("./commands/console-commands");
const { handleOpCommand } = require("./commands/op-commands");

function createREPL(mainBot, instances, botConfig, enqueueKitFn, handleKitFn) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${C.cyan}kitbot>${C.reset} `,
  });

  rl.prompt();
  rl.on("line", async (line) => {
    const args = line.trim().split(" ");
    const [cmd, ...cmdArgs] = args;
    const bot = mainBot();

    if (!cmd) {
      rl.prompt();
      return;
    }

    if (cmd === "op") {
      handleOpCommand(cmdArgs[0], cmdArgs[1]);
    } else {
      await handleConsoleCommand(
        cmd,
        args,
        bot,
        instances,
        botConfig,
        enqueueKitFn,
        handleKitFn,
      );
    }

    rl.prompt();
  });

  return rl;
}

module.exports = {
  createREPL,
};
