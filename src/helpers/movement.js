const { Movements } = require("mineflayer-pathfinder");
const mcData = require("minecraft-data");

const setMovements = (bot) =>
  bot.pathfinder.setMovements(new Movements(bot, mcData(bot.version)));

function forwardPos(entity, dist) {
  return {
    x: Math.floor(entity.position.x - Math.sin(entity.yaw) * dist),
    y: Math.floor(entity.position.y),
    z: Math.floor(entity.position.z - Math.cos(entity.yaw) * dist),
  };
}

module.exports = {
  setMovements,
  forwardPos,
};
