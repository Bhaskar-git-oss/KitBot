const { log } = require("../logger");
const { scanChests } = require("../modules/chest-scan");
const { userAdd, userRemove, isAdmin, isUser } = require("../operators");

const PLAYER_HELP = [
  "kit <type> [count] - request a kit",
  "stocks            - show chest contents",
  "help              - show this message",
];

const ADMIN_HELP = [
  "addplayer <user>    - add user to whitelist",
  "removeplayer <user> - remove user from whitelist",
];

const KNOWN_COMMANDS = ["kit", "stocks", "help", "addplayer", "removeplayer"];

async function handleWhisperCommand(
  bot,
  username,
  message,
  botConfig,
  enqueueKitFn,
) {
  if (username === bot.username) return;
  log("WHISPER", `${username}: ${message}`, bot.username);

  const args = message.trim().split(" ");
  const cmd = args[0].toLowerCase();
  const isAdminUser = isAdmin(username);
  const isWhitelistedUser = isUser(username);
  const isAllowed = isAdminUser || isWhitelistedUser;
  if (!isAllowed && KNOWN_COMMANDS.includes(cmd) && cmd !== "help") {
    bot.chat(`/w ${username} You're not authorized.`);
    return;
  }

  switch (cmd) {
    case "help":
      PLAYER_HELP.forEach((line) => bot.chat(`/w ${username} ${line}`));
      if (isAdminUser)
        ADMIN_HELP.forEach((line) => bot.chat(`/w ${username} ${line}`));
      break;

    case "stocks":
      bot.chat(`/w ${username} Scanning chests...`);
      (await scanChests(bot, botConfig))
        .split("\n")
        .forEach((line) => bot.chat(`/w ${username} ${line}`));
      break;

    case "addplayer":
      if (!isAdminUser) {
        bot.chat(`/w ${username} You're not authorized.`);
        return;
      }
      if (!args[1]) {
        bot.chat(`/w ${username} Usage: addplayer <username>`);
        break;
      }
      bot.chat(`/w ${username} ${userAdd(args[1], username)}`);
      break;

    case "removeplayer":
      if (!isAdminUser) {
        bot.chat(`/w ${username} You're not authorized.`);
        return;
      }
      if (!args[1]) {
        bot.chat(`/w ${username} Usage: removeplayer <username>`);
        break;
      }
      bot.chat(`/w ${username} ${userRemove(args[1], username)}`);
      break;

    case "kit":
      if (!args[1]) {
        bot.chat(`/w ${username} Usage: kit <type> [count]`);
        break;
      }
      enqueueKitFn(username, args[1], parseInt(args[2]) || 1);
      break;
  }
}

module.exports = {
  handleWhisperCommand,
  PLAYER_HELP,
  ADMIN_HELP,
  KNOWN_COMMANDS,
};
