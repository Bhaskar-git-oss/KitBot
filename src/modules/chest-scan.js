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
  if (!bot.entity || !bot.entity.position) {
    return "Bot entity not loaded - cannot scan chests.";
  }

  for (const [kitType, cp] of Object.entries(chests)) {
    try {
      const pos = new Vec3(cp.x, cp.y, cp.z);
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
      if (currentDist > 100000) {
        results.push(
          `[${kitType}] distance calculation error (${currentDist.toFixed(1)} blocks)`,
        );
        continue;
      }
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
        }
      }
      const finalDist = bot.entity.position.distanceTo(pos);
      if (finalDist > REACH_DISTANCE) {
        results.push(
          `[${kitType}] too far (${finalDist.toFixed(1)} blocks) - chest unreachable`,
        );
        continue;
      }
      const block = bot.blockAt(pos);
      if (!block) {
        results.push(`[${kitType}] chest not found at ${pos}`);
        continue;
      }
      let chest;
      try {
        await new Promise((r) => setTimeout(r, 1000));
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
