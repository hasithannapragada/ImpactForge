// deadlineService.js - Rule-Based Deadline Engine
const { db } = require('./database');

function getPolicyForTaskType(taskType) {
  const policy = db.prepare(`
    SELECT * FROM deadline_policies 
    WHERE task_type = ? AND is_active = 1 
    ORDER BY version DESC 
    LIMIT 1
  `).get(taskType);

  if (!policy) {
    throw new Error(`No active deadline policy found for task type: ${taskType}`);
  }
  return policy;
}

function calculateDeadline({
  taskType,
  taskExtent, // 'SMALL', 'MEDIUM', 'LARGE'
  activeTasksBeforeAssignment,
  assignmentTimestamp = new Date()
}) {
  const policy = getPolicyForTaskType(taskType);
  const normalizedExtent = (taskExtent || 'MEDIUM').toUpperCase();

  let baseDuration;
  if (normalizedExtent === 'SMALL') {
    baseDuration = policy.base_duration_small;
  } else if (normalizedExtent === 'LARGE') {
    baseDuration = policy.base_duration_large;
  } else {
    baseDuration = policy.base_duration_medium;
  }

  const workloadBuffer = activeTasksBeforeAssignment * policy.workload_buffer_per_task;
  const uncappedDuration = baseDuration + workloadBuffer;
  const maxAllowedDuration = policy.max_allowed_duration;

  // Final target duration capped by policy limit
  const targetDuration = Math.min(uncappedDuration, maxAllowedDuration);
  const isCapReached = uncappedDuration >= maxAllowedDuration ? 1 : 0;
  const isOverloadFlagged = isCapReached;

  // Calculate target due date
  const targetDueAt = new Date(assignmentTimestamp.getTime() + targetDuration * 24 * 60 * 60 * 1000);

  const explanation = `Base extent duration for ${normalizedExtent} is ${baseDuration} days. ` +
    `Assignee currently has ${activeTasksBeforeAssignment} active tasks, adding ${workloadBuffer} days buffer ` +
    `(${policy.workload_buffer_per_task} day/task). Calculated duration: ${uncappedDuration} days. ` +
    `Configured policy maximum completion cap is ${maxAllowedDuration} days. ` +
    (isCapReached 
      ? `[CAP REACHED & RISK FLAGGED] Target duration capped at ${maxAllowedDuration} days.` 
      : `Target duration set to ${targetDuration} days.`);

  return {
    policyId: policy.id,
    policyVersion: policy.version,
    baseDuration,
    workloadBuffer,
    uncappedDuration,
    maxAllowedDuration,
    targetDuration,
    targetDueAt: targetDueAt.toISOString(),
    isCapReached,
    isOverloadFlagged,
    explanation
  };
}

module.exports = {
  getPolicyForTaskType,
  calculateDeadline
};
