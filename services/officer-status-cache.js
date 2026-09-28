const cache = require("../cache/cache");
const userAuthDao = require("../dao/userAuth-dao");
const { OFFICER_STATUS } = require("../constants/officer-status");

const REJECTED_OFFICERS_KEY = "rejected_officer_ids";
const NOT_APPROVED_OFFICERS_KEY = "not_approved_officer_ids";
const OFFICER_STATUS_PREFIX = "officer_status_";

/**
 * Fetch all disallowed officers (Rejected, Not Approved) from DB and populate in-memory cache.
 */
const triggerGetRejectOfficers = async () => {
  try {
    const results = await userAuthDao.getDisallowedOfficersDao();

    const rejectedIds = [];
    const notApprovedIds = [];

    results.forEach((row) => {
      const id = Number(row.id);
      const status = row.status;
      cache.set(`${OFFICER_STATUS_PREFIX}${id}`, status);

      if (status === OFFICER_STATUS.REJECTED) {
        rejectedIds.push(id);
      } else if (status === OFFICER_STATUS.NOT_APPROVED) {
        notApprovedIds.push(id);
      }
    });

    cache.set(REJECTED_OFFICERS_KEY, rejectedIds);
    cache.set(NOT_APPROVED_OFFICERS_KEY, notApprovedIds);

    console.log(
      `[Cache] Loaded disallowed officers: ${rejectedIds.length} ${OFFICER_STATUS.REJECTED}, ${notApprovedIds.length} ${OFFICER_STATUS.NOT_APPROVED}`
    );
    return rejectedIds;
  } catch (err) {
    console.error("[Cache] Error fetching disallowed officers from DB:", err.message);
    return [];
  }
};

/**
 * Get the list of rejected officer IDs from cache.
 * If cache is empty, triggers database fetch.
 */
const getRejectedOfficerIds = async () => {
  let rejectedIds = cache.get(REJECTED_OFFICERS_KEY);
  if (!rejectedIds) {
    rejectedIds = await triggerGetRejectOfficers();
  }
  return rejectedIds || [];
};

/**
 * Check if an officer ID is in the rejected cache.
 */
const isRejected = (officerId) => {
  const numericId = Number(officerId);
  const status = cache.get(`${OFFICER_STATUS_PREFIX}${numericId}`);
  if (status === OFFICER_STATUS.REJECTED) return true;

  const rejectedIds = cache.get(REJECTED_OFFICERS_KEY);
  return Array.isArray(rejectedIds) && rejectedIds.includes(numericId);
};

/**
 * Check if an officer ID is in the not-approved cache.
 */
const isNotApproved = (officerId) => {
  const numericId = Number(officerId);
  const status = cache.get(`${OFFICER_STATUS_PREFIX}${numericId}`);
  if (status === OFFICER_STATUS.NOT_APPROVED) return true;

  const notApprovedIds = cache.get(NOT_APPROVED_OFFICERS_KEY);
  return Array.isArray(notApprovedIds) && notApprovedIds.includes(numericId);
};

/**
 * Check if an officer is cached as strictly Approved.
 */
const isApproved = (officerId) => {
  const numericId = Number(officerId);
  const status = cache.get(`${OFFICER_STATUS_PREFIX}${numericId}`);
  return status === OFFICER_STATUS.APPROVED;
};

/**
 * Manually update or invalidate a single officer's status in cache.
 * Cleans old status and sets new status without background timers.
 */
const setOfficerStatus = (officerId, status) => {
  const numericId = Number(officerId);
  cache.set(`${OFFICER_STATUS_PREFIX}${numericId}`, status);

  let rejectedIds = cache.get(REJECTED_OFFICERS_KEY) || [];
  let notApprovedIds = cache.get(NOT_APPROVED_OFFICERS_KEY) || [];

  if (status === OFFICER_STATUS.REJECTED) {
    if (!rejectedIds.includes(numericId)) {
      rejectedIds.push(numericId);
    }
    notApprovedIds = notApprovedIds.filter((id) => id !== numericId);
  } else if (status === OFFICER_STATUS.NOT_APPROVED) {
    if (!notApprovedIds.includes(numericId)) {
      notApprovedIds.push(numericId);
    }
    rejectedIds = rejectedIds.filter((id) => id !== numericId);
  } else {
    // If Approved, remove from both disallowed lists
    rejectedIds = rejectedIds.filter((id) => id !== numericId);
    notApprovedIds = notApprovedIds.filter((id) => id !== numericId);
  }

  cache.set(REJECTED_OFFICERS_KEY, rejectedIds);
  cache.set(NOT_APPROVED_OFFICERS_KEY, notApprovedIds);
};

/**
 * Clear the entire status cache.
 */
const clearCache = () => {
  cache.flushAll();
};

module.exports = {
  cache,
  triggerGetRejectOfficers,
  getRejectedOfficerIds,
  isRejected,
  isNotApproved,
  isApproved,
  setOfficerStatus,
  clearCache,
};
