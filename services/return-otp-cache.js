const cache = require("../cache/cache");

const OTP_PREFIX = "return_otp_";
const INV_PREFIX = "return_otp_inv_";
const DCM_PREFIX = "return_otp_dcm_";
const DEFAULT_TTL_SECONDS = 120; // 2 minutes matching database expireTime

/**
 * Store a generated return OTP in node-cache with TTL.
 *
 * @param {Object} data
 * @param {number|string} data.drvOrderId
 * @param {string} data.invoiceNumber
 * @param {string} data.dcmEmpId
 * @param {number} data.officerId
 * @param {number|string} data.otpCode
 * @param {number} [data.otpId]
 * @param {number} [ttlSeconds=120]
 */
const setReturnOtp = (data, ttlSeconds = DEFAULT_TTL_SECONDS) => {
  if (!data) return false;

  const payload = {
    otpId: data.otpId,
    otpCode: String(data.otpCode),
    drvOrderId: data.drvOrderId ? Number(data.drvOrderId) : undefined,
    invoiceNumber: String(data.invoiceNumber || ""),
    dcmEmpId: String(data.dcmEmpId || "").toUpperCase(),
    officerId: data.officerId ? Number(data.officerId) : undefined,
    createdAt: data.createdAt || new Date().toISOString(),
    expireTime: data.expireTime || new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    expiresAt: Date.now() + ttlSeconds * 1000,
  };

  // Cache by drvOrderId
  if (data.drvOrderId) {
    cache.set(`${OTP_PREFIX}${Number(data.drvOrderId)}`, payload, ttlSeconds);
  }

  // Cache by invoiceNumber
  if (data.invoiceNumber) {
    cache.set(`${INV_PREFIX}${String(data.invoiceNumber).trim()}`, payload, ttlSeconds);
  }

  // Cache latest OTP by DCM empId
  if (data.dcmEmpId) {
    cache.set(`${DCM_PREFIX}${String(data.dcmEmpId).trim().toUpperCase()}`, payload, ttlSeconds);
  }

  console.log(`[Return OTP Cache] Cached OTP ${payload.otpCode} for order ${payload.invoiceNumber || payload.drvOrderId} (DCM: ${payload.dcmEmpId}, TTL: ${ttlSeconds}s)`);
  return true;
};

/**
 * Look up a return OTP from node-cache by drvOrderId or invoiceNumber.
 *
 * @param {Object} query
 * @param {number|string} [query.drvOrderId]
 * @param {string} [query.invoiceNumber]
 * @param {string} [query.dcmEmpId]
 * @returns {Object|null}
 */
const getReturnOtp = ({ drvOrderId, invoiceNumber, dcmEmpId } = {}) => {
  if (drvOrderId) {
    const cached = cache.get(`${OTP_PREFIX}${Number(drvOrderId)}`);
    if (cached) return cached;
  }

  if (invoiceNumber) {
    const cached = cache.get(`${INV_PREFIX}${String(invoiceNumber).trim()}`);
    if (cached) return cached;
  }

  if (dcmEmpId) {
    const cached = cache.get(`${DCM_PREFIX}${String(dcmEmpId).trim().toUpperCase()}`);
    if (cached) return cached;
  }

  return null;
};

/**
 * Invalidate / clear a return OTP from node-cache upon successful verification.
 *
 * @param {Object} query
 * @param {number|string} [query.drvOrderId]
 * @param {string} [query.invoiceNumber]
 * @param {string} [query.dcmEmpId]
 */
const invalidateReturnOtp = ({ drvOrderId, invoiceNumber, dcmEmpId } = {}) => {
  if (drvOrderId) {
    cache.del(`${OTP_PREFIX}${Number(drvOrderId)}`);
  }
  if (invoiceNumber) {
    cache.del(`${INV_PREFIX}${String(invoiceNumber).trim()}`);
  }
  if (dcmEmpId) {
    cache.del(`${DCM_PREFIX}${String(dcmEmpId).trim().toUpperCase()}`);
  }
  console.log(`[Return OTP Cache] Cleared OTP cache for order ${invoiceNumber || drvOrderId}`);
};

module.exports = {
  setReturnOtp,
  getReturnOtp,
  invalidateReturnOtp,
  DEFAULT_TTL_SECONDS,
};
