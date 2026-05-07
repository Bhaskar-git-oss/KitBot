module.exports = {
  COOLDOWN_MS: (config) => config.kitCooldownMs || 600000,
  DELIVERY_TIMEOUT: (config) => config.deliveryTimeoutMs || 45000,
  QUEUE_NOTIFY: (config) => config.queueNotifyOnStart !== false,
};
