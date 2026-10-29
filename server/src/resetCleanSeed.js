const { db } = require('./database');

function cleanAndSeed() {
  console.log('--- RESETTING AND SEEDING CLEAN DEMONSTRATION CASES ---');

  db.pragma('foreign_keys = OFF');

  // Clear application transaction tables
  db.exec('DELETE FROM applications;');
  db.exec('DELETE FROM application_documents;');
  db.exec('DELETE FROM clarification_requests;');
  db.exec('DELETE FROM tasks;');
  db.exec('DELETE FROM task_reports;');
  db.exec('DELETE FROM task_reassignments;');
  db.exec('DELETE FROM deadline_extensions;');
  db.exec('DELETE FROM sac_appeals;');
  db.exec('DELETE FROM notifications;');
  db.exec('DELETE FROM audit_logs;');

  db.pragma('foreign_keys = ON');

  const now = new Date();
  const pastDays = (d) => new Date(now.getTime() - d * 86400000).toISOString();
  const futureDays = (d) => new Date(now.getTime() + d * 86400000).toISOString();

  const instName = 'Delhi Institute of Advanced Engineering';
  const instAddress = 'Plot 42, Institutional Area, Sector 62';
  const instState = 'Delhi';
  const instDistrict = 'New Delhi';

  // -------------------------------------------------------------
  // CASE 1: Fresh Application Ready for Reviewer Scrutiny & Route Allocation
  // -------------------------------------------------------------
  const app1Id = 'APP-DEMO-01';
  db.prepare(`
    INSERT INTO applications (
      id, application_no, institution_id, institution_name, institution_type, program_type,
      academic_year, address, state, district, status, current_stage,
      completeness_status, completeness_notes, submitted_at, user_submission_date,
      reappeal_count, appeal_status, is_demo
    ) VALUES (
      ?, 'AICTE-2026-ENG-0101', 'USR-INST-001', ?, 'Engineering', 'UG - B.Tech Computer Science & AI',
      '2026-2027', ?, ?, ?, 'SUBMITTED', 'DOCUMENT_SCRUTINY',
      'COMPLETE', 'Automated completeness verification passed: 4 mandatory statutory documents submitted.', ?, ?,
      0, 'NONE', 1
    )
  `).run(app1Id, instName, instAddress, instState, instDistrict, pastDays(1), '2026-10-28');

  // Documents for Case 1
  const docs1 = [
    ['DOC-101', app1Id, 'APPROVED_BUILDING_PLAN', 'Approved_Building_Plan_Sanction.pdf', 'ACCEPTED'],
    ['DOC-102', app1Id, 'AFFIDAVIT_2', 'Statutory_Affidavit_2_Signed.pdf', 'ACCEPTED'],
    ['DOC-103', app1Id, 'LAND_OWNERSHIP_LEASE', 'Registered_30Yr_Lease_Deed.pdf', 'ACCEPTED'],
    ['DOC-104', app1Id, 'DETAILED_PROJECT_REPORT', 'Detailed_Project_Report_DPR.pdf', 'ACCEPTED']
  ];
  for (const [docId, aId, cat, name, st] of docs1) {
    db.prepare(`
      INSERT INTO application_documents (id, application_id, document_category, document_name, file_path, file_size, mime_type, review_status, uploaded_at)
      VALUES (?, ?, ?, ?, ?, 245000, 'application/pdf', ?, datetime('now'))
    `).run(docId, aId, cat, name, `/uploads/${name}`, st);
  }

  // -------------------------------------------------------------
  // CASE 2: Sequential Workflow: EVC Inspection Submitted, Awaiting Higher Officer Acceptance
  // -------------------------------------------------------------
  const app2Id = 'APP-DEMO-02';
  db.prepare(`
    INSERT INTO applications (
      id, application_no, institution_id, institution_name, institution_type, program_type,
      academic_year, address, state, district, status, current_stage,
      assigned_route_id, route_selection_reason, route_selected_by, route_selected_at,
      evc_task_extent, evc_extent_reason, shc_task_extent, shc_extent_reason,
      stage_states_json, completeness_status, submitted_at, user_submission_date,
      reappeal_count, appeal_status, is_demo
    ) VALUES (
      ?, 'AICTE-2026-TECH-0202', 'USR-INST-001', ?, 'Technical', 'Diploma - Robotics & Automation Engineering',
      '2026-2027', ?, ?, ?, 'IN_EVC', 'EVC',
      'ROUTE-EVC-SHC', 'Physical workshop inspection mandated followed by Standing Hearing Committee cadence review.', 'Dr. R. K. Sharma (Reviewing Officer)', ?,
      'MEDIUM', 'Physical verification of 3 heavy machinery laboratories spanning 2 blocks.',
      'MEDIUM', 'Standing Hearing Committee assessment on faculty-to-student cadence ratio.',
      ?, 'COMPLETE', ?, ?,
      0, 'NONE', 1
    )
  `).run(
    app2Id,
    instName,
    instAddress,
    instState,
    instDistrict,
    pastDays(3),
    JSON.stringify({ EVC: 'ACTIVE', SHC_SAH: 'PENDING' }),
    pastDays(4),
    '2026-10-25'
  );

  // EVC Task for Case 2
  const taskIdEvc = 'TSK-EVC-20202';
  db.prepare(`
    INSERT INTO tasks (
      id, task_number, application_id, task_type, assignee_id, status,
      task_extent, extent_reason, assessed_by, active_tasks_before_assignment, active_tasks_after_assignment, allocation_reason,
      base_duration_days, workload_buffer_days, uncapped_duration_days, max_allowed_duration_days,
      target_duration_days, target_due_at, is_cap_reached, is_overload_flagged,
      is_overdue, is_escalated, deadline_calculation_explanation, deadline_policy_id, is_demo
    ) VALUES (
      ?, 'TSK-EVC-0202', ?, 'EVC', 'USR-EVC-A', 'SUBMITTED',
      'MEDIUM', 'Physical verification of 3 heavy machinery laboratories spanning 2 blocks.', 'USR-REV-001', 0, 1,
      'Allocated because Prof. Amit Verma (EVC Panel A) had the lowest active workload (0 active tasks before assignment).',
      4, 0, 4, 10,
      4, ?, 0, 0,
      0, 0, 'Base duration 4 days for Medium extent. Zero active task workload buffer applied.', 'POL-EVC-V1', 1
    )
  `).run(taskIdEvc, app2Id, futureDays(4));

  // EVC Report awaiting Higher Officer review & acceptance
  db.prepare(`
    INSERT INTO task_reports (
      id, task_id, report_type, scheduled_date, conducted_date, venue_mode,
      observations, deficiencies_noted, recommendation, submitted_by, user_submission_date, review_status, submitted_at
    ) VALUES (
      'REP-EVC-0202', ?, 'EVC_REPORT', '2026-10-27', '2026-10-28', 'Physical On-Site',
      'Physical infrastructure verified. Robotics lab machinery installed and operational. Safety alarms and ventilation installed.',
      'Minor: First aid cabinet requires replenishment.',
      'RECOMMENDED', 'USR-EVC-A', '2026-10-28', 'SUBMITTED', ?
    )
  `).run(taskIdEvc, pastDays(1));

  // -------------------------------------------------------------
  // CASE 3: Ready for Final Regulatory Review (EVC + SHC Completed)
  // -------------------------------------------------------------
  const app3Id = 'APP-DEMO-03';
  db.prepare(`
    INSERT INTO applications (
      id, application_no, institution_id, institution_name, institution_type, program_type,
      academic_year, address, state, district, status, current_stage,
      assigned_route_id, route_selection_reason, route_selected_by, route_selected_at,
      stage_states_json, completeness_status, submitted_at, user_submission_date,
      reappeal_count, appeal_status, is_demo
    ) VALUES (
      ?, 'AICTE-2026-PHARM-0303', 'USR-INST-001', ?, 'Pharmacy', 'UG - Bachelor of Pharmacy (B.Pharm)',
      '2026-2027', ?, ?, ?, 'READY_FOR_FINAL_REVIEW', 'FINAL_REVIEW',
      'ROUTE-EVC-SHC', 'Mandatory inspection and hearing compliance verification for pharmacy expansion.', 'Dr. R. K. Sharma (Reviewing Officer)', ?,
      ?, 'COMPLETE', ?, ?,
      0, 'NONE', 1
    )
  `).run(
    app3Id,
    instName,
    instAddress,
    instState,
    instDistrict,
    pastDays(6),
    JSON.stringify({ EVC: 'COMPLETED', SHC_SAH: 'COMPLETED' }),
    pastDays(7),
    '2026-10-22'
  );

  // -------------------------------------------------------------
  // CASE 4: Rejected Application -> Ready for Institution SAH Appeal (reappeal_count = 0)
  // -------------------------------------------------------------
  const app4Id = 'APP-DEMO-04';
  db.prepare(`
    INSERT INTO applications (
      id, application_no, institution_id, institution_name, institution_type, program_type,
      academic_year, address, state, district, status, current_stage,
      completeness_status, submitted_at, user_submission_date,
      final_decision, final_decision_reason, final_decision_by, final_decision_at,
      reappeal_count, appeal_status, is_demo
    ) VALUES (
      ?, 'AICTE-2026-MGT-0404', 'USR-INST-001', ?, 'Management', 'PG - MBA Business Analytics',
      '2026-2027', ?, ?, ?, 'REJECTED', 'FINAL_REVIEW',
      'COMPLETE', ?, ?,
      'REJECTED', 'Norm deficiency: Registered land lease deed submitted had expired validity clause under Clause 4.2 of AICTE APH.', 'Dr. B. N. Sengupta (Higher-Level Officer)', ?,
      0, 'NONE', 1
    )
  `).run(app4Id, instName, instAddress, instState, instDistrict, pastDays(10), '2026-10-18', pastDays(2));

  // Documents for Case 4
  db.prepare(`
    INSERT INTO application_documents (id, application_id, document_category, document_name, file_path, file_size, mime_type, review_status, uploaded_at)
    VALUES ('DOC-401', ?, 'LAND_OWNERSHIP_LEASE', 'Expired_Lease_2024.pdf', '/uploads/Expired_Lease_2024.pdf', 310000, 'application/pdf', 'ACCEPTED', datetime('now'))
  `).run(app4Id);

  // -------------------------------------------------------------
  // CASE 5: Active SAH Appeal Awaiting Final Supreme Authority Verdict
  // -------------------------------------------------------------
  const app5Id = 'APP-DEMO-05';
  db.prepare(`
    INSERT INTO applications (
      id, application_no, institution_id, institution_name, institution_type, program_type,
      academic_year, address, state, district, status, current_stage,
      completeness_status, submitted_at, user_submission_date,
      final_decision, final_decision_reason, final_decision_by, final_decision_at,
      reappeal_count, appeal_status, is_demo
    ) VALUES (
      ?, 'AICTE-2026-ARCH-0505', 'USR-INST-001', ?, 'Architecture', 'UG - Bachelor of Architecture (B.Arch)',
      '2026-2027', ?, ?, ?, 'REJECTED', 'FINAL_REVIEW',
      'COMPLETE', ?, ?,
      'REJECTED', 'Deficiency noted: Structural studio space variance and missing municipal fire approval endorsement.', 'Dr. B. N. Sengupta (Higher-Level Officer)', ?,
      0, 'IN_SAC_REVIEW', 1
    )
  `).run(app5Id, instName, instAddress, instState, instDistrict, pastDays(12), '2026-10-16', pastDays(4));

  // SAH Task and Appeal for Case 5
  const appeal5Id = 'SAC-APP-0505';
  const task5Id = 'TSK-SAC-0505';

  db.prepare(`
    INSERT INTO tasks (
      id, task_number, application_id, task_type, assignee_id, status,
      task_extent, extent_reason, assessed_by, active_tasks_before_assignment, active_tasks_after_assignment, allocation_reason,
      base_duration_days, workload_buffer_days, uncapped_duration_days, max_allowed_duration_days,
      target_duration_days, target_due_at, is_cap_reached, is_overload_flagged,
      is_overdue, is_escalated, deadline_calculation_explanation, deadline_policy_id, is_demo
    ) VALUES (
      ?, 'TSK-SAC-0505', ?, 'SAC', 'USR-SAC-A', 'ASSIGNED',
      'MEDIUM', 'Standing Appellate Committee statutory examination for AICTE-2026-ARCH-0505', 'USR-REV-001', 0, 1,
      'Allocated because Prof. S. R. Singhania (SAC Chairman) had lowest active workload.',
      5, 0, 5, 10,
      5, ?, 0, 0,
      0, 0, 'Base duration 5 days for SAH examination.', 'POL-SAC-01', 1
    )
  `).run(task5Id, app5Id, futureDays(5));

  db.prepare(`
    INSERT INTO sac_appeals (
      id, appeal_no, application_id, institution_id, original_decision, original_decision_reason,
      appeal_grounds, user_appeal_date, status, assigned_sac_id, task_id, submitted_at
    ) VALUES (
      ?, 'SAC-APP-2026-0505', ?, 'USR-INST-001', 'REJECTED',
      'Deficiency noted: Structural studio space variance and missing municipal fire approval endorsement.',
      'Fire approval NOC has now been formally issued on 25-Oct. Architectural drawings submitted confirm required studio volume. Seeking one-time resubmission opportunity.',
      '2026-10-26', 'ASSIGNED', 'USR-SAC-A', ?, ?
    )
  `).run(appeal5Id, app5Id, task5Id, pastDays(3));

  // -------------------------------------------------------------
  // CASE 6: Remanded by SAH for Document Resubmission (reappeal_count = 1/1)
  // -------------------------------------------------------------
  const app6Id = 'APP-DEMO-06';
  db.prepare(`
    INSERT INTO applications (
      id, application_no, institution_id, institution_name, institution_type, program_type,
      academic_year, address, state, district, status, current_stage,
      completeness_status, submitted_at, user_submission_date,
      reappeal_count, appeal_status, is_demo
    ) VALUES (
      ?, 'AICTE-2026-ENG-0606', 'USR-INST-001', ?, 'Engineering', 'UG - B.Tech Electrical & EV Technology',
      '2026-2027', ?, ?, ?, 'UNDER_REVIEW', 'DOCUMENT_SCRUTINY',
      'COMPLETE', ?, ?,
      1, 'RESUBMISSION_ALLOWED', 1
    )
  `).run(app6Id, instName, instAddress, instState, instDistrict, pastDays(15), '2026-10-14');

  // Closed Appeal record for Case 6
  db.prepare(`
    INSERT INTO sac_appeals (
      id, appeal_no, application_id, institution_id, original_decision, original_decision_reason,
      appeal_grounds, user_appeal_date, status, assigned_sac_id,
      final_decision, final_decision_reason, final_decision_by, final_decision_at, submitted_at
    ) VALUES (
      'SAC-APP-0606', 'SAC-APP-2026-0606', ?, 'USR-INST-001', 'REJECTED',
      'High-voltage laboratory equipment certification missing.',
      'Equipment calibration certification obtained from NABL accredited laboratory.',
      '2026-10-22', 'CLOSED', 'USR-SAC-A',
      'ALLOW_RESUBMISSION', 'SAH verified calibration certificate credentials. Allowed institution one more opportunity to resubmit its documents. Remanded to Reviewing Officer as Under Review. reappeal_count updated to 1/1.',
      'Prof. S. R. Singhania (SAC Chairman)', ?, ?
    )
  `).run(app6Id, pastDays(1), pastDays(4));

  // -------------------------------------------------------------
  // CASE 7: Overdue Tasks for Higher Officer Escalation Dashboard
  // -------------------------------------------------------------
  const overdueTaskId = 'TSK-OVERDUE-01';
  db.prepare(`
    INSERT INTO tasks (
      id, task_number, application_id, task_type, assignee_id, status,
      task_extent, extent_reason, assessed_by, active_tasks_before_assignment, active_tasks_after_assignment, allocation_reason,
      base_duration_days, workload_buffer_days, uncapped_duration_days, max_allowed_duration_days,
      target_duration_days, target_due_at, is_cap_reached, is_overload_flagged,
      is_overdue, is_escalated, deadline_calculation_explanation, deadline_policy_id, is_demo
    ) VALUES (
      ?, 'TSK-EVC-OVERDUE', ?, 'EVC', 'USR-EVC-B', 'IN_PROGRESS',
      'LARGE', 'Multi-campus campus inspection.', 'USR-REV-001', 1, 2,
      'Allocated to Dr. Sunita Rao based on workload balance.',
      6, 1.0, 7, 10,
      7, ?, 0, 0,
      1, 0, 'Large extent base 6d + 1d workload buffer.', 'POL-EVC-V1', 1
    )
  `).run(overdueTaskId, app2Id, pastDays(2));

  console.log('--- CLEAN DEMO DATABASE SEEDED SUCCESSFULLY ---');
  console.log('All 6 applications now set to "Delhi Institute of Advanced Engineering" with varying academic programs.');
}

cleanAndSeed();
