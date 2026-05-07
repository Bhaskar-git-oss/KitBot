const { log } = require("../logger");
const { adminAdd, adminRemove, getAdmins } = require("../operators");

function handleOpCommand(a1, a2) {
  if (a1 === "add") {
    log("OP", a2 ? adminAdd(a2) : "Usage: admin add <username>");
    return;
  }
  if (a1 === "remove") {
    log("OP", a2 ? adminRemove(a2) : "Usage: admin remove <username>");
    return;
  }
  if (a1 === "list") {
    const admins = getAdmins();
    log("OP", `Admins: ${[...admins].join(", ") || "none"}`);
    return;
  }
  log("CONSOLE", "Usage: admin <add|remove|list> [username]");
}

module.exports = {
  handleOpCommand,
};
