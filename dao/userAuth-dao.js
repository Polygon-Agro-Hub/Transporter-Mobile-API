const db = require('../startup/database');
const bcrypt = require('bcrypt');

exports.loginUser = async (empId, password) => {
  try {
    const sql = `
      SELECT empId, password, id, passwordUpdated 
      FROM collectionofficer
      WHERE empId = ? AND status = "Approved" AND jobRole = "Driver"
    `;
    const [results] = await db.collectionofficer.promise().query(sql, [empId]);

    if (results.length === 0) {
      throw new Error('User not found');
    }

    const user = results[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new Error('Invalid password');
    }

    return {
      success: true,
      empId: user.empId,
      id: user.id,
      passwordUpdated: user.passwordUpdated,
    };
  } catch (err) {
    throw new Error('Database error:' + err.message);
  }
};


exports.changePassword = async (officerId, currentPassword, newPassword) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT password
      FROM collectionofficer
      WHERE id = ?
    `;    
    db.collectionofficer.query(sql, [officerId], async (err, results) => {
      if (err) {
        console.error("Database error:", err.message);
        return reject(new Error("Database error"));
      }
      if (results.length === 0) {
        return reject(new Error("Officer not found"));
      }
      const user = results[0];
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return reject(new Error("Current password is incorrect"));
      }
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      const updateSql = `
        UPDATE collectionofficer
        SET password = ?, passwordUpdated = 1
        WHERE id = ?
      `;
      db.collectionofficer.query(updateSql, [hashedNewPassword, officerId], (updateErr, updateResults) => {
        if (updateErr) {
          console.error("Database error:", updateErr.message);
          return reject(new Error("Database error"));
        }
        resolve({ success: true, message: "Password changed successfully" });
      });
    });
  });
};