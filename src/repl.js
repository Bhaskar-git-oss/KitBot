const readline = require("readline");
const { log, C } = require("./logger");
const { handleConsoleCommand } = require("./commands/console-commands");
const { handleOpCommand } = require("./commands/op-commands");

function createREPL(mainBot, instances, config, enqueueKitFn, handleKitFn) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${C.cyan}kitbot>${C.reset} `,
    terminal: true,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    const args = trimmed.split(" ");
    const [cmd, ...cmdArgs] = args;
    const bot = mainBot();

    try {
      if (cmd === "op") {
        handleOpCommand(cmdArgs[0], cmdArgs[1]);
      } else if (cmd === "exit") {
        await gracefulShutdown(rl, instances);
        return;
      } else {
        await handleConsoleCommand(
          cmd,
          args,
          bot,
          instances,
          config,
          enqueueKitFn,
          handleKitFn,
        );
      }
    } catch (err) {
      log("ERROR", `Command failed: ${err.message}`);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    log("BOOT", "Console closed");
    process.exit(0);
  });

  return rl;
}

async function gracefulShutdown(rl, instances) {
  log("BOOT", "Shutting down gracefully...");
  rl.close();
  for (const inst of instances) {
    if (inst && inst.bot) {
      try {
        inst.bot.quit();
      } catch (e) {}
    }
  }
  await new Promise((r) => setTimeout(r, 1000));
  log("BOOT", "Goodbye!");
  process.exit(0);
}

module.exports = {
  createREPL,
};
