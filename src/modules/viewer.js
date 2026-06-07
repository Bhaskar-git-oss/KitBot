const { log } = require("../logger");

let started = false;

function startViewer(bot, port) {
  if (started) return;
  try {
    const { mineflayer: mineflayerViewer } = require("prismarine-viewer");
    mineflayerViewer(bot, { port, firstPerson: true });
    started = true;
    log("BOOT", "Viewer running at http://localhost:" + port, bot.username);
  } catch (err) {
    log("ERROR", `Viewer failed to start: ${err.message}`, bot.username);
  }
}

module.exports = { startViewer };
