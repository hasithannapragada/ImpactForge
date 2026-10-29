// allocationService.js - Deterministic Workload-Balanced Allocation
const { db } = require('./database');

/**
 * Returns the count of active tasks currently assigned to an officer.
 * Excludes completed, cancelled, and closed tasks.
 */
function getActiveTaskCountForUser(userId) {
  const result = db.prepare(`
    SELECT COUNT(*) as count 
    FROM tasks 
    WHERE assignee_id = ? 
      AND status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED')
  `).get(userId);

  return result ? result.count : 0;
}

/**
 * Finds the eligible officer for a given profile role with lowest active workload.
 * Role: 'EVC' or 'SHC_SAH'
 * Strict rule:
 * 1. Must have exact required role.
 * 2. Must be is_available = 1 and is_active = 1.
 * 3. User with the lowest active task count is selected (excluding COMPLETED, CANCELLED, CLOSED).
 * 4. Tie-breaker: oldest last task assignment date.
 * 5. Deterministic tie-breaker: user ID ascending.
 *
 * NOTE: Experience, expertise, performance scores, or inferred skills are strictly excluded.
 */
function findEligibleWorkerForRole(role) {
  // Candidate pool with live active task counts from database
  const candidates = db.prepare(`
    SELECT u.id, u.name, u.email, u.role,
      (
        SELECT COUNT(*) FROM tasks t 
        WHERE t.assignee_id = u.id 
          AND t.status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED')
      ) as active_task_count,
      (
        SELECT MAX(assigned_at) FROM tasks t2 
        WHERE t2.assignee_id = u.id
      ) as last_assigned_at
    FROM users u
    WHERE u.role = ? 
      AND u.is_available = 1 
      AND u.is_active = 1
    ORDER BY 
      active_task_count ASC,
      last_assigned_at ASC,
      u.id ASC
  `).all(role);

  if (!candidates || candidates.length === 0) {
    return null;
  }

  const selected = candidates[0];
  const activeBefore = selected.active_task_count;
  const activeAfter = activeBefore + 1;

  // Generate transparent allocation reason from actual database records
  let peerBreakdown = '';
  if (candidates.length > 1) {
    const peers = candidates.slice(1).map(c => `${c.name}: ${c.active_task_count} active`).join(', ');
    peerBreakdown = ` (Eligible pool: ${selected.name}: ${activeBefore} active, ${peers})`;
  }

  const reason = `Selected because ${selected.name} had the lowest active workload, with ${activeBefore} active task${activeBefore === 1 ? '' : 's'} before assignment (now ${activeAfter} active tasks).${peerBreakdown}`;

  return {
    ...selected,
    active_tasks_before_assignment: activeBefore,
    active_tasks_after_assignment: activeAfter,
    allocation_reason: reason
  };
}

/**
 * Get workload overview for all officers of a role (or all roles)
 */
function getWorkloadSnapshot(role = null) {
  let query = `
    SELECT u.id, u.name, u.email, u.role, u.is_available,
      COUNT(CASE WHEN t.status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED') THEN 1 END) as active_task_count,
      COUNT(CASE WHEN t.status = 'COMPLETED' THEN 1 END) as completed_task_count,
      COUNT(CASE WHEN t.is_overdue = 1 AND t.status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED') THEN 1 END) as overdue_task_count,
      COUNT(CASE WHEN t.is_cap_reached = 1 AND t.status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED') THEN 1 END) as cap_reached_count
    FROM users u
    LEFT JOIN tasks t ON t.assignee_id = u.id
    WHERE u.role IN ('EVC', 'SHC_SAH', 'REVIEWER', 'SAC')
  `;

  if (role) {
    query += ` AND u.role = '${role}'`;
  }

  query += ` GROUP BY u.id, u.name, u.email, u.role, u.is_available ORDER BY u.role, active_task_count DESC`;

  return db.prepare(query).all();
}

module.exports = {
  getActiveTaskCountForUser,
  findEligibleWorkerForRole,
  getWorkloadSnapshot
};
