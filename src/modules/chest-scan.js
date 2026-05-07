const { Vec3 } = require("vec3");
const { GoalBlock } = require("mineflayer-pathfinder").goals;
const { log } = require("../logger");

const SAFE_DISTANCE = 4;
const REACH_DISTANCE = 4.5;

async function scanChests(bot, botConfig) {
  const chests = botConfig.kitChests;
  if (!chests || Object.keys(chests).length === 0) {
    return "No chests configured.";
  }

  const results = [];

  // Verify bot has valid position
  if (!bot.entity || !bot.entity.position) {
    return "Bot entity not loaded - cannot scan chests.";
  }

  for (const [kitType, cp] of Object.entries(chests)) {
    try {
      const pos = new Vec3(cp.x, cp.y, cp.z);

      // Safe distance calculation
      let currentDist = -1;
      try {
        currentDist = bot.entity.position.distanceTo(pos);
      } catch (e) {
        log(
          "ERROR",
          `Distance calc failed for ${kitType}: ${e.message}`,
          bot.username,
        );
        results.push(`[${kitType}] error calculating distance`);
        continue;
      }

      // If unreasonably far (>100000), likely a calc error or unloaded
      if (currentDist > 100000) {
        results.push(
          `[${kitType}] distance calculation error (${currentDist.toFixed(1)} blocks)`,
        );
        continue;
      }

      // Only pathfind if actually far away
      if (currentDist > SAFE_DISTANCE) {
        log(
          "MOVE",
          `Pathfinding to ${kitType} chest at ${pos} (${currentDist.toFixed(1)} blocks away)`,
          bot.username,
        );
        try {
          await bot.pathfinder.goto(new GoalBlock(cp.x, cp.y, cp.z));
          log("MOVE", `Reached ${kitType} chest location`, bot.username);
        } catch (pathErr) {
          log(
            "ERROR",
            `Pathfinder failed for ${kitType}: ${pathErr.message}`,
            bot.username,
          );
          // Continue anyway - might be close enough to interact
        }
      }

      // Verify final distance
      const finalDist = bot.entity.position.distanceTo(pos);
      if (finalDist > REACH_DISTANCE) {
        results.push(
          `[${kitType}] too far (${finalDist.toFixed(1)} blocks) - chest unreachable`,
        );
        continue;
      }

      // Verify chest block exists
      const block = bot.blockAt(pos);
      if (!block) {
        results.push(`[${kitType}] chest not found at ${pos}`);
        continue;
      }

      // Open and scan
      let chest;
      try {
        chest = await bot.openContainer(block);
      } catch (openErr) {
        results.push(`[${kitType}] failed to open: ${openErr.message}`);
        continue;
      }

      const items = chest.containerItems();
      if (items.length === 0) {
        results.push(`[${kitType}] EMPTY`);
      } else {
        const itemList = items.map((i) => `${i.name}x${i.count}`).join(", ");
        results.push(`[${kitType}] ${itemList}`);
      }

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
