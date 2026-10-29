// notificationService.js
const { db } = require('./database');
const crypto = require('crypto');

function createNotification({
  recipientId,
  eventType,
  title,
  message,
  relatedEntityType = null,
  relatedEntityId = null,
  isReminder = 0
}) {
  // Prevent duplicate reminders within 24 hours for the same event and entity
  if (isReminder && relatedEntityId) {
    const existing = db.prepare(`
      SELECT id FROM notifications 
      WHERE recipient_id = ? AND event_type = ? AND related_entity_id = ? AND is_reminder = 1
      AND created_at >= datetime('now', '-1 day')
    `).get(recipientId, eventType, relatedEntityId);
    if (existing) {
      return null;
    }
  }

  const id = 'NOTIF-' + crypto.randomUUID();
  db.prepare(`
    INSERT INTO notifications (
      id, recipient_id, event_type, title, message, related_entity_type, related_entity_id, is_read, is_reminder, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))
  `).run(id, recipientId, eventType, title, message, relatedEntityType, relatedEntityId, isReminder);

  return id;
}

function getNotificationsForUser(userId) {
  return db.prepare(`
    SELECT * FROM notifications 
    WHERE recipient_id = ? 
    ORDER BY created_at DESC 
    LIMIT 50
  `).all(userId);
}

function markAsRead(notificationId, userId) {
  db.prepare(`
    UPDATE notifications 
    SET is_read = 1 
    WHERE id = ? AND recipient_id = ?
  `).run(notificationId, userId);
}

function markAllAsRead(userId) {
  db.prepare(`
    UPDATE notifications 
    SET is_read = 1 
    WHERE recipient_id = ?
  `).run(userId);
}

module.exports = {
  createNotification,
  getNotificationsForUser,
  markAsRead,
  markAllAsRead
};
