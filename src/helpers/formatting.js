function formatTime(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function getDisplayName(item) {
  if (!item.customName) return item.name;
  try {
    const parsed = JSON.parse(item.customName);
    const raw =
      typeof parsed === "string"
        ? parsed
        : parsed.text ||
          parsed.extra?.map((e) => e.text || "").join("") ||
          item.name;
    return raw.replace(/§[0-9a-fk-or]/gi, "").trim() || item.name;
  } catch {
    return item.customName.replace(/§[0-9a-fk-or]/gi, "").trim() || item.name;
  }
}

module.exports = {
  formatTime,
  getDisplayName,
};
