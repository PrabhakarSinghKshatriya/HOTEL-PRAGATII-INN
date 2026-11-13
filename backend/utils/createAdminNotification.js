const AdminNotification = require('../models/AdminNotification');

async function createAdminNotification(data) {
  try {
    return await AdminNotification.create(data);
  } catch (error) {
    console.error('Admin notification creation failed:', error.message);
    return null;
  }
}

module.exports = createAdminNotification;
