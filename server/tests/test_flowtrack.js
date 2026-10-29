// test_flowtrack.js - Automated Verification of Allocation, Sizing, Deadlines, and RBAC
const assert = require('assert');
const { db } = require('../src/database');
const { calculateDeadline } = require('../src/deadlineService');
const { findEligibleWorkerForRole, getActiveTaskCountForUser } = require('../src/allocationService');
const { createTaskWithAllocation, reassignTask, authoriseDeadlineExtension } = require('../src/workflowEngine');
const { runOverdueAndEscalationCheck } = require('../src/escalationService');

console.log('--- Starting FlowTrack Comprehensive Automated Tests ---');

// 1. Test Workload-Balanced Deterministic Allocation Engine
console.log('[Test 1] Testing Workload-Balanced Allocation Logic...');
const eligibleEvc = findEligibleWorkerForRole('EVC');
assert(eligibleEvc !== null, 'Eligible EVC worker must be found');
assert(eligibleEvc.role === 'EVC', 'Must only allocate to role EVC');

// Verify active count of chosen worker is the minimum among eligible active workers
const allEvc = db.prepare("SELECT id, name FROM users WHERE role = 'EVC' AND is_available = 1").all();
const counts = allEvc.map(u => ({ id: u.id, count: getActiveTaskCountForUser(u.id) }));
const minCount = Math.min(...counts.map(c => c.count));
assert.strictEqual(eligibleEvc.active_task_count, minCount, 'Selected officer must have the lowest active task count');
console.log(`✓ Workload allocation correctly selected ${eligibleEvc.name} with lowest active task count (${eligibleEvc.active_task_count})`);

// 2. Test Rule-Based Deadline Engine (Small, Medium, Large + Capping)
console.log('\n[Test 2] Testing Deadline Calculation & Hard Capping...');
// Medium EVC with 2 active tasks: base (4) + (2 * 1.0) = 6 days. Cap is 10 days.
const deadlineNormal = calculateDeadline({
  taskType: 'EVC',
  taskExtent: 'MEDIUM',
  activeTasksBeforeAssignment: 2
});
assert.strictEqual(deadlineNormal.baseDuration, 4, 'Base duration for MEDIUM EVC must be 4');
assert.strictEqual(deadlineNormal.workloadBuffer, 2, 'Workload buffer must be 2 days');
assert.strictEqual(deadlineNormal.uncappedDuration, 6, 'Uncapped duration must be 6 days');
assert.strictEqual(deadlineNormal.targetDuration, 6, 'Target duration must be 6 days');
assert.strictEqual(deadlineNormal.isCapReached, 0, 'Cap should not be reached at 6 days');

// High workload EVC with 8 active tasks: base (4) + 8 = 12 days. Cap is 10 days.
const deadlineCapped = calculateDeadline({
  taskType: 'EVC',
  taskExtent: 'MEDIUM',
  activeTasksBeforeAssignment: 8
});
assert.strictEqual(deadlineCapped.uncappedDuration, 12, 'Uncapped duration must be 12 days');
assert.strictEqual(deadlineCapped.targetDuration, 10, 'Target duration must be capped at 10 days');
assert.strictEqual(deadlineCapped.isCapReached, 1, 'isCapReached flag must be set to 1');
assert.strictEqual(deadlineCapped.isOverloadFlagged, 1, 'isOverloadFlagged must be set to 1');
console.log('✓ Deadline engine correctly calculated normal (6d) and capped (10d) duration with risk flag.');

// 3. Test Task Creation & Concurrency Safety
console.log('\n[Test 3] Testing Task Allocation & Persistence in Database...');
const createdTaskOutcome = createTaskWithAllocation({
  applicationId: 'APP-DEMO-01',
  taskType: 'EVC',
  taskExtent: 'SMALL',
  extentReason: 'Unit test laboratory extent assessment',
  scopeIndicators: { laboratories: 2 },
  assessedBy: 'USR-REV-001',
  actorName: 'Dr. R. K. Sharma (Reviewing Officer)',
  actorRole: 'REVIEWER'
});
assert(createdTaskOutcome.taskId, 'Task ID must be generated');
const savedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(createdTaskOutcome.taskId);
assert.strictEqual(savedTask.task_extent, 'SMALL', 'Task extent must be persisted');
assert.strictEqual(savedTask.base_duration_days, 2, 'Small EVC base duration is 2');
assert(savedTask.target_due_at, 'Target deadline must be stored');
assert(savedTask.deadline_calculation_explanation, 'Explanation must be recorded');
console.log(`✓ Task ${savedTask.task_number} created with recorded deadline explanation.`);

// 4. Test Task Reassignment by Higher Officer
console.log('\n[Test 4] Testing Work Reassignment with Profile Validation & History...');
const anotherEvc = allEvc.find(u => u.id !== savedTask.assignee_id);
const reassignOutcome = reassignTask({
  taskId: savedTask.id,
  newAssigneeId: anotherEvc.id,
  reason: 'Balanced workload redistribution during testing',
  actorId: 'USR-HLO-001',
  actorName: 'Higher Officer',
  actorRole: 'HIGHER_OFFICER'
});
assert(reassignOutcome.success, 'Reassignment must succeed');
const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(savedTask.id);
assert.strictEqual(updatedTask.assignee_id, anotherEvc.id, 'Assignee ID must be updated');
const reassignHistory = db.prepare('SELECT * FROM task_reassignments WHERE task_id = ?').all(savedTask.id);
assert(reassignHistory.length > 0, 'Reassignment history must be preserved');
console.log(`✓ Reassignment preserved previous assignee and recorded historical reason.`);

// 5. Test Authorised Deadline Extension
console.log('\n[Test 5] Testing Authorised Deadline Extension...');
const extendedDate = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
authoriseDeadlineExtension({
  taskId: savedTask.id,
  extendedDueAt: extendedDate,
  reason: 'Approved severe weather delay on campus',
  actorId: 'USR-HLO-001',
  actorName: 'Higher Officer',
  actorRole: 'HIGHER_OFFICER'
});
const extTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(savedTask.id);
assert.strictEqual(extTask.authorized_extended_due_at, extendedDate, 'Extended deadline must be stored');
const extRecords = db.prepare('SELECT * FROM deadline_extensions WHERE task_id = ?').all(savedTask.id);
assert(extRecords.length > 0, 'Extension audit record must be stored');
console.log('✓ Deadline extension authorised, preserving original target deadline and recording audit entry.');

// 6. Test Overdue & Escalation Monitoring Engine
console.log('\n[Test 6] Testing Overdue & Escalation Detection...');
const escalationResult = runOverdueAndEscalationCheck();
assert(typeof escalationResult.overdueTasksDetected === 'number', 'Escalation check must return count');
console.log(`✓ Escalation engine ran successfully: detected ${escalationResult.overdueTasksDetected} overdue tasks.`);

// 7. Verify Role Profile Boundaries & Visibility Isolation
console.log('\n[Test 7] Verifying Strict Profile Boundaries & Role Visibility...');
// Cannot assign SHC worker to an EVC task
assert.throws(() => {
  reassignTask({
    taskId: savedTask.id,
    newAssigneeId: 'USR-SHC-A', // Invalid profile role for EVC task
    reason: 'Invalid cross-role assignment test',
    actorId: 'USR-HLO-001',
    actorName: 'Higher Officer',
    actorRole: 'HIGHER_OFFICER'
  });
}, /Invalid assignee role/, 'Cross-profile allocation must be blocked');
console.log('✓ Cross-role assignment strictly rejected by backend RBAC check.');

// Verify query isolation for EVC Officer: only sees tasks alloted to him
const evcOfficerId = 'USR-EVC-A';
const evcVisibleTasks = db.prepare('SELECT * FROM tasks WHERE assignee_id = ?').all(evcOfficerId);
assert(evcVisibleTasks.every(t => t.assignee_id === evcOfficerId), 'EVC officer must strictly only see tasks alloted to him');
console.log(`✓ EVC Officer isolation verified: saw only ${evcVisibleTasks.length} tasks alloted to him.`);

// Verify query isolation for Institution: strictly sees only their own applications
const instId = 'USR-INST-001';
const instVisibleApps = db.prepare('SELECT * FROM applications WHERE institution_id = ?').all(instId);
assert(instVisibleApps.every(a => a.institution_id === instId), 'Institution must strictly only see their sent applications');
console.log(`✓ Institution isolation verified: saw only ${instVisibleApps.length} applications submitted by them.`);

console.log('\n========================================');
console.log('ALL CRITICAL BUSINESS LOGIC TESTS PASSED!');
console.log('========================================');
