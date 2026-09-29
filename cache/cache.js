const NodeCache = require("node-cache");

/**
 * Shared in-memory cache instance.
 *
 * stdTTL: 0       => No automatic expiration. Data persists until explicitly updated.
 * checkperiod: 0  => No background timer cleanup. Only cleaned/updated when new data arrives.
 */
const cache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

module.exports = cache;
