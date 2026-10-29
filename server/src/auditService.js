// auditService.js - Append-only system audit logger
const { db } = require('./database');
const crypto = require('crypto');

function logAudit({
  eventType,
  entityType,
  entityId,
  actorId,
  actorName = 'System',
  actorRole = 'SYSTEM',
  previousValue = null,
  newValue = null,
  reason = null,
  policyVersion = null,
  ipAddress = '127.0.0.1'
}) {
  const id = 'AUD-' + crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO audit_logs (
      id, event_type, entity_type, entity_id, actor_id, actor_name, actor_role,
      previous_value_json, new_value_json, reason, policy_version, ip_address, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  stmt.run(
    id,
    eventType,
    entityType,
    entityId,
    actorId,
    actorName,
    actorRole,
    previousValue ? JSON.stringify(previousValue) : null,
    newValue ? JSON.stringify(newValue) : null,
    reason,
    policyVersion ? String(policyVersion) : null,
    ipAddress
  );

  return id;
}

function getAuditLogs(entityId = null, limit = 100) {
  if (entityId) {
    return db.prepare(`
      SELECT * FROM audit_logs 
      WHERE entity_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(entityId, limit);
  }
  return db.prepare(`
    SELECT * FROM audit_logs 
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(limit);
}

module.exports = { logAudit, getAuditLogs };
