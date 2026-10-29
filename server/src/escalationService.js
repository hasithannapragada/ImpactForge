// escalationService.js - Periodic Overdue Detection & Workload Escalation
const { db } = require('./database');
const { createNotification } = require('./notificationService');
const { logAudit } = require('./auditService');

function runOverdueAndEscalationCheck() {
  const higherOfficer = db.prepare("SELECT id FROM users WHERE role = 'HIGHER_OFFICER' LIMIT 1").get();
  const higherOfficerId = higherOfficer ? higherOfficer.id : null;

  // 1. Check Tasks where current time > effective deadline (authorized_extended_due_at OR target_due_at)
  // that are still active (not COMPLETED, CANCELLED, CLOSED)
  const overdueTasks = db.prepare(`
    SELECT t.*, u.name as assignee_name, u.email as assignee_email, a.application_no, a.institution_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    LEFT JOIN applications a ON t.application_id = a.id
    WHERE t.status IN ('ASSIGNED', 'IN_PROGRESS', 'AWAITING_SUBMISSION', 'RETURNED_FOR_CORRECTION')
      AND (
        (t.authorized_extended_due_at IS NOT NULL AND datetime('now') > datetime(t.authorized_extended_due_at))
        OR (t.authorized_extended_due_at IS NULL AND datetime('now') > datetime(t.target_due_at))
      )
  `).all();

  for (const task of overdueTasks) {
    if (!task.is_overdue || !task.is_escalated) {
      // Mark as overdue and escalated
      db.prepare(`
        UPDATE tasks 
        SET is_overdue = 1, is_escalated = 1, escalation_reason = 'Task exceeded target deadline',
            escalated_at = COALESCE(escalated_at, datetime('now')),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(task.id);

      // Notify Assignee
      if (task.assignee_id) {
        createNotification({
          recipientId: task.assignee_id,
          eventType: 'TASK_OVERDUE',
          title: `Overdue Warning: Task ${task.task_number}`,
          message: `Your assigned task ${task.task_number} (${task.task_type}) for ${task.application_no} is now overdue. Please expedite submission.`,
          relatedEntityType: 'TASK',
          relatedEntityId: task.id,
          isReminder: 1
        });
      }

      // Notify Higher-Level Officer for escalation
      if (higherOfficerId) {
        createNotification({
          recipientId: higherOfficerId,
          eventType: 'TASK_ESCALATED',
          title: `Escalation: Task ${task.task_number} Overdue`,
          message: `Task ${task.task_number} (${task.task_type}) assigned to ${task.assignee_name || 'Unassigned'} has exceeded its deadline. Review for potential reassignment.`,
          relatedEntityType: 'TASK',
          relatedEntityId: task.id,
          isReminder: 1
        });
      }

      logAudit({
        eventType: 'TASK_OVERDUE_ESCALATED',
        entityType: 'TASK',
        entityId: task.id,
        actorId: 'SYSTEM',
        actorName: 'Escalation Daemon',
        actorRole: 'SYSTEM',
        reason: 'Target deadline exceeded by active task'
      });
    }
  }

  // 2. Check Overdue Clarification Requests
  const overdueClarifications = db.prepare(`
    SELECT c.*, a.application_no, a.institution_id
    FROM clarification_requests c
    JOIN applications a ON c.application_id = a.id
    WHERE c.status = 'OPEN' AND datetime('now') > datetime(c.target_deadline)
  `).all();

  for (const cr of overdueClarifications) {
    db.prepare(`
      UPDATE clarification_requests 
      SET status = 'OVERDUE' 
      WHERE id = ?
    `).run(cr.id);

    // Alert Institution
    createNotification({
      recipientId: cr.institution_id,
      eventType: 'CLARIFICATION_OVERDUE',
      title: `Urgent: Clarification Response Overdue (${cr.application_no})`,
      message: `The deadline to submit clarification for ${cr.application_no} has passed. Please submit required documentation immediately to avoid processing hold.`,
      relatedEntityType: 'CLARIFICATION',
      relatedEntityId: cr.id,
      isReminder: 1
    });

    // Alert Reviewing Officer
    createNotification({
      recipientId: cr.requested_by,
      eventType: 'CLARIFICATION_OVERDUE_OFFICER',
      title: `Clarification Overdue: ${cr.application_no}`,
      message: `Institution response deadline for clarification on application ${cr.application_no} has lapsed.`,
      relatedEntityType: 'CLARIFICATION',
      relatedEntityId: cr.id,
      isReminder: 1
    });
  }

  return {
    overdueTasksDetected: overdueTasks.length,
    overdueClarificationsDetected: overdueClarifications.length
  };
}

module.exports = { runOverdueAndEscalationCheck };
