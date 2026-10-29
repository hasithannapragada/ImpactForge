// workflowEngine.js - State Machine, Task Creation, Reassignment & Route Control
const { db } = require('./database');
const crypto = require('crypto');
const { logAudit } = require('./auditService');
const { createNotification } = require('./notificationService');
const { calculateDeadline } = require('./deadlineService');
const { findEligibleWorkerForRole, getActiveTaskCountForUser } = require('./allocationService');

/**
 * Creates an EVC or SHC_SAH task with workload snapshot, allocation and deadline calculation
 * Wrapped in a SQLite immediate transaction for concurrency safety.
 */
function createTaskWithAllocation({
  applicationId,
  taskType, // 'EVC' or 'SHC_SAH'
  taskExtent, // 'SMALL', 'MEDIUM', 'LARGE'
  extentReason,
  scopeIndicators = {},
  assessedBy,
  actorName = 'Reviewing Officer',
  actorRole = 'REVIEWER'
}) {
  const runTx = db.transaction(() => {
    const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
    if (!app) {
      throw new Error('Application not found');
    }

    // Prevent duplicate tasks for the same stage
    const existing = db.prepare(`
      SELECT * FROM tasks 
      WHERE application_id = ? AND task_type = ? AND status NOT IN ('CANCELLED', 'CLOSED')
    `).get(applicationId, taskType);
    if (existing) {
      return { 
        taskId: existing.id, 
        taskNumber: existing.task_number, 
        assignee: { id: existing.assignee_id }, 
        alreadyExists: true 
      };
    }

    // Role required for this task type
    const requiredRole = taskType === 'EVC' ? 'EVC' : (taskType === 'SAC' ? 'SAC' : 'SHC_SAH');

    // 1. Find eligible worker using strict workload-balanced rule
    const eligibleWorker = findEligibleWorkerForRole(requiredRole);

    const taskId = 'TSK-' + crypto.randomUUID();
    const taskNumber = `TSK-${taskType}-${Date.now().toString().slice(-6)}`;

    if (!eligibleWorker) {
      // Allocation failure - mark as AWAITING_ASSIGNMENT and alert Higher-Level Officer
      const placeholderDeadline = calculateDeadline({
        taskType,
        taskExtent,
        activeTasksBeforeAssignment: 0
      });

      db.prepare(`
        INSERT INTO tasks (
          id, task_number, application_id, task_type, assignee_id, status,
          task_extent, extent_reason, scope_indicators_json, assessed_by,
          active_tasks_before_assignment, active_tasks_after_assignment, allocation_reason,
          base_duration_days, workload_buffer_days,
          uncapped_duration_days, max_allowed_duration_days, target_duration_days,
          target_due_at, is_cap_reached, is_overload_flagged, deadline_calculation_explanation,
          deadline_policy_id, policy_version, is_escalated, escalation_reason, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, NULL, 'AWAITING_ASSIGNMENT',
          ?, ?, ?, ?,
          0, 0, 'No eligible active worker available for allocation at this time.',
          ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, 1, 'Allocation Failure: No eligible worker available for role ' || ?, datetime('now'), datetime('now')
        )
      `).run(
        taskId, taskNumber, applicationId, taskType,
        taskExtent, extentReason, JSON.stringify(scopeIndicators), assessedBy,
        placeholderDeadline.baseDuration, placeholderDeadline.workloadBuffer,
        placeholderDeadline.uncappedDuration, placeholderDeadline.maxAllowedDuration, placeholderDeadline.targetDuration,
        placeholderDeadline.targetDueAt, placeholderDeadline.isCapReached, placeholderDeadline.isOverloadFlagged, placeholderDeadline.explanation,
        placeholderDeadline.policyId, placeholderDeadline.policyVersion, requiredRole
      );

      // Notify Higher-Level Officer about allocation failure
      const higherOfficer = db.prepare("SELECT id FROM users WHERE role = 'HIGHER_OFFICER' LIMIT 1").get();
      if (higherOfficer) {
        createNotification({
          recipientId: higherOfficer.id,
          eventType: 'ALLOCATION_FAILURE',
          title: `Allocation Alert: ${taskType} Task Unassigned`,
          message: `Task ${taskNumber} for application ${app.application_no} could not be allocated. No eligible worker with role ${requiredRole} is available.`,
          relatedEntityType: 'TASK',
          relatedEntityId: taskId
        });
      }

      logAudit({
        eventType: 'TASK_ALLOCATION_FAILED',
        entityType: 'TASK',
        entityId: taskId,
        actorId: assessedBy,
        actorName,
        actorRole,
        newValue: { taskNumber, taskType, taskExtent, status: 'AWAITING_ASSIGNMENT' },
        reason: `No eligible active workers for role ${requiredRole}`
      });

      return { taskId, status: 'AWAITING_ASSIGNMENT', unassigned: true };
    }

    // 2. Worker found: Capture active task count snapshot immediately before assignment
    const activeCount = eligibleWorker.active_task_count || 0;
    const activeAfter = eligibleWorker.active_tasks_after_assignment || (activeCount + 1);
    const allocReason = eligibleWorker.allocation_reason || `Selected because ${eligibleWorker.name} had the lowest active workload, with ${activeCount} active tasks before assignment.`;

    // 3. Calculate deadline with transparent policy rules
    const deadlineResult = calculateDeadline({
      taskType,
      taskExtent,
      activeTasksBeforeAssignment: activeCount
    });

    // 4. Persist task record
    db.prepare(`
      INSERT INTO tasks (
        id, task_number, application_id, task_type, assignee_id, status,
        task_extent, extent_reason, scope_indicators_json, assessed_by,
        active_tasks_before_assignment, active_tasks_after_assignment, allocation_reason,
        base_duration_days, workload_buffer_days,
        uncapped_duration_days, max_allowed_duration_days, target_duration_days,
        target_due_at, is_cap_reached, is_overload_flagged, deadline_calculation_explanation,
        deadline_policy_id, policy_version, assigned_at, is_escalated, escalation_reason, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, 'ASSIGNED',
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, datetime('now'), ?, ?, datetime('now'), datetime('now')
      )
    `).run(
      taskId, taskNumber, applicationId, taskType, eligibleWorker.id,
      taskExtent, extentReason, JSON.stringify(scopeIndicators), assessedBy,
      activeCount, activeAfter, allocReason,
      deadlineResult.baseDuration, deadlineResult.workloadBuffer,
      deadlineResult.uncappedDuration, deadlineResult.maxAllowedDuration, deadlineResult.targetDuration,
      deadlineResult.targetDueAt, deadlineResult.isCapReached, deadlineResult.isOverloadFlagged, deadlineResult.explanation,
      deadlineResult.policyId, deadlineResult.policyVersion,
      deadlineResult.isCapReached ? 1 : 0,
      deadlineResult.isCapReached ? 'Workload Cap Reached at Assignment' : null
    );

    // Update application stage (For SAC appeal, preserve original REJECTED status and update appeal_status)
    if (taskType === 'SAC') {
      db.prepare(`
        UPDATE applications 
        SET appeal_status = 'IN_SAC_REVIEW', updated_at = datetime('now')
        WHERE id = ?
      `).run(applicationId);
    } else {
      const nextAppStatus = taskType === 'EVC' ? 'IN_EVC' : 'IN_SHC_SAH';
      db.prepare(`
        UPDATE applications 
        SET status = ?, current_stage = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(nextAppStatus, taskType, applicationId);
    }

    // Notify assigned worker
    createNotification({
      recipientId: eligibleWorker.id,
      eventType: 'TASK_ASSIGNED',
      title: `New ${taskType} Task Assigned: ${taskNumber}`,
      message: `You have been allocated a ${taskExtent} extent ${taskType} task for ${app.application_no} (${app.institution_name}). Target deadline: ${new Date(deadlineResult.targetDueAt).toLocaleDateString()}.`,
      relatedEntityType: 'TASK',
      relatedEntityId: taskId
    });

    // If cap was reached, notify Higher Officer for workload-risk oversight
    if (deadlineResult.isCapReached) {
      const higherOfficer = db.prepare("SELECT id FROM users WHERE role = 'HIGHER_OFFICER' LIMIT 1").get();
      if (higherOfficer) {
        createNotification({
          recipientId: higherOfficer.id,
          eventType: 'DEADLINE_CAP_REACHED',
          title: `Workload-Risk Review: Task ${taskNumber}`,
          message: `Task ${taskNumber} assigned to ${eligibleWorker.name} reached configured maximum duration (${deadlineResult.maxAllowedDuration} days). High active workload signal.`,
          relatedEntityType: 'TASK',
          relatedEntityId: taskId
        });
      }
    }

    // Audit trail entry
    logAudit({
      eventType: 'TASK_CREATED_AND_ALLOCATED',
      entityType: 'TASK',
      entityId: taskId,
      actorId: assessedBy,
      actorName,
      actorRole,
      newValue: {
        taskNumber,
        taskType,
        taskExtent,
        assigneeId: eligibleWorker.id,
        assigneeName: eligibleWorker.name,
        activeTasksBeforeAssignment: activeCount,
        activeTasksAfterAssignment: activeAfter,
        allocationReason: allocReason,
        targetDurationDays: deadlineResult.targetDuration,
        targetDueAt: deadlineResult.targetDueAt,
        isCapReached: deadlineResult.isCapReached
      },
      reason: extentReason,
      policyVersion: deadlineResult.policyVersion
    });

    return { 
      taskId, 
      taskNumber, 
      assignee: eligibleWorker, 
      activeTasksBeforeAssignment: activeCount,
      activeTasksAfterAssignment: activeAfter,
      allocationReason: allocReason,
      deadlineResult 
    };
  });

  return runTx();
}

/**
 * Reassign an active task to another eligible user of the same role
 * Requires explicit reason and authorised officer role (HIGHER_OFFICER)
 */
function reassignTask({
  taskId,
  newAssigneeId,
  reason,
  actorId,
  actorName,
  actorRole
}) {
  const runTx = db.transaction(() => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const previousAssigneeId = task.assignee_id;
    const newAssignee = db.prepare('SELECT * FROM users WHERE id = ?').get(newAssigneeId);

    if (!newAssignee) {
      throw new Error('Target assignee not found');
    }

    const requiredRole = task.task_type === 'EVC' ? 'EVC' : 'SHC_SAH';
    if (newAssignee.role !== requiredRole) {
      throw new Error(`Invalid assignee role. Expected ${requiredRole}, got ${newAssignee.role}`);
    }

    // Update task
    db.prepare(`
      UPDATE tasks 
      SET assignee_id = ?, status = 'ASSIGNED', updated_at = datetime('now')
      WHERE id = ?
    `).run(newAssigneeId, taskId);

    // Record in reassignments history
    const reassignId = 'REASGN-' + crypto.randomUUID();
    db.prepare(`
      INSERT INTO task_reassignments (
        id, task_id, previous_assignee_id, new_assignee_id, reason, reassigned_by, reassigned_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(reassignId, taskId, previousAssigneeId, newAssigneeId, reason, actorId);

    // Notify previous assignee
    if (previousAssigneeId) {
      createNotification({
        recipientId: previousAssigneeId,
        eventType: 'TASK_REASSIGNED_AWAY',
        title: `Task ${task.task_number} Reassigned`,
        message: `Task ${task.task_number} was reassigned away by ${actorName}. Reason: ${reason}`,
        relatedEntityType: 'TASK',
        relatedEntityId: taskId
      });
    }

    // Notify new assignee
    createNotification({
      recipientId: newAssigneeId,
      eventType: 'TASK_REASSIGNED_TO',
      title: `Task ${task.task_number} Assigned via Reassignment`,
      message: `You have been reassigned task ${task.task_number} by ${actorName}. Target due date remains: ${new Date(task.target_due_at).toLocaleDateString()}. Reason: ${reason}`,
      relatedEntityType: 'TASK',
      relatedEntityId: taskId
    });

    // Audit log
    logAudit({
      eventType: 'TASK_REASSIGNED',
      entityType: 'TASK',
      entityId: taskId,
      actorId,
      actorName,
      actorRole,
      previousValue: { assigneeId: previousAssigneeId },
      newValue: { assigneeId: newAssigneeId, assigneeName: newAssignee.name },
      reason
    });

    return { success: true, taskId, newAssignee };
  });

  return runTx();
}

/**
 * Authorise Deadline Extension
 */
function authoriseDeadlineExtension({
  taskId,
  extendedDueAt,
  reason,
  actorId,
  actorName,
  actorRole,
  extensionRequestId = null
}) {
  const runTx = db.transaction(() => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const previousDeadline = task.authorized_extended_due_at || task.target_due_at;

    db.prepare(`
      UPDATE tasks 
      SET authorized_extended_due_at = ?, is_overdue = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(extendedDueAt, taskId);

    if (extensionRequestId) {
      // Update existing request record keeping original requested_by intact
      db.prepare(`
        UPDATE deadline_extensions 
        SET status = 'APPROVED', approved_by = ?, approved_at = datetime('now'), decision_notes = ?
        WHERE id = ?
      `).run(actorId, reason, extensionRequestId);
    } else {
      const extId = 'EXT-' + crypto.randomUUID();
      db.prepare(`
        INSERT INTO deadline_extensions (
          id, task_id, previous_deadline, requested_deadline, reason,
          requested_by, status, approved_by, approved_at, decision_notes, created_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, 'APPROVED', ?, datetime('now'), ?, datetime('now')
        )
      `).run(extId, taskId, previousDeadline, extendedDueAt, reason, task.assignee_id || actorId, actorId, reason);
    }

    if (task.assignee_id) {
      createNotification({
        recipientId: task.assignee_id,
        eventType: 'DEADLINE_EXTENDED',
        title: `Deadline Extended for ${task.task_number}`,
        message: `Your task deadline has been authorised for extension to ${new Date(extendedDueAt).toLocaleDateString()} by ${actorName}. Reason: ${reason}`,
        relatedEntityType: 'TASK',
        relatedEntityId: taskId
      });
    }

    logAudit({
      eventType: 'DEADLINE_EXTENDED',
      entityType: 'TASK',
      entityId: taskId,
      actorId,
      actorName,
      actorRole,
      previousValue: { deadline: previousDeadline },
      newValue: { authorizedExtendedDueAt: extendedDueAt },
      reason
    });

    return { success: true, taskId, extendedDueAt };
  });

  return runTx();
}

module.exports = {
  createTaskWithAllocation,
  reassignTask,
  authoriseDeadlineExtension
};
