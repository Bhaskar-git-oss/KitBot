const { Vec3 } = require("vec3");
const { GoalBlock } = require("mineflayer-pathfinder").goals;
const { log } = require("../logger");
const { formatTime } = require("../helpers/formatting");
const queue = require("../queue");
const REACH_DISTANCE = 4.5;
const SAFE_DISTANCE = 4;
const CHEST_OPEN_DELAY = 1500;
const ITEM_SYNC_DELAY = 2000;
const PRE_RESPAWN_DELAY = 3000;
const TPA_MIN_DISTANCE = 3;
const TPA_PERSISTENCE_MS = 1500;

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
      }
    }
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
    log("KIT", `Waiting ${CHEST_OPEN_DELAY}ms before opening chest...`, bot.username);
    await new Promise(r => setTimeout(r, CHEST_OPEN_DELAY));
    let chest;
    try {
      chest = await bot.openContainer(block);
      log("KIT", `Opened chest successfully`, bot.username);
    } catch (openErr) {
      log("ERROR", `Failed to open chest: ${openErr.message}`, bot.username);
      bot.chat(`/w ${username} Chest locked or inaccessible. Try again later.`);
      return false;
    }
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
    bot.chat(`/tpa ${username}`);
    log("KIT", `TPA sent to ${username}`, bot.username);
    bot.chat(`/w ${username} TPA sent! Accept it to get your kit.`);

    const start = Date.now();
    let delivered = false;
    const DELIVERY_TIMEOUT = queue.getDeliveryTimeout();
    let lastPlayerCheck = 0;
    let tpaAcceptanceStart = null;

    while (Date.now() - start < DELIVERY_TIMEOUT) {
      await bot.waitForTicks(20);
      const player = bot.players[username];
      if (!player || !player.entity) {
        if (Date.now() - lastPlayerCheck > 2000) {
          log("KIT", `Waiting for ${username} to accept TPA...`, bot.username);
          lastPlayerCheck = Date.now();
        }
        tpaAcceptanceStart = null;
        continue;
      }

      const target = player.entity;
      if (!target.position) {
        tpaAcceptanceStart = null;
        continue;
      }

      const distance = bot.entity.position.distanceTo(target.position);

      if (isNaN(distance) || distance > 100) {
        tpaAcceptanceStart = null;
        continue;
      }
      if (distance < TPA_MIN_DISTANCE) {
        if (!tpaAcceptanceStart) {
          tpaAcceptanceStart = Date.now();
          log(
            "KIT",
            `${username} entering TPA acceptance range (${distance.toFixed(1)} blocks)`,
            bot.username,
          );
          continue;
        }
        const acceptanceDuration = Date.now() - tpaAcceptanceStart;
        if (acceptanceDuration >= TPA_PERSISTENCE_MS) {
          log(
            "KIT",
            `${username} confirmed TPA acceptance (${distance.toFixed(1)} blocks away for ${acceptanceDuration}ms)`,
            bot.username,
          );
          
          await bot.lookAt(target.position.offset(0, 1.6, 0), true);
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
            log(
              "KIT",
              `Waiting ${ITEM_SYNC_DELAY}ms for item sync...`,
              bot.username,
            );
            await new Promise(r => setTimeout(r, ITEM_SYNC_DELAY));

            break;
          } else {
            log("ERROR", `No shulkers in inventory to drop`, bot.username);
            break;
          }
        }
      } else {
        if (tpaAcceptanceStart) {
          log(
            "KIT",
            `${username} moved away, resetting acceptance timer (${distance.toFixed(1)} blocks)`,
            bot.username,
          );
        }
        tpaAcceptanceStart = null;
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
      log("KIT", `Returning ${taken} item(s) to chest`, bot.username);
      return false;
    }

    const COOLDOWN_MS = queue.getCooldownMS();
    bot.chat(
      `/w ${username} Kit delivered! Next window in ${formatTime(COOLDOWN_MS)}.`,
    );
    log("KIT", `Delivery complete for ${username}`, bot.username);
    log(
      "KIT",
      `Waiting ${PRE_RESPAWN_DELAY}ms before respawn...`,
      bot.username,
    );
    await new Promise((r) => setTimeout(r, PRE_RESPAWN_DELAY));
    
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
