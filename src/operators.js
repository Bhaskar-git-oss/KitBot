const fs = require("fs");
const { log } = require("./logger");

let config = null;
let admins = null;
let users = null;

function initOperators(loadedConfig) {
  config = loadedConfig;

  // Load admins from config (no hardcoded fallback)
  admins = new Set(config.bots[0]?.admins || []);

  // Load users from config
  users = new Set(config.bots[0]?.allowedPlayers || []);

  log("BOOT", `Loaded ${admins.size} admins, ${users.size} whitelisted users`);
}

function saveOps() {
  config.bots[0].admins = [...admins];
  config.bots[0].allowedPlayers = [...users];
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}

// User management
function userAdd(target, by = "console") {
  if (users.has(target)) return `${target} is already whitelisted.`;
  users.add(target);
  saveOps();
  log("OP", `${by} added user ${target}`);
  return `Added ${target} to whitelist.`;
}

function userRemove(target, by = "console") {
  if (!users.has(target)) return `${target} is not in the whitelist.`;
  users.delete(target);
  saveOps();
  log("OP", `${by} removed user ${target}`);
  return `Removed ${target} from whitelist.`;
}

// Admin management (console only)
function adminAdd(target) {
  if (admins.has(target)) return `${target} is already an admin.`;
  admins.add(target);
  saveOps();
  log("OP", `Console added admin ${target}`);
  return `Added ${target} as admin.`;
}

function adminRemove(target) {
  if (!admins.has(target)) return `${target} is not an admin.`;
  admins.delete(target);
  saveOps();
  log("OP", `Console removed admin ${target}`);
  return `Removed ${target} as admin.`;
}

function isAdmin(username) {
  return admins.has(username);
}

function isUser(username) {
  return users.has(username);
}

function getAdmins() {
  return admins;
}

function getUsers() {
  return users;
}

module.exports = {
  initOperators,
  userAdd,
  userRemove,
  adminAdd,
  adminRemove,
  isAdmin,
  isUser,
  getAdmins,
  getUsers,
};
