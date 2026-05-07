const { Vec3 } = require("vec3");
const { GoalBlock } = require("mineflayer-pathfinder").goals;
const { log } = require("../logger");

async function scanChests(bot, botConfig) {
  const chests = botConfig.kitChests;
  if (!chests) return "No chests configured.";
  const results = [];

  for (const [kitType, cp] of Object.entries(chests)) {
    try {
      const pos = new Vec3(cp.x, cp.y, cp.z);
      if (bot.entity.position.distanceTo(pos) > 4)
        try {
          await bot.pathfinder.goto(new GoalBlock(cp.x, cp.y, cp.z));
        } catch {
          /* close enough */
        }

      const block = bot.blockAt(pos);
      if (!block) {
        results.push(`[${kitType}] chest not found`);
        continue;
      }

      const chest = await bot.openContainer(block);
      const items = chest.containerItems();
      results.push(
        items.length
          ? `[${kitType}] ${items.map((i) => `${i.name}x${i.count}`).join(", ")}`
          : `[${kitType}] EMPTY`,
      );
      await chest.close();
    } catch (err) {
      results.push(`[${kitType}] error: ${err.message}`);
    }
  }
  return results.join("\n");
}

module.exports = {
  scanChests,
};
