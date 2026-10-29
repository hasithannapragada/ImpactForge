// seedData.js - Synthetic Demo Accounts & Pre-seeded Application State
const { db } = require('./database');
const bcrypt = require('bcryptjs');

function seedDatabase() {
  console.log('Seeding synthetic demo accounts, policies, workflow routes, and sample applications...');

  // 1. Seed Deadline Policies
  const seedPolicies = [
    {
      id: 'POL-SCRUTINY-V1',
      task_type: 'SCRUTINY',
      base_duration_small: 2,
      base_duration_medium: 3,
      base_duration_large: 5,
      workload_buffer_per_task: 0.5,
      max_allowed_duration: 7,
      calendar_mode: 'CALENDAR_DAYS',
      version: 1
    },
    {
      id: 'POL-EVC-V1',
      task_type: 'EVC',
      base_duration_small: 2,
      base_duration_medium: 4,
      base_duration_large: 6,
      workload_buffer_per_task: 1.0,
      max_allowed_duration: 10,
      calendar_mode: 'CALENDAR_DAYS',
      version: 1
    },
    {
      id: 'POL-SHC-SAH-V1',
      task_type: 'SHC_SAH',
      base_duration_small: 3,
      base_duration_medium: 5,
      base_duration_large: 7,
      workload_buffer_per_task: 1.0,
      max_allowed_duration: 12,
      calendar_mode: 'CALENDAR_DAYS',
      version: 1
    },
    {
      id: 'POL-CLARIF-V1',
      task_type: 'CLARIFICATION',
      base_duration_small: 3,
      base_duration_medium: 5,
      base_duration_large: 7,
      workload_buffer_per_task: 0,
      max_allowed_duration: 10,
      calendar_mode: 'CALENDAR_DAYS',
      version: 1
    }
  ];

  const insertPolicy = db.prepare(`
    INSERT OR REPLACE INTO deadline_policies (
      id, task_type, base_duration_small, base_duration_medium, base_duration_large,
      workload_buffer_per_task, max_allowed_duration, calendar_mode, version, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  for (const pol of seedPolicies) {
    insertPolicy.run(
      pol.id, pol.task_type, pol.base_duration_small, pol.base_duration_medium, pol.base_duration_large,
      pol.workload_buffer_per_task, pol.max_allowed_duration, pol.calendar_mode, pol.version
    );
  }

  // 2. Seed Workflow Routes
  const seedRoutes = [
    {
      id: 'ROUTE-SCRUTINY-ONLY',
      code: 'R1-SCRUTINY',
      title: 'Only Scrutiny (Document Evaluation Only)',
      description: 'Streamlined approval for routine extension of approval / low-risk category with verified document records.',
      stages: ['SCRUTINY', 'FINAL_REVIEW']
    },
    {
      id: 'ROUTE-SCRUTINY-EVC',
      code: 'R2-SCRUTINY-EVC',
      title: 'Scrutiny + Expert Visit Committee (EVC)',
      description: 'Standard physical inspection pathway for new courses, capacity expansion, or campus verification.',
      stages: ['SCRUTINY', 'EVC', 'FINAL_REVIEW']
    },
    {
      id: 'ROUTE-EVC-SHC',
      code: 'R3-EVC-SHC-SAH',
      title: 'EVC + Standing Hearing Committee (SHC/SAH)',
      description: 'Comprehensive pathway for complex cases requiring physical campus inspection followed by formal committee hearing.',
      stages: ['SCRUTINY', 'EVC', 'SHC_SAH', 'FINAL_REVIEW']
    },
    {
      id: 'ROUTE-EVC-ONLY',
      code: 'R4-EVC-ONLY',
      title: 'Only EVC (Physical Site Visit Only)',
      description: 'Direct verification pathway where document pre-clearance is pre-established.',
      stages: ['EVC', 'FINAL_REVIEW']
    }
  ];

  const insertRoute = db.prepare(`
    INSERT OR REPLACE INTO workflow_routes (
      id, code, title, description, stages_json, is_active, version
    ) VALUES (?, ?, ?, ?, ?, 1, 1)
  `);

  for (const r of seedRoutes) {
    insertRoute.run(r.id, r.code, r.title, r.description, JSON.stringify(r.stages));
  }

  // 3. Seed Demo Users
  // Standard demo password for all accounts: "123456"
  const defaultHash = bcrypt.hashSync('123456', 10);

  const demoUsers = [
    // 3.1 Institution Users (3 distinct colleges)
    {
      id: 'USR-INST-001',
      name: 'Delhi Institute of Advanced Engineering (Demo)',
      email: 'institution@flowtrack.demo',
      role: 'INSTITUTION',
      organization: 'Apex Educational Trust',
      phone: '+91-9876543210'
    },
    {
      id: 'USR-INST-002',
      name: 'Mumbai Polytechnic & Management Academy',
      email: 'mumbai.poly@flowtrack.demo',
      role: 'INSTITUTION',
      organization: 'Sahyadri Knowledge Foundation',
      phone: '+91-9876543211'
    },
    {
      id: 'USR-INST-003',
      name: 'Bengaluru National College of Architecture',
      email: 'bengaluru.arch@flowtrack.demo',
      role: 'INSTITUTION',
      organization: 'Karnataka Heritage Society',
      phone: '+91-9876543212'
    },
    // 3.2 Reviewing Officer
    {
      id: 'USR-REV-001',
      name: 'Dr. R. K. Sharma (Reviewing Officer)',
      email: 'reviewer@flowtrack.demo',
      role: 'REVIEWER',
      organization: 'AICTE Regional Office North',
      phone: '+91-9811122334'
    },
    // 3.3 Four EVC Personnel
    {
      id: 'USR-EVC-A',
      name: 'EVC Officer A (Prof. Anand Verma)',
      email: 'evc.a@flowtrack.demo',
      role: 'EVC',
      organization: 'AICTE Inspection Panel 1',
      phone: '+91-9822233441'
    },
    {
      id: 'USR-EVC-B',
      name: 'EVC Officer B (Dr. Sunita Rao)',
      email: 'evc.b@flowtrack.demo',
      role: 'EVC',
      organization: 'AICTE Inspection Panel 2',
      phone: '+91-9822233442'
    },
    {
      id: 'USR-EVC-C',
      name: 'EVC Officer C (Prof. Rajesh Nair)',
      email: 'evc.c@flowtrack.demo',
      role: 'EVC',
      organization: 'AICTE Inspection Panel 3',
      phone: '+91-9822233443'
    },
    {
      id: 'USR-EVC-D',
      name: 'EVC Officer D (Dr. Meenakshi Sundaram)',
      email: 'evc.d@flowtrack.demo',
      role: 'EVC',
      organization: 'AICTE Inspection Panel 4',
      phone: '+91-9822233444'
    },
    // 3.4 Four SHC/SAH Personnel
    {
      id: 'USR-SHC-A',
      name: 'SHC Member A (Prof. V. K. Murthy)',
      email: 'shc.a@flowtrack.demo',
      role: 'SHC_SAH',
      organization: 'Standing Hearing Committee Panel Alpha',
      phone: '+91-9833344551'
    },
    {
      id: 'USR-SHC-B',
      name: 'SHC Member B (Dr. Preeti Deshmukh)',
      email: 'shc.b@flowtrack.demo',
      role: 'SHC_SAH',
      organization: 'Standing Hearing Committee Panel Alpha',
      phone: '+91-9833344552'
    },
    {
      id: 'USR-SHC-C',
      name: 'SHC Member C (Prof. Harish Chandra)',
      email: 'shc.c@flowtrack.demo',
      role: 'SHC_SAH',
      organization: 'Standing Hearing Committee Panel Beta',
      phone: '+91-9833344553'
    },
    {
      id: 'USR-SHC-D',
      name: 'SHC Member D (Dr. Alok Srivastava)',
      email: 'shc.d@flowtrack.demo',
      role: 'SHC_SAH',
      organization: 'Standing Hearing Committee Panel Beta',
      phone: '+91-9833344554'
    },
    // 3.5 Higher-Level Officer
    {
      id: 'USR-HLO-001',
      name: 'Dr. B. N. Sengupta (Member Secretary / Regional Director)',
      email: 'higher@flowtrack.demo',
      role: 'HIGHER_OFFICER',
      organization: 'AICTE Headquarters Approval Bureau',
      phone: '+91-9844455661'
    }
  ];

  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO users (
      id, name, email, password_hash, role, organization, phone, is_available, is_active, is_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)
  `);

  for (const u of demoUsers) {
    insertUser.run(u.id, u.name, u.email, defaultHash, u.role, u.organization, u.phone);
  }

  // 4. Seed Applications covering key workflow states
  const seedApps = [
    {
      id: 'APP-DEMO-01',
      application_no: 'AICTE-2026-UG-0101',
      institution_id: 'USR-INST-001',
      institution_name: 'Delhi Institute of Advanced Engineering',
      institution_type: 'Engineering & Technology',
      program_type: 'UG - B.Tech Computer Science & AI',
      academic_year: '2026-2027',
      address: 'Plot 42, Institutional Area, Sector 62',
      state: 'Delhi',
      district: 'New Delhi',
      status: 'SUBMITTED',
      current_stage: 'DOCUMENT_REVIEW',
      completeness_status: 'COMPLETE',
      completeness_notes: 'Automated check passed: All mandatory fields and 6 required documents uploaded.',
      submitted_at: new Date(Date.now() - 3600000 * 4).toISOString()
    },
    {
      id: 'APP-DEMO-02',
      application_no: 'AICTE-2026-PG-0204',
      institution_id: 'USR-INST-001',
      institution_name: 'Delhi Institute of Advanced Engineering',
      institution_type: 'Management',
      program_type: 'PG - MBA Executive',
      academic_year: '2026-2027',
      address: 'Plot 42, Institutional Area, Sector 62',
      state: 'Delhi',
      district: 'New Delhi',
      status: 'AWAITING_CLARIFICATION',
      current_stage: 'CLARIFICATION',
      completeness_status: 'COMPLETE',
      submitted_at: new Date(Date.now() - 3600000 * 48).toISOString()
    },
    {
      id: 'APP-DEMO-03',
      application_no: 'AICTE-2026-ENG-0309',
      institution_id: 'USR-INST-001',
      institution_name: 'Delhi Institute of Advanced Engineering',
      institution_type: 'Engineering & Technology',
      program_type: 'UG - Mechanical & Robotics',
      academic_year: '2026-2027',
      address: 'Plot 42, Institutional Area, Sector 62',
      state: 'Delhi',
      district: 'New Delhi',
      status: 'IN_EVC',
      assigned_route_id: 'ROUTE-SCRUTINY-EVC',
      route_selection_reason: 'Proposed 120-seat expansion in laboratory complex requires on-site physical infrastructure verification.',
      route_selected_by: 'Dr. R. K. Sharma (Reviewing Officer)',
      route_selected_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      current_stage: 'EVC',
      completeness_status: 'COMPLETE',
      submitted_at: new Date(Date.now() - 3600000 * 72).toISOString()
    },
    {
      id: 'APP-DEMO-04',
      application_no: 'AICTE-2026-PHARM-0412',
      institution_id: 'USR-INST-001',
      institution_name: 'Delhi Institute of Advanced Engineering',
      institution_type: 'Pharmacy',
      program_type: 'UG - B.Pharm',
      academic_year: '2026-2027',
      address: 'Plot 42, Institutional Area, Sector 62',
      state: 'Delhi',
      district: 'New Delhi',
      status: 'READY_FOR_FINAL_REVIEW',
      assigned_route_id: 'ROUTE-SCRUTINY-EVC',
      route_selection_reason: 'Campus lab verification completed by EVC with satisfactory safety compliances.',
      route_selected_by: 'Dr. R. K. Sharma (Reviewing Officer)',
      route_selected_at: new Date(Date.now() - 3600000 * 96).toISOString(),
      current_stage: 'FINAL_REVIEW',
      completeness_status: 'COMPLETE',
      submitted_at: new Date(Date.now() - 3600000 * 120).toISOString()
    },
    {
      id: 'APP-DEMO-05',
      application_no: 'AICTE-2026-ARCH-0550',
      institution_id: 'USR-INST-001',
      institution_name: 'Delhi Institute of Advanced Engineering',
      institution_type: 'Architecture',
      program_type: 'UG - B.Arch',
      academic_year: '2026-2027',
      address: 'Plot 42, Institutional Area, Sector 62',
      state: 'Delhi',
      district: 'New Delhi',
      status: 'APPROVED',
      assigned_route_id: 'ROUTE-SCRUTINY-ONLY',
      route_selection_reason: 'Extension of approval renewal with full compliance audit verified.',
      route_selected_by: 'Dr. R. K. Sharma (Reviewing Officer)',
      route_selected_at: new Date(Date.now() - 3600000 * 150).toISOString(),
      current_stage: 'FINAL_REVIEW',
      completeness_status: 'COMPLETE',
      submitted_at: new Date(Date.now() - 3600000 * 180).toISOString(),
      final_decision: 'APPROVED',
      final_decision_reason: 'All land title records, faculty cadred positions, and barrier-free infrastructure satisfy norm thresholds under AICTE APH 2026-27.',
      final_decision_by: 'Dr. B. N. Sengupta (Member Secretary / Regional Director)',
      final_decision_at: new Date(Date.now() - 3600000 * 20).toISOString()
    }
  ];

  const insertApp = db.prepare(`
    INSERT OR REPLACE INTO applications (
      id, application_no, institution_id, institution_name, institution_type,
      program_type, academic_year, address, state, district, status,
      assigned_route_id, route_selection_reason, route_selected_by, route_selected_at,
      current_stage, completeness_status, completeness_notes, submitted_at,
      final_decision, final_decision_reason, final_decision_by, final_decision_at, is_demo
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, 1
    )
  `);

  for (const a of seedApps) {
    insertApp.run(
      a.id, a.application_no, a.institution_id, a.institution_name, a.institution_type,
      a.program_type, a.academic_year, a.address, a.state, a.district, a.status,
      a.assigned_route_id || null, a.route_selection_reason || null, a.route_selected_by || null, a.route_selected_at || null,
      a.current_stage, a.completeness_status, a.completeness_notes || null, a.submitted_at,
      a.final_decision || null, a.final_decision_reason || null, a.final_decision_by || null, a.final_decision_at || null
    );
  }

  // 5. Seed Documents for applications
  const seedDocs = [
    {
      id: 'DOC-01-LAND',
      application_id: 'APP-DEMO-01',
      document_category: 'LAND_TITLE',
      document_name: 'Land_Title_Deed_Khasra_92.pdf',
      file_path: '/uploads/sample_land_deed.pdf',
      file_size: 245000,
      mime_type: 'application/pdf',
      review_status: 'PENDING'
    },
    {
      id: 'DOC-01-FIRE',
      application_id: 'APP-DEMO-01',
      document_category: 'FIRE_SAFETY',
      document_name: 'Fire_NOC_Validity_2027.pdf',
      file_path: '/uploads/sample_fire_noc.pdf',
      file_size: 182000,
      mime_type: 'application/pdf',
      review_status: 'PENDING'
    },
    {
      id: 'DOC-01-FACULTY',
      application_id: 'APP-DEMO-01',
      document_category: 'FACULTY_LIST',
      document_name: 'Faculty_Cadre_Matrix_CSE.pdf',
      file_path: '/uploads/sample_faculty.pdf',
      file_size: 310000,
      mime_type: 'application/pdf',
      review_status: 'PENDING'
    },
    {
      id: 'DOC-02-AFFIDAVIT',
      application_id: 'APP-DEMO-02',
      document_category: 'AFFIDAVIT_ND',
      document_name: 'Notarized_Affidavit_Deficiencies.pdf',
      file_path: '/uploads/sample_affidavit.pdf',
      file_size: 154000,
      mime_type: 'application/pdf',
      review_status: 'CORRECTION_REQUIRED',
      review_notes: 'Affidavit notary stamp expired; updated non-judicial stamp paper required.'
    }
  ];

  const insertDoc = db.prepare(`
    INSERT OR REPLACE INTO application_documents (
      id, application_id, document_category, document_name, file_path, file_size, mime_type, review_status, review_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const d of seedDocs) {
    insertDoc.run(
      d.id, d.application_id, d.document_category, d.document_name, d.file_path, d.file_size, d.mime_type, d.review_status, d.review_notes || null
    );
  }

  // 6. Seed Clarification for APP-DEMO-02
  const seedClarif = db.prepare(`
    INSERT OR REPLACE INTO clarification_requests (
      id, application_id, request_details, specific_documents_required, requested_by,
      requested_at, target_deadline, status
    ) VALUES (
      'CLR-DEMO-01', 'APP-DEMO-02',
      'Please submit an updated Non-Judicial Notarized Affidavit (Annexure 2) showing the current managing trustee signatures.',
      'Updated Notarized Affidavit with current valid stamp.',
      'USR-REV-001', datetime('now', '-2 days'), datetime('now', '+3 days'), 'OPEN'
    )
  `);
  seedClarif.run();

  // 7. Seed Active Tasks across EVC and SHC officers
  // EVC Officer A gets 1 active task
  // EVC Officer B gets 2 active tasks
  // EVC Officer C gets 0 active tasks (Next in line for EVC allocation)
  // EVC Officer D gets 1 active task
  const seedTasks = [
    {
      id: 'TSK-EVC-1001',
      task_number: 'TSK-EVC-001001',
      application_id: 'APP-DEMO-03',
      task_type: 'EVC',
      assignee_id: 'USR-EVC-A',
      status: 'ASSIGNED',
      task_extent: 'MEDIUM',
      extent_reason: 'New AI/Robotics laboratory inspection spanning 2 workshop halls.',
      assessed_by: 'USR-REV-001',
      active_tasks_before_assignment: 0,
      base_duration_days: 4,
      workload_buffer_days: 0,
      uncapped_duration_days: 4,
      max_allowed_duration_days: 10,
      target_duration_days: 4,
      target_due_at: new Date(Date.now() + 3600000 * 72).toISOString(),
      is_cap_reached: 0,
      is_overload_flagged: 0,
      deadline_calculation_explanation: 'Base duration for MEDIUM extent is 4 days. Active tasks before assignment: 0. Configured cap: 10 days.',
      deadline_policy_id: 'POL-EVC-V1'
    },
    {
      id: 'TSK-EVC-1002',
      task_number: 'TSK-EVC-001002',
      application_id: 'APP-DEMO-04',
      task_type: 'EVC',
      assignee_id: 'USR-EVC-B',
      status: 'COMPLETED',
      task_extent: 'LARGE',
      extent_reason: 'Integrated multi-disciplinary campus verification.',
      assessed_by: 'USR-REV-001',
      active_tasks_before_assignment: 1,
      base_duration_days: 6,
      workload_buffer_days: 1,
      uncapped_duration_days: 7,
      max_allowed_duration_days: 10,
      target_duration_days: 7,
      target_due_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      completed_at: new Date(Date.now() - 3600000 * 12).toISOString(),
      is_cap_reached: 0,
      is_overload_flagged: 0,
      deadline_calculation_explanation: 'Base duration for LARGE extent is 6 days + 1 buffer day = 7 days. Completed.',
      deadline_policy_id: 'POL-EVC-V1'
    },
    {
      id: 'TSK-EVC-1003',
      task_number: 'TSK-EVC-001003',
      application_id: 'APP-DEMO-02',
      task_type: 'EVC',
      assignee_id: 'USR-EVC-B',
      status: 'ASSIGNED',
      task_extent: 'SMALL',
      extent_reason: 'Additional classroom ventilation check.',
      assessed_by: 'USR-REV-001',
      active_tasks_before_assignment: 1,
      base_duration_days: 2,
      workload_buffer_days: 1,
      uncapped_duration_days: 3,
      max_allowed_duration_days: 10,
      target_duration_days: 3,
      target_due_at: new Date(Date.now() - 3600000 * 12).toISOString(), // Overdue seed task
      is_cap_reached: 0,
      is_overload_flagged: 0,
      is_overdue: 1,
      is_escalated: 1,
      escalation_reason: 'Task exceeded target deadline',
      deadline_calculation_explanation: 'Base duration for SMALL extent is 2 days + 1 buffer day = 3 days. Currently Overdue.',
      deadline_policy_id: 'POL-EVC-V1'
    },
    {
      id: 'TSK-SHC-2001',
      task_number: 'TSK-SHC-002001',
      application_id: 'APP-DEMO-04',
      task_type: 'SHC_SAH',
      assignee_id: 'USR-SHC-A',
      status: 'COMPLETED',
      task_extent: 'MEDIUM',
      extent_reason: 'Review faculty cadence variance representations.',
      assessed_by: 'USR-REV-001',
      active_tasks_before_assignment: 0,
      base_duration_days: 5,
      workload_buffer_days: 0,
      uncapped_duration_days: 5,
      max_allowed_duration_days: 12,
      target_duration_days: 5,
      target_due_at: new Date(Date.now() - 3600000 * 48).toISOString(),
      completed_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      is_cap_reached: 0,
      is_overload_flagged: 0,
      deadline_calculation_explanation: 'Base duration 5 days. Completed.',
      deadline_policy_id: 'POL-SHC-SAH-V1'
    }
  ];

  const insertTask = db.prepare(`
    INSERT OR REPLACE INTO tasks (
      id, task_number, application_id, task_type, assignee_id, status,
      task_extent, extent_reason, assessed_by, active_tasks_before_assignment,
      base_duration_days, workload_buffer_days, uncapped_duration_days, max_allowed_duration_days,
      target_duration_days, target_due_at, completed_at, is_cap_reached, is_overload_flagged,
      is_overdue, is_escalated, escalation_reason, deadline_calculation_explanation, deadline_policy_id, is_demo
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, 1
    )
  `);

  for (const t of seedTasks) {
    insertTask.run(
      t.id, t.task_number, t.application_id, t.task_type, t.assignee_id, t.status,
      t.task_extent, t.extent_reason, t.assessed_by, t.active_tasks_before_assignment,
      t.base_duration_days, t.workload_buffer_days, t.uncapped_duration_days, t.max_allowed_duration_days,
      t.target_duration_days, t.target_due_at, t.completed_at || null, t.is_cap_reached, t.is_overload_flagged,
      t.is_overdue || 0, t.is_escalated || 0, t.escalation_reason || null, t.deadline_calculation_explanation, t.deadline_policy_id
    );
  }

  // 8. Seed Task Report for TSK-EVC-1002
  const seedReport = db.prepare(`
    INSERT OR REPLACE INTO task_reports (
      id, task_id, report_type, scheduled_date, conducted_date, venue_mode,
      observations, deficiencies_noted, recommendation, submitted_by, review_status
    ) VALUES (
      'REP-EVC-001', 'TSK-EVC-1002', 'EVC_REPORT', '2026-10-25', '2026-10-26', 'Campus Inspection',
      'The expert visit verified physical laboratories, barrier-free access, and digital library subscription rosters.',
      'Minor: First-aid kits in Workshop B to be replenished before academic session commencement.',
      'RECOMMENDED', 'USR-EVC-B', 'ACCEPTED'
    )
  `);
  seedReport.run();

  // 9. Initial Seed Audit Log
  const seedAudit = db.prepare(`
    INSERT OR REPLACE INTO audit_logs (
      id, event_type, entity_type, entity_id, actor_id, actor_name, actor_role, reason, created_at
    ) VALUES (
      'AUD-INIT-001', 'SYSTEM_INITIALIZED', 'SYSTEM', 'FLOWTRACK-PLATFORM',
      'SYSTEM', 'Platform Seeder', 'SYSTEM', 'Initial synthetic demonstration environment loaded.', datetime('now')
    )
  `);
  seedAudit.run();

  console.log('Seeding successfully completed!');
}

module.exports = { seedDatabase };

if (require.main === module) {
  seedDatabase();
}
