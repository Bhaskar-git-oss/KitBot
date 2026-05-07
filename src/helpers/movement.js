const { Movements } = require("mineflayer-pathfinder");
const mcData = require("minecraft-data");

const setMovements = (bot) =>
  bot.pathfinder.setMovements(new Movements(bot, mcData(bot.version)));

/**
 * Calculate position in front of entity based on yaw angle
 * Minecraft yaw: 0° = +Z (south), 90° = -X (west), 180° = -Z (north), 270° = +X (east)
 *
 * @param {Entity} entity - Bot or player entity
 * @param {number} dist - Distance in blocks to walk forward
 * @returns {{x: number, y: number, z: number}} Target coordinates
 */
function forwardPos(entity, dist) {
  if (!entity || !entity.position || typeof entity.yaw !== "number") {
    throw new Error("Invalid entity or yaw");
  }

  // Yaw is in radians, but Minecraft uses a different convention
  // sin(yaw) gives X component, cos(yaw) gives Z component
  const yaw = entity.yaw;
  const x = Math.floor(entity.position.x - Math.sin(yaw) * dist);
  const y = Math.floor(entity.position.y);
  const z = Math.floor(entity.position.z - Math.cos(yaw) * dist);

  return { x, y, z };
}

/**
 * Validate that forward position is reasonable (not too far in one direction)
 * Useful to detect if spawn yaw is somehow invalid
 *
 * @param {Entity} entity - Bot entity
 * @param {{x: number, y: number, z: number}} target - Target position
 * @param {number} maxDist - Maximum expected distance
 * @returns {boolean} True if target is reasonable
 */
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
