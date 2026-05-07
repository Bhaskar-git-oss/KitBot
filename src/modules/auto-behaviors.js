const { log } = require("../logger");

function startAutoMessages(bot, state, botConfig, config) {
  const am = botConfig.autoMessages || config.autoMessages;
  if (!am?.messages?.length) return;
  state.msgInterval = setInterval(() => {
    if (state.busy) return;
    bot.chat(am.messages[Math.floor(Math.random() * am.messages.length)]);
  }, am.interval || 60000);
  log("BOOT", "Auto messages started", bot.username);
}

function startHeadMovement(bot, state) {
  state.headInterval = setInterval(() => {
    if (state.busy) return;
    bot.look(
      Math.random() * Math.PI * 2 - Math.PI,
      Math.random() * 1.2 - 0.6,
      false,
    );
  }, 2500);
  log("BOOT", "Head movement started", bot.username);
}

module.exports = {
  startAutoMessages,
  startHeadMovement,
};
