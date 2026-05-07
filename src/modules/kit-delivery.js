const { Vec3 } = require("vec3");
const { GoalBlock } = require("mineflayer-pathfinder").goals;
const { log } = require("../logger");
const { formatTime } = require("../helpers/formatting");
const queue = require("../queue");

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

    if (bot.entity.position.distanceTo(chestPos) > 2) {
      log("MOVE", `Going to chest at ${chestPos}`, bot.username);
      try {
        await bot.pathfinder.goto(new GoalBlock(cp.x, cp.y, cp.z));
      } catch {
        /* close enough */
      }
    }

    const block = bot.blockAt(chestPos);
    if (!block) throw new Error("Chest not found");

    const chest = await bot.openContainer(block);
    let taken = 0;
    for (const item of chest.containerItems()) {
      if (taken >= count) break;
      const amt = Math.min(item.count, count - taken);
      await chest.withdraw(item.type, null, amt);
      taken += amt;
    }
    await chest.close();

    if (!taken) {
      bot.chat(`/w ${username} Chest empty.`);
      return false;
    }
    log("KIT", `Withdrew ${taken} item(s)`, bot.username);

    bot.chat(`/tpa ${username}`);
    log("KIT", `TPA sent to ${username}`, bot.username);

    const start = Date.now();
    let delivered = false;
    const DELIVERY_TIMEOUT = queue.getDeliveryTimeout();

    while (Date.now() - start < DELIVERY_TIMEOUT) {
      await bot.waitForTicks(20);
      const target = bot.players[username]?.entity;
      if (!target) continue;
      if (bot.entity.position.distanceTo(target.position) < 6) {
        log("KIT", `${username} nearby, dropping items`, bot.username);
        await bot.lookAt(target.position.offset(0, 1.6, 0), true);
        for (const item of bot.inventory.items()) {
          if (!item.name.includes("shulker")) continue;
          await bot.tossStack(item);
          await bot.waitForTicks(10);
        }
        delivered = true;
        break;
      }
    }

    if (!delivered) {
      bot.chat(`/w ${username} Delivery timed out.`);
      log("KIT", `Timed out on ${username}`, bot.username);
      return false;
    }

    const COOLDOWN_MS = queue.getCooldownMS();
    bot.chat(
      `/w ${username} Kit delivered! Next window opens in ${formatTime(COOLDOWN_MS)}.`,
    );
    log("KIT", `Delivered to ${username}`, bot.username);

    await new Promise((r) => setTimeout(r, 3000));
    bot.chat("/kill");
    return true;
  } catch (err) {
    log("ERROR", err.message, bot.username);
    return false;
  } finally {
    state.busy = false;
  }
}

module.exports = {
  handleKit,
};
