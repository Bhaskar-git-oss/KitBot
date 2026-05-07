const { log } = require("./logger");
const { formatTime } = require("./helpers/formatting");

let config = null;
let COOLDOWN_MS = null;
let DELIVERY_TIMEOUT = null;
let QUEUE_NOTIFY = null;

const kitQueue = [];
let windowUntil = 0;
let queueRunning = false;

function initQueue(loadedConfig) {
  config = loadedConfig;
  COOLDOWN_MS = config.kitCooldownMs || 600000;
  DELIVERY_TIMEOUT = config.deliveryTimeoutMs || 45000;
  QUEUE_NOTIFY = config.queueNotifyOnStart !== false;
}

const windowRemaining = () => Math.max(0, windowUntil - Date.now());

function getKitQueue() {
  return kitQueue;
}

function getWindowRemaining() {
  return windowRemaining();
}

function getCooldownMS() {
  return COOLDOWN_MS;
}

function getDeliveryTimeout() {
  return DELIVERY_TIMEOUT;
}

function getQueueNotify() {
  return QUEUE_NOTIFY;
}

function setWindowUntil(time) {
  windowUntil = time;
}

function getWindowUntil() {
  return windowUntil;
}

function setQueueRunning(state) {
  queueRunning = state;
}

function getQueueRunning() {
  return queueRunning;
}

module.exports = {
  initQueue,
  kitQueue,
  windowRemaining,
  getKitQueue,
  getWindowRemaining,
  getCooldownMS,
  getDeliveryTimeout,
  getQueueNotify,
  setWindowUntil,
  getWindowUntil,
  setQueueRunning,
  getQueueRunning,
};
