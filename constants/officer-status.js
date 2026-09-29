/**
 * Official officer account statuses used across the mobile application and database.
 * Exactly matches the ENUM values stored in the MySQL collectionofficer table.
 */
const OFFICER_STATUS = {
  NOT_APPROVED: "Not Approved",
  REJECTED: "Rejected",
  APPROVED: "Approved",
};

module.exports = { OFFICER_STATUS };
