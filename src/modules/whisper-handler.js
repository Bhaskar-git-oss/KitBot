const { log } = require("../logger");
const { handleWhisperCommand } = require("../commands/whisper-commands");

function startKitModule(bot, botConfig, enqueueKitFn) {
  bot.on("whisper", (username, message) => {
    handleWhisperCommand(bot, username, message, botConfig, enqueueKitFn);
  });
  log("BOOT", "Whisper handler started", bot.username);
}

module.exports = {
  startKitModule,
};
