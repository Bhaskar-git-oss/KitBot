const { Movements } = require("mineflayer-pathfinder");
const mcData = require("minecraft-data");

const setMovements = (bot) =>
  bot.pathfinder.setMovements(new Movements(bot, mcData(bot.version)));

function forwardPos(entity, dist) {
  if (!entity || !entity.position || typeof entity.yaw !== "number") {
    throw new Error("Invalid entity or yaw");
  }
  const yaw = entity.yaw;
  const x = Math.floor(entity.position.x - Math.sin(yaw) * dist);
  const y = Math.floor(entity.position.y);
  const z = Math.floor(entity.position.z - Math.cos(yaw) * dist);

  return { x, y, z };
}

function isValidForwardPos(entity, target, maxDist = 50) {
  if (!target || !entity) return false;
  const dist = entity.position.distanceTo(target);
  return dist > 0 && dist <= maxDist;
}

module.exports = {
  setMovements,
  forwardPos,
  isValidForwardPos,
};
