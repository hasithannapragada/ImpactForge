// database.js - AICTE FlowTrack SQLite Persistence Layer
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../data/flowtrack.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    -- 1. Users and Profiles
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('INSTITUTION', 'REVIEWER', 'EVC', 'SHC_SAH', 'HIGHER_OFFICER')),
      organization TEXT,
      phone TEXT,
      is_available INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. Workflow Routes Definition
    CREATE TABLE IF NOT EXISTS workflow_routes (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      stages_json TEXT NOT NULL, -- JSON array of stage codes in sequence e.g. ["SCRUTINY", "EVC", "FINAL_REVIEW"]
      is_active INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 3. Applications
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      application_no TEXT UNIQUE NOT NULL,
      institution_id TEXT NOT NULL,
      institution_name TEXT NOT NULL,
      institution_type TEXT NOT NULL, -- Technical, Engineering, Pharmacy, Management, Architecture
      program_type TEXT NOT NULL,     -- UG, PG, Diploma
      academic_year TEXT NOT NULL,
      address TEXT NOT NULL,
      state TEXT NOT NULL,
      district TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN (
        'DRAFT',
        'SUBMITTED',
        'UNDER_DOCUMENT_REVIEW',
        'UNDER_REVIEW',
        'AWAITING_CLARIFICATION',
        'CLARIFICATION_SUBMITTED',
        'ROUTE_ASSIGNED',
        'IN_EVC',
        'IN_SHC_SAH',
        'STAGES_COMPLETED',
        'READY_FOR_FINAL_REVIEW',
        'APPROVED',
        'REJECTED',
        'RETURNED_FOR_FURTHER_INFO'
      )),
      assigned_route_id TEXT,
      route_selection_reason TEXT,
      route_selected_by TEXT,
      route_selected_at TEXT,
      route_version INTEGER DEFAULT 1,
      current_stage TEXT NOT NULL DEFAULT 'SUBMISSION',
      completeness_status TEXT NOT NULL DEFAULT 'PENDING',
      completeness_notes TEXT,
      submitted_at TEXT,
      final_decision TEXT,
      final_decision_reason TEXT,
      final_decision_by TEXT,
      final_decision_at TEXT,
      is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (institution_id) REFERENCES users(id),
      FOREIGN KEY (assigned_route_id) REFERENCES workflow_routes(id)
    );

    -- 4. Application Documents
    CREATE TABLE IF NOT EXISTS application_documents (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      document_category TEXT NOT NULL, -- 'LAND_TITLE', 'AFFIDAVIT_ND', 'FIRE_SAFETY', 'BUILDING_PLAN', 'FACULTY_LIST', 'FINANCIAL_AUDIT'
      document_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CORRECTION_REQUIRED', 'MISSING')),
      review_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      is_clarification_upload INTEGER NOT NULL DEFAULT 0,
      clarification_request_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (application_id) REFERENCES applications(id)
    );

    -- 5. Clarification Requests & Responses
    CREATE TABLE IF NOT EXISTS clarification_requests (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      request_details TEXT NOT NULL,
      specific_documents_required TEXT,
      requested_by TEXT NOT NULL,
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      target_deadline TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'RESPONDED', 'RESOLVED', 'OVERDUE')),
      response_text TEXT,
      responded_at TEXT,
      responded_by TEXT,
      review_notes TEXT,
      reviewed_at TEXT,
      FOREIGN KEY (application_id) REFERENCES applications(id),
      FOREIGN KEY (requested_by) REFERENCES users(id)
    );

    -- 6. Deadline Policies
    CREATE TABLE IF NOT EXISTS deadline_policies (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL CHECK (task_type IN ('SCRUTINY', 'EVC', 'SHC_SAH', 'CLARIFICATION')),
      base_duration_small INTEGER NOT NULL,  -- e.g. 2 days
      base_duration_medium INTEGER NOT NULL, -- e.g. 4 days
      base_duration_large INTEGER NOT NULL,  -- e.g. 6 days
      workload_buffer_per_task REAL NOT NULL DEFAULT 1.0, -- buffer in days per active task
      max_allowed_duration INTEGER NOT NULL, -- Configured hard cap e.g. 10 days
      calendar_mode TEXT NOT NULL DEFAULT 'CALENDAR_DAYS' CHECK (calendar_mode IN ('CALENDAR_DAYS', 'BUSINESS_DAYS')),
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 7. Tasks (Allocation & Sizing)
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      task_number TEXT UNIQUE NOT NULL,
      application_id TEXT NOT NULL,
      task_type TEXT NOT NULL CHECK (task_type IN ('SCRUTINY', 'EVC', 'SHC_SAH')),
      assignee_id TEXT,
      status TEXT NOT NULL CHECK (status IN (
        'AWAITING_ASSIGNMENT',
        'ASSIGNED',
        'IN_PROGRESS',
        'AWAITING_SUBMISSION',
        'SUBMITTED',
        'RETURNED_FOR_CORRECTION',
        'COMPLETED',
        'CANCELLED',
        'CLOSED'
      )),
      task_extent TEXT NOT NULL CHECK (task_extent IN ('SMALL', 'MEDIUM', 'LARGE')),
      extent_reason TEXT NOT NULL,
      scope_indicators_json TEXT, -- scope parameters like locations, document counts, hearing needed
      assessed_by TEXT NOT NULL,
      assessed_at TEXT NOT NULL DEFAULT (datetime('now')),
      
      -- Deadline evidence persisted fields
      active_tasks_before_assignment INTEGER NOT NULL DEFAULT 0,
      base_duration_days INTEGER NOT NULL,
      workload_buffer_days REAL NOT NULL,
      uncapped_duration_days REAL NOT NULL,
      max_allowed_duration_days INTEGER NOT NULL,
      target_duration_days INTEGER NOT NULL,
      target_due_at TEXT NOT NULL,
      authorized_extended_due_at TEXT,
      is_cap_reached INTEGER NOT NULL DEFAULT 0,
      is_overload_flagged INTEGER NOT NULL DEFAULT 0,
      deadline_calculation_explanation TEXT NOT NULL,
      deadline_policy_id TEXT NOT NULL,
      policy_version INTEGER NOT NULL DEFAULT 1,

      -- Overdue and Escalation State
      is_overdue INTEGER NOT NULL DEFAULT 0,
      is_escalated INTEGER NOT NULL DEFAULT 0,
      escalation_reason TEXT,
      escalated_at TEXT,
      overdue_notified_at TEXT,

      assigned_at TEXT,
      completed_at TEXT,
      is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (application_id) REFERENCES applications(id),
      FOREIGN KEY (assignee_id) REFERENCES users(id),
      FOREIGN KEY (deadline_policy_id) REFERENCES deadline_policies(id)
    );

    -- 8. Task Reassignments History
    CREATE TABLE IF NOT EXISTS task_reassignments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      previous_assignee_id TEXT,
      new_assignee_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      reassigned_by TEXT NOT NULL,
      reassigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    -- 9. Deadline Extension Requests & Approvals
    CREATE TABLE IF NOT EXISTS deadline_extensions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      previous_deadline TEXT NOT NULL,
      requested_deadline TEXT NOT NULL,
      reason TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      approved_by TEXT,
      approved_at TEXT,
      decision_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    -- 10. Task Reports & Committee Records
    CREATE TABLE IF NOT EXISTS task_reports (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      report_type TEXT NOT NULL CHECK (report_type IN ('EVC_REPORT', 'SHC_SAH_RECORD')),
      scheduled_date TEXT,
      conducted_date TEXT,
      venue_mode TEXT, -- Physical, Online, Campus Inspection
      observations TEXT NOT NULL,
      deficiencies_noted TEXT,
      recommendation TEXT CHECK (recommendation IN ('RECOMMENDED', 'NOT_RECOMMENDED', 'RECOMMENDED_WITH_CONDITIONS', 'SEEK_FURTHER_HEARING')),
      report_data_json TEXT, -- detailed checklist items & indicators
      submitted_by TEXT NOT NULL,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      review_status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (review_status IN ('SUBMITTED', 'CORRECTION_REQUIRED', 'ACCEPTED')),
      review_feedback TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    -- 11. Notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      related_entity_type TEXT, -- 'APPLICATION', 'TASK', 'CLARIFICATION'
      related_entity_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_reminder INTEGER NOT NULL DEFAULT 0,
      delivery_channel TEXT NOT NULL DEFAULT 'IN_APP',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (recipient_id) REFERENCES users(id)
    );

    -- 12. Complete Append-Only Audit Trail
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT,
      actor_role TEXT,
      previous_value_json TEXT,
      new_value_json TEXT,
      reason TEXT,
      policy_version TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Ensure application stage assessment & submission date columns exist
  try { db.exec("ALTER TABLE applications ADD COLUMN evc_task_extent TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE applications ADD COLUMN evc_extent_reason TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE applications ADD COLUMN shc_task_extent TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE applications ADD COLUMN shc_extent_reason TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE applications ADD COLUMN stage_states_json TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE applications ADD COLUMN user_submission_date TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE applications ADD COLUMN appeal_status TEXT DEFAULT 'NONE';"); } catch (e) {}
  try { db.exec("ALTER TABLE applications ADD COLUMN reappeal_count INTEGER DEFAULT 0;"); } catch (e) {}

  // Ensure application_documents can link to an appeal
  try { db.exec("ALTER TABLE application_documents ADD COLUMN appeal_id TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE task_reports ADD COLUMN user_submission_date TEXT;"); } catch (e) {}

  // Ensure task allocation transparency columns exist
  try { db.exec("ALTER TABLE tasks ADD COLUMN active_tasks_after_assignment INTEGER;"); } catch (e) {}
  try { db.exec("ALTER TABLE tasks ADD COLUMN allocation_reason TEXT;"); } catch (e) {}

  // Create SAC Appeals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sac_appeals (
      id TEXT PRIMARY KEY,
      appeal_no TEXT UNIQUE NOT NULL,
      application_id TEXT NOT NULL,
      institution_id TEXT NOT NULL,
      original_decision TEXT NOT NULL DEFAULT 'REJECTED',
      original_decision_reason TEXT,
      appeal_grounds TEXT NOT NULL,
      user_appeal_date TEXT NOT NULL,
      supporting_documents_json TEXT,
      status TEXT NOT NULL CHECK (status IN ('SUBMITTED', 'ASSIGNED', 'UNDER_REVIEW', 'RECOMMENDED', 'DECIDED', 'CLOSED', 'REJECTED', 'RESUBMISSION_ALLOWED')) DEFAULT 'SUBMITTED',
      assigned_sac_id TEXT,
      task_id TEXT,
      sac_recommendation TEXT,
      sac_observations TEXT,
      user_review_date TEXT,
      reviewed_at TEXT,
      final_decision TEXT,
      final_decision_reason TEXT,
      final_decision_by TEXT,
      final_decision_at TEXT,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (application_id) REFERENCES applications(id),
      FOREIGN KEY (institution_id) REFERENCES users(id),
      FOREIGN KEY (assigned_sac_id) REFERENCES users(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );
  `);

  // Ensure active SAC deadline policy exists
  const existingSacPolicy = db.prepare("SELECT id FROM deadline_policies WHERE task_type = 'SAC'").get();
  if (!existingSacPolicy) {
    db.prepare(`
      INSERT INTO deadline_policies (
        id, task_type, base_duration_small, base_duration_medium, base_duration_large,
        workload_buffer_per_task, max_allowed_duration, calendar_mode, timezone, version, is_active
      ) VALUES (
        'POL-SAC-01', 'SAC', 3, 5, 7, 1.0, 10, 'CALENDAR_DAYS', 'Asia/Kolkata', 1, 1
      )
    `).run();
  }

  // Ensure demo SAC users exist
  const existingSacUser = db.prepare("SELECT id FROM users WHERE role = 'SAC' LIMIT 1").get();
  if (!existingSacUser) {
    const bcrypt = require('bcryptjs');
    const demoPasswordHash = bcrypt.hashSync('123456', 10);
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash, role, organization, phone, is_available, is_active, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)
    `);
    insertUser.run('USR-SAC-A', 'Prof. S. R. Singhania (SAC Chairman / Member A)', 'sac.a@flowtrack.demo', demoPasswordHash, 'SAC', 'Standing Appellate Committee Panel', '+91 9876543230');
    insertUser.run('USR-SAC-B', 'Dr. K. Anuradha (SAC Member B)', 'sac.b@flowtrack.demo', demoPasswordHash, 'SAC', 'Standing Appellate Committee Panel', '+91 9876543231');
  }

  console.log('Database schema verified successfully.');
}

initSchema();

module.exports = { db, initSchema };
