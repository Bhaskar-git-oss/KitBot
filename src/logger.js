const C = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

const LOG_COLORS = {
  BOOT: C.cyan,
  EVENT: C.green,
  ERROR: C.red,
  KIT: C.magenta,
  MOVE: C.yellow,
  CONSOLE: C.gray,
  WHISPER: C.blue,
  OP: C.magenta,
  QUEUE: C.cyan,
  ALERT: C.red,
};

function initLogger() {
}

function log(type, msg, bot = null) {
  const time = new Date().toLocaleTimeString();
  const color = LOG_COLORS[type] || C.gray;
  const prefix = bot ? `${C.yellow}[${bot}]${C.reset} ` : "";
  const line = `${C.gray}[${time}]${C.reset} ${color}[${type}]${C.reset} ${prefix}${msg}`;

  console.log(line);
}

module.exports = {
  log,
  initLogger,
  C,
  LOG_COLORS,
};
