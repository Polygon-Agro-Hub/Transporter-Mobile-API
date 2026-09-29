const path = require("path");

/**
 * Get the current app version policy.
 */
exports.getAppVersion = (req, res) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Content-Type", "application/json");
  return res.sendFile(path.join(__dirname, "../remote-config", "app-version.json"));
};
