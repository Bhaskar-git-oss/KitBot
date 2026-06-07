const { log, C } = require("../logger");
const { GoalBlock } = require("mineflayer-pathfinder").goals;
const { forwardPos } = require("../helpers/movement");
const { scanChests } = require("../modules/chest-scan");
const { formatTime } = require("../helpers/formatting");
const queue = require("../queue");

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
  "players                - show online player count",
  "clear                  - clear the console",
  "exit                   - shut down",
  "help                   - show this message",
];

async function handleConsoleCommand(
  cmd,
  args,
  bot,
  instances,
  config,
  enqueueKitFn,
  handleKitFn,
) {
  const [a1, a2, a3] = [args[1], args[2], args[3]];

  try {
    if (
      [
        "say",
        "cmd",
        "pos",
        "gm",
        "inv",
        "goto",
        "walk",
        "msg",
        "kit",
        "stocks",
      ].includes(cmd_name) &&
      !bot
    ) {
      log("ERROR", "Bot not connected yet");
      return;
    }

    switch (cmd) {
      case "say":
        bot.chat(args.slice(1).join(" "));
        log("CONSOLE", `-> Chat: ${args.slice(1).join(" ")}`);
        break;

      case "cmd":
        if (a1) {
          bot.chat(args.slice(1).join(" "));
          log("CONSOLE", `-> Command: ${args.slice(1).join(" ")}`);
        }
        break;

      case "pos":
        if (!bot.entity) {
          log("CONSOLE", "Bot entity not loaded");
          break;
        }
        log("CONSOLE", JSON.stringify(bot.entity.position));
        break;

      case "gm":
        if (!bot.game) {
          log("CONSOLE", "Bot game data not loaded");
          break;
        }
        log("CONSOLE", `Gamemode: ${bot.game.gameMode}`);
        break;

      case "inv":
        if (!bot.inventory) {
          log("CONSOLE", "Bot inventory not loaded");
          break;
        }
        log("CONSOLE", JSON.stringify(bot.inventory.items(), null, 2));
        break;

      case "clear":
        console.clear();
        break;

      case "players": {
        if (!bot.players) {
          log("CONSOLE", "Bot players data not loaded");
          break;
        }
        const playerCount = Object.keys(bot.players).length;
        if (playerCount < 50) {
          log("ALERT", `Only ${playerCount} players online (< 50)`);
        } else {
          log("CONSOLE", `${playerCount} players online`);
        }
        break;
      }

      case "goto":
        if (args.length < 4) {
          log("CONSOLE", "Usage: goto <x> <y> <z>");
          break;
        }
        try {
          await bot.pathfinder.goto(
            new GoalBlock(parseInt(a1), parseInt(a2), parseInt(a3)),
          );
          log("MOVE", "Arrived");
        } catch (err) {
          log("ERROR", `Pathfind failed: ${err.message}`);
        }
        break;

      case "walk": {
        const blocks = parseFloat(a1);
        if (!blocks || blocks <= 0) {
          log("CONSOLE", "Usage: walk <blocks>");
          break;
        }
        if (!bot.entity) {
          log("CONSOLE", "Bot entity not loaded");
          break;
        }
        try {
          const { x, y, z } = forwardPos(bot.entity, blocks);
          log("MOVE", `Walking ${blocks} blocks`);
          await bot.pathfinder.goto(new GoalBlock(x, y, z));
          log("MOVE", "Arrived");
        } catch (err) {
          log("ERROR", `Walk failed: ${err.message}`);
        }
        break;
      }

      case "msg":
        if (args.length < 3) {
          log("CONSOLE", "Usage: msg <user> <text>");
          break;
        }
        bot.chat(`/w ${a1} ${args.slice(2).join(" ")}`);
        log("CONSOLE", `-> Whisper to ${a1}`);
        break;

      case "kit":
        if (args.length < 3) {
          log("CONSOLE", "Usage: kit <user> <type> [count]");
          break;
        }
        enqueueKitFn(a1, a2, parseInt(a3) || 1);
        break;

      case "stocks": {
        log("CONSOLE", "Scanning chests...");
        try {
          const botConfig = config.bots[0];
          if (!botConfig) {
            log("CONSOLE", "No bot config found");
            break;
          }
          const result = await scanChests(bot, botConfig);
          result?.split("\n").forEach((l) => log("CONSOLE", l));
        } catch (err) {
          log("ERROR", `Stocks scan failed: ${err.message}`);
        }
        break;
      }

      case "queue": {
        const kitQueue = queue.getKitQueue();
        if (!kitQueue.length) {
          log("QUEUE", "Queue is empty");
          break;
        }
        kitQueue.forEach((j, i) =>
          log("QUEUE", `${i + 1}. ${j.username} -> ${j.kitType} x${j.count}`),
        );
        break;
      }

      case "window":
      case "cooldown": {
        const rem = queue.getWindowRemaining();
        log(
          "CONSOLE",
          rem > 0
            ? `Window active — ${formatTime(rem)} remaining`
            : "Window open, ready to serve",
        );
        break;
      }

      case "status":
        instances.forEach((inst, i) =>
          log("CONSOLE", `bot${i} busy=${inst?.busy ?? "not started"}`),
        );
        break;

      case "help":
        CONSOLE_HELP.forEach((l) => log("CONSOLE", l));
        break;

      default:
        if (cmd) log("CONSOLE", "Unknown command. Type 'help' for a list.");
    }
  } catch (e) {
    log("ERROR", `Unexpected error: ${e.message}`);
  }
}

module.exports = {
  handleConsoleCommand,
  CONSOLE_HELP,
};
