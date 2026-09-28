const jwt = require("jsonwebtoken");
const userAuthDao = require("../dao/userAuth-dao");
const officerStatusCache = require("../services/officer-status-cache");
const { OFFICER_STATUS } = require("../constants/officer-status");

const auth = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    console.error("No token provided");
    return res.status(401).json({
      status: "error",
      message: "No token provided",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      console.error("Token verification error:", err);
      return res.status(401).json({
        status: "error",
        message: "Invalid token",
      });
    }

    const officerId = decoded.id;

    // 1. In-memory cache check: fast-reject if driver is known to be rejected or not approved
    if (officerStatusCache.isRejected(officerId)) {
      return res.status(403).json({
        success: false,
        message: "This Employee ID is rejected",
        status: OFFICER_STATUS.REJECTED,
        statusType: "rejected",
      });
    }

    if (officerStatusCache.isNotApproved(officerId)) {
      return res.status(403).json({
        success: false,
        message: "This Employee ID is not approved",
        status: OFFICER_STATUS.NOT_APPROVED,
        statusType: "not_approved",
      });
    }

    // 2. Fast-approve if verified in cache
    if (officerStatusCache.isApproved(officerId)) {
      req.user = decoded;
      return next();
    }

    // 3. Cache miss: verify user status from DAO and update cache
    try {
      const officer = await userAuthDao.getOfficerDetailsDao({ id: officerId });

      if (!officer) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      const userStatus = officer.status;
      officerStatusCache.setOfficerStatus(officerId, userStatus);

      if (userStatus === OFFICER_STATUS.REJECTED) {
        return res.status(403).json({
          success: false,
          message: "This Employee ID is rejected",
          status: OFFICER_STATUS.REJECTED,
        });
      }

      if (userStatus !== OFFICER_STATUS.APPROVED) {
        return res.status(403).json({
          success: false,
          message: "This Employee ID is not approved",
          status: OFFICER_STATUS.NOT_APPROVED,
        });
      }

      // Attach decoded token to request
      req.user = decoded;
      next();
    } catch (dbErr) {
      console.error("Database error during status verification:", dbErr);
      return res.status(500).json({
        success: false,
        message: "Internal server error during authorization verification",
      });
    }
  });
};

module.exports = auth;
