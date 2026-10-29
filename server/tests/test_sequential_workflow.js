// test_sequential_workflow.js - Automated Test Suite for Route Selection, Sequential Workflow & Allocation Transparency
const { db } = require('../src/database');
const { createTaskWithAllocation } = require('../src/workflowEngine');
const { findEligibleWorkerForRole, getActiveTaskCountForUser } = require('../src/allocationService');
const http = require('http');

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path,
      method: 'POST',
      headers
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path,
      method: 'GET',
      headers
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(buf) });
        } catch (e) {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING AICTE FLOWTRACK SEQUENTIAL WORKFLOW & ALLOCATION TESTS ===\n');

  // Step 1: Login as Reviewer
  console.log('[Step 1] Authenticating Reviewing Officer...');
  const revLogin = await post('/api/auth/login', {
    email: 'reviewer@flowtrack.demo',
    password: '123456'
  });
  if (!revLogin.body.token) throw new Error('Reviewer login failed: ' + JSON.stringify(revLogin.body));
  const reviewerToken = revLogin.body.token;
  console.log('✓ Reviewer authenticated successfully:', revLogin.body.user.name);

  // Step 2: Create a fresh application for this test
  console.log('\n[Step 2] Creating a fresh test application...');
  const appRes = await get('/api/applications', reviewerToken);
  // Pick or create application
  const testAppId = 'APP-TEST-' + Date.now();
  const testAppNo = 'AICTE-2026-TEST-' + Math.floor(1000 + Math.random() * 9000);
  
  db.prepare(`
    INSERT INTO applications (
      id, application_no, institution_id, institution_name, institution_type, program_type,
      academic_year, address, state, district, status, current_stage, completeness_status, is_demo
    ) VALUES (
      ?, ?, 'USR-INST-001', 'Test Institute of Engineering', 'Engineering', 'UG',
      '2026-2027', 'Sector 14, Knowledge Park', 'Delhi', 'New Delhi', 'UNDER_DOCUMENT_REVIEW', 'DOCUMENT_REVIEW', 'COMPLETE', 1
    )
  `).run(testAppId, testAppNo);
  console.log('✓ Created fresh application in UNDER_DOCUMENT_REVIEW:', testAppNo);

  // Step 3: Test Validation - Route Selection must require extent & reason for included stages
  console.log('\n[Step 3] Testing Route Selection Validation (Requirement 1)...');
  const invalidRouteRes = await post(`/api/applications/${testAppId}/select-route`, {
    route_id: 'ROUTE-EVC-SHC',
    route_selection_reason: 'Testing validation without extent fields'
    // Missing evc_task_extent and shc_task_extent
  }, reviewerToken);

  if (invalidRouteRes.status === 400) {
    console.log('✓ Route selection rejected missing extent fields as expected:', invalidRouteRes.body.error);
  } else {
    throw new Error('Expected 400 validation error, got: ' + invalidRouteRes.status);
  }

  // Step 4: Valid Route Selection with Separate Stage Assessments (EVC=LARGE, SHC=SMALL)
  console.log('\n[Step 4] Submitting Route Selection with Separate Stage Sizing (Requirements 1, 3, 4, 5)...');
  const selectRouteRes = await post(`/api/applications/${testAppId}/select-route`, {
    route_id: 'ROUTE-EVC-SHC',
    route_selection_reason: 'Expansion requires physical robotics labs inspection and faculty cadre committee hearing.',
    evc_task_extent: 'LARGE',
    evc_extent_reason: 'Verification of 4 new mechanical & AI laboratories across 2 departmental buildings.',
    shc_task_extent: 'SMALL',
    shc_extent_reason: 'Committee hearing specifically on faculty cadre ratio representation.'
  }, reviewerToken);

  if (selectRouteRes.status !== 200) {
    throw new Error('Route selection failed: ' + JSON.stringify(selectRouteRes.body));
  }
  console.log('✓ Route selection confirmed. Response:', {
    nextStage: selectRouteRes.body.nextStage,
    nextStatus: selectRouteRes.body.nextStatus,
    stageStates: selectRouteRes.body.stageStates
  });

  const allocatedEvc = selectRouteRes.body.allocatedTask;
  if (!allocatedEvc) throw new Error('EVC task was not allocated!');
  console.log('✓ EVC Task Allocated immediately:', {
    taskNumber: allocatedEvc.taskNumber,
    assignee: allocatedEvc.assignee.name,
    activeTasksBefore: allocatedEvc.activeTasksBeforeAssignment,
    activeTasksAfter: allocatedEvc.activeTasksAfterAssignment,
    allocationReason: allocatedEvc.allocationReason
  });

  // Verify transparency explanation format
  if (!allocatedEvc.allocationReason.includes('lowest active workload')) {
    throw new Error('Allocation reason does not explain lowest active workload: ' + allocatedEvc.allocationReason);
  }

  // Step 5: Verify Sequential Workflow - SHC/SAH MUST NOT be created yet
  console.log('\n[Step 5] Verifying Sequential Workflow Execution (Requirement 2)...');
  const appDetailsBeforeEVC = await get(`/api/applications/${testAppId}`, reviewerToken);
  const tasksBeforeEVC = appDetailsBeforeEVC.body.tasks;
  console.log(`Application currently has ${tasksBeforeEVC.length} task(s).`);
  
  const hasShcBeforeEVC = tasksBeforeEVC.some(t => t.task_type === 'SHC_SAH');
  if (hasShcBeforeEVC) {
    throw new Error('SHC/SAH task was created prematurely! EVC must execute first.');
  }
  console.log('✓ Verified: SHC/SAH task is NOT created yet. Only EVC is active.');

  // Check saved separate assessments in application record
  const savedApp = appDetailsBeforeEVC.body.application;
  console.log('✓ Verified separate stage assessments saved on application:');
  console.log(`  - EVC Extent: ${savedApp.evc_task_extent} ("${savedApp.evc_extent_reason}")`);
  console.log(`  - SHC Extent: ${savedApp.shc_task_extent} ("${savedApp.shc_extent_reason}")`);
  if (savedApp.evc_task_extent !== 'LARGE' || savedApp.shc_task_extent !== 'SMALL') {
    throw new Error('Stage extents were not saved independently!');
  }

  // Step 6: EVC Officer submits report
  console.log('\n[Step 6] Assigned EVC Officer submitting report...');
  const evcOfficer = allocatedEvc.assignee;
  const evcLogin = await post('/api/auth/login', {
    email: evcOfficer.email,
    password: '123456'
  });
  const evcToken = evcLogin.body.token;

  const submitReportRes = await post(`/api/tasks/${allocatedEvc.taskId}/submit-report`, {
    conducted_date: '2026-10-28',
    venue_mode: 'Campus Physical Visit',
    observations: 'All 4 laboratories physically verified with adequate safety equipment.',
    deficiencies_noted: 'Minor signage missing on building B corridor.',
    recommendation: 'RECOMMENDED'
  }, evcToken);

  if (submitReportRes.status !== 200) {
    throw new Error('EVC report submission failed: ' + JSON.stringify(submitReportRes.body));
  }
  const reportId = submitReportRes.body.reportId;
  console.log('✓ EVC Inspection Report submitted with ID:', reportId);

  // Step 7: Test Reviewer returning for correction - SHC/SAH must remain pending
  console.log('\n[Step 7] Testing Return for Correction behavior...');
  const returnRes = await post(`/api/reports/${reportId}/review`, {
    review_status: 'CORRECTION_REQUIRED',
    review_feedback: 'Please attach photos of laboratory safety extinguishers.'
  }, reviewerToken);
  if (returnRes.status !== 200) throw new Error('Return for correction failed');

  const appAfterReturn = await get(`/api/applications/${testAppId}`, reviewerToken);
  const hasShcAfterReturn = appAfterReturn.body.tasks.some(t => t.task_type === 'SHC_SAH');
  if (hasShcAfterReturn) {
    throw new Error('SHC/SAH must remain pending when report is returned for correction!');
  }
  console.log('✓ Verified: When report is returned for correction, SHC/SAH remains pending.');

  // Step 8: EVC Officer resubmits report
  console.log('\n[Step 8] EVC Officer resubmitting revised report...');
  const resubmitRes = await post(`/api/tasks/${allocatedEvc.taskId}/submit-report`, {
    conducted_date: '2026-10-28',
    venue_mode: 'Campus Physical Visit',
    observations: 'Safety extinguishers and lab photographs attached and verified.',
    deficiencies_noted: 'None.',
    recommendation: 'RECOMMENDED'
  }, evcToken);
  const newReportId = resubmitRes.body.reportId;

  // Step 9: Reviewer ACCEPTS the EVC report -> SHC/SAH must automatically activate & allocate!
  console.log('\n[Step 9] Reviewer accepts EVC report -> Triggering automatic SHC/SAH activation...');
  const acceptRes = await post(`/api/reports/${newReportId}/review`, {
    review_status: 'ACCEPTED',
    review_feedback: 'Photographs and lab verification accepted as complete.'
  }, reviewerToken);

  if (acceptRes.status !== 200) throw new Error('Report acceptance failed: ' + JSON.stringify(acceptRes.body));
  console.log('✓ EVC report accepted successfully.');

  // Step 10: Verify SHC/SAH task automatically activated, allocated to lowest workload officer
  console.log('\n[Step 10] Verifying SHC/SAH task activation & workload transparency (Requirements 2, 3, 4, 5)...');
  const appAfterAccept = await get(`/api/applications/${testAppId}`, reviewerToken);
  const allTasks = appAfterAccept.body.tasks;
  console.log(`Application now has ${allTasks.length} task(s).`);

  const shcTask = allTasks.find(t => t.task_type === 'SHC_SAH');
  if (!shcTask) {
    throw new Error('SHC/SAH task was NOT automatically activated after EVC report acceptance!');
  }

  console.log('✓ SHC/SAH Task Automatically Activated & Allocated:');
  console.log(`  - Task Number: ${shcTask.task_number}`);
  console.log(`  - Assigned Officer: ${shcTask.assignee_name} (${shcTask.assignee_role})`);
  console.log(`  - Assessed Extent Used: ${shcTask.task_extent} (Expected: SMALL)`);
  console.log(`  - Workload Before: ${shcTask.active_tasks_before_assignment}`);
  console.log(`  - Workload After: ${shcTask.active_tasks_after_assignment}`);
  console.log(`  - Allocation Reason: "${shcTask.allocation_reason}"`);
  console.log(`  - Target Due Date: ${new Date(shcTask.target_due_at).toLocaleDateString()}`);

  if (shcTask.task_extent !== 'SMALL') {
    throw new Error(`Expected SHC task extent SMALL, got: ${shcTask.task_extent}`);
  }
  if (!shcTask.allocation_reason || !shcTask.allocation_reason.includes('lowest active workload')) {
    throw new Error('SHC allocation reason missing lowest active workload transparency!');
  }

  // Step 11: Verify Application Status updated to IN_SHC_SAH
  console.log('\n[Step 11] Verifying Application Status...');
  const updatedApp = appAfterAccept.body.application;
  console.log(`  - Status: ${updatedApp.status} (Expected: IN_SHC_SAH)`);
  console.log(`  - Current Stage: ${updatedApp.current_stage} (Expected: SHC_SAH)`);
  if (updatedApp.status !== 'IN_SHC_SAH' || updatedApp.current_stage !== 'SHC_SAH') {
    throw new Error(`Unexpected application stage/status: ${updatedApp.status} / ${updatedApp.current_stage}`);
  }

  // Step 12: Ensure no duplicate tasks created on repeat calls
  console.log('\n[Step 12] Verifying idempotence (No duplicate tasks on re-review)...');
  await post(`/api/reports/${newReportId}/review`, {
    review_status: 'ACCEPTED',
    review_feedback: 'Repeat check'
  }, reviewerToken);
  const appCheck = await get(`/api/applications/${testAppId}`, reviewerToken);
  const shcCount = appCheck.body.tasks.filter(t => t.task_type === 'SHC_SAH').length;
  if (shcCount !== 1) {
    throw new Error(`Duplicate SHC tasks found: ${shcCount}`);
  }
  console.log('✓ Verified: No duplicate tasks created.');

  console.log('\n======================================================');
  console.log('ALL 5 USER REQUIREMENTS VERIFIED & PASSED WITH 100% SUCCESS!');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
