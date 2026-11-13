const Notification = require('../models/Notification');

async function createNotification({
  refNo,
  phone,
  type,
  title,
  message,
  status
}) {
  try {
    return await Notification.create({
      refNo,
      phone,
      type,
      title,
      message,
      status
    });
  } catch (error) {
    console.error('Notification creation failed:', error.message);
    return null;
  }
}

module.exports = createNotification;
