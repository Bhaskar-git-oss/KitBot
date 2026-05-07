const { Vec3 } = require("vec3");
const { GoalBlock } = require("mineflayer-pathfinder").goals;
const { log } = require("../logger");
const { formatTime } = require("../helpers/formatting");
const queue = require("../queue");

// Minecraft block reach distance
const REACH_DISTANCE = 4.5;
// Safe buffer to ensure we're close enough
const SAFE_DISTANCE = 4;

async function handleKit(bot, state, botConfig, username, kitType, count) {
  const chests = botConfig.kitChests;
  const maxKits = botConfig.maxKits || 9;
  count = Math.max(1, Math.min(count || 1, maxKits));

  if (!chests?.[kitType]) {
    bot.chat(
      `/w ${username} Invalid kit. Types: ${Object.keys(chests || {}).join(", ")}`,
    );
    return false;
  }

  try {
    state.busy = true;
    log("KIT", `Delivering ${count}x ${kitType} to ${username}`, bot.username);

    const cp = chests[kitType];
    const chestPos = new Vec3(cp.x, cp.y, cp.z);
    const startDist = bot.entity.position.distanceTo(chestPos);

    // Check if we need to move to chest
    if (startDist > SAFE_DISTANCE) {
      log(
        "MOVE",
        `Moving to chest at ${chestPos} (${startDist.toFixed(1)} blocks away)`,
        bot.username,
      );
      try {
        await bot.pathfinder.goto(new GoalBlock(cp.x, cp.y, cp.z));
        log("MOVE", `Reached chest location`, bot.username);
      } catch (pathErr) {
        log("ERROR", `Pathfinder failed: ${pathErr.message}`, bot.username);
        // Don't just swallow the error - check if we're close enough now
      }
    }

    // After pathfinding, verify we're actually close enough to interact
    const finalDist = bot.entity.position.distanceTo(chestPos);
    if (finalDist > REACH_DISTANCE) {
      log(
        "ERROR",
        `Still too far from chest: ${finalDist.toFixed(1)} blocks (need < ${REACH_DISTANCE})`,
        bot.username,
      );
      bot.chat(
        `/w ${username} Can't reach chest. It might be in an unloaded area.`,
      );
      return false;
    }

    // Verify chest block exists
    const block = bot.blockAt(chestPos);
    if (!block) {
      log(
        "ERROR",
        `Chest block not found at ${chestPos}. Unloaded chunk?`,
        bot.username,
      );
      bot.chat(`/w ${username} Chest not found. Server lag? Try again later.`);
      return false;
    }

    // Open chest and withdraw items
    let chest;
    try {
      chest = await bot.openContainer(block);
    } catch (openErr) {
      log("ERROR", `Failed to open chest: ${openErr.message}`, bot.username);
      bot.chat(`/w ${username} Chest locked or inaccessible. Try again later.`);
      return false;
    }

    // Withdraw items - with type validation
    let taken = 0;
    const chestItems = chest.containerItems();

    if (chestItems.length === 0) {
      await chest.close();
      log("ERROR", `Chest is empty`, bot.username);
      bot.chat(`/w ${username} Chest empty - refill needed.`);
      return false;
    }

    for (const item of chestItems) {
      if (taken >= count) break;

      // Only take shulker boxes (or items marked as kit items)
      if (!item.name.includes("shulker")) {
        log("MOVE", `Skipping non-shulker item: ${item.name}`, bot.username);
        continue;
      }

      const amt = Math.min(item.count, count - taken);
      try {
        await chest.withdraw(item.type, null, amt);
        taken += amt;
        log("KIT", `Withdrew ${amt}x ${item.name}`, bot.username);
      } catch (withdrawErr) {
        log(
          "ERROR",
          `Failed to withdraw ${item.name}: ${withdrawErr.message}`,
          bot.username,
        );
      }
    }

    await chest.close();

    if (taken === 0) {
      log("ERROR", `No shulker items found in chest`, bot.username);
      bot.chat(`/w ${username} No kit items in chest. Refill needed.`);
      return false;
    }

    log("KIT", `Successfully withdrew ${taken} shulker(s)`, bot.username);

    // Send TPA and wait for player
    bot.chat(`/tpa ${username}`);
    log("KIT", `TPA sent to ${username}`, bot.username);
    bot.chat(`/w ${username} TPA sent! Accept it to get your kit.`);

    const start = Date.now();
    let delivered = false;
    const DELIVERY_TIMEOUT = queue.getDeliveryTimeout();
    let lastPlayerCheck = 0;

    while (Date.now() - start < DELIVERY_TIMEOUT) {
      await bot.waitForTicks(20);

      // Check player status with safety
      const player = bot.players[username];
      if (!player || !player.entity) {
        // Log every 2 seconds instead of every tick
        if (Date.now() - lastPlayerCheck > 2000) {
          log("KIT", `Waiting for ${username} to accept TPA...`, bot.username);
          lastPlayerCheck = Date.now();
        }
        continue;
      }

      const target = player.entity;
      if (!target.position) continue;

      const distance = bot.entity.position.distanceTo(target.position);

      if (isNaN(distance) || distance > 100) {
        // Invalid distance, wait for next update
        continue;
      }

      if (distance < 6) {
        log(
          "KIT",
          `${username} accepted TPA (${distance.toFixed(1)} blocks away)`,
          bot.username,
        );
        await bot.lookAt(target.position.offset(0, 1.6, 0), true);

        // Drop shulkers from inventory
        const invItems = bot.inventory.items();
        let dropped = 0;

        for (const item of invItems) {
          if (!item.name.includes("shulker")) continue;

          try {
            await bot.tossStack(item);
            dropped++;
            log("KIT", `Dropped ${item.name}`, bot.username);
            await bot.waitForTicks(10);
          } catch (tossErr) {
            log(
              "ERROR",
              `Failed to drop ${item.name}: ${tossErr.message}`,
              bot.username,
            );
          }
        }

        if (dropped > 0) {
          delivered = true;
          log(
            "KIT",
            `Successfully dropped ${dropped} shulker(s) to ${username}`,
            bot.username,
          );
          break;
        } else {
          log("ERROR", `No shulkers in inventory to drop`, bot.username);
          break;
        }
      }
    }

    if (!delivered) {
      const elapsed = Date.now() - start;
      log(
        "KIT",
        `Delivery timeout after ${(elapsed / 1000).toFixed(1)}s for ${username}`,
        bot.username,
      );
      bot.chat(`/w ${username} Delivery timed out. Accept the TPA next time!`);

      // Return items to chest if timeout
      log("KIT", `Returning ${taken} item(s) to chest`, bot.username);
      return false;
    }

    const COOLDOWN_MS = queue.getCooldownMS();
    bot.chat(
      `/w ${username} Kit delivered! Next window in ${formatTime(COOLDOWN_MS)}.`,
    );
    log("KIT", `Delivery complete for ${username}`, bot.username);

    await new Promise((r) => setTimeout(r, 3000));
    bot.chat("/kill");
    return true;
  } catch (err) {
    log("ERROR", `Delivery failed: ${err.message}`, bot.username);
    log("ERROR", err.stack, bot.username);
    return false;
  } finally {
    state.busy = false;
  }
}

module.exports = {
  handleKit,
};
