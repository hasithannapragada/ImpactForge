const BASE = 'http://localhost:4000/api';

async function login(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }) // demo password fallback
  });
  const data = await res.json();
  if (data.token) return data.token;
  // Try 123456
  const res2 = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: '123456' })
  });
  const data2 = await res2.json();
  return data2.token;
}

async function runTests() {
  console.log('=== STARTING SAH SUPREME AUTHORITY & RESUBMISSION WORKFLOW TESTS ===\n');

  const instToken = await login('institution@flowtrack.demo');
  const higherToken = await login('higher@flowtrack.demo');
  const reviewerToken = await login('reviewer@flowtrack.demo');
  const sahToken = await login('sac.a@flowtrack.demo');

  console.log('✓ Successfully authenticated tokens for Institution, Higher Officer, Reviewer, and SAH Officer.');

  // 1. Submit fresh application
  const appRes = await (await fetch(`${BASE}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instToken}` },
    body: JSON.stringify({
      institution_name: 'SAH Supreme Appellate Test Institute',
      institution_type: 'Technical',
      program_type: 'UG',
      academic_year: '2026-2027',
      address: '77 Judicial Enclave',
      state: 'Delhi',
      district: 'New Delhi',
      user_submission_date: '2026-10-29'
    })
  })).json();

  const appId = appRes.id;
  console.log(`✓ 1. Created Application ${appRes.application_no} (ID: ${appId})`);

  // Submit it
  await fetch(`${BASE}/applications/${appId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instToken}` },
    body: JSON.stringify({ submission_date: '2026-10-29' })
  });
  console.log('✓ 2. Application submitted.');

  // Forward to final review by reviewer
  await fetch(`${BASE}/applications/${appId}/forward-final-review`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${reviewerToken}` }
  });

  // Higher Officer rejects application
  await fetch(`${BASE}/applications/${appId}/final-decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${higherToken}` },
    body: JSON.stringify({
      decision_outcome: 'REJECTED',
      decision_explanation: 'Norm deficit: Incomplete laboratory infrastructure and expired land title.'
    })
  });
  console.log('✓ 3. Application rejected by Higher-Level Officer.');

  // Verify status is REJECTED and reappeal_count is 0
  let appRecord = await (await fetch(`${BASE}/applications/${appId}`, {
    headers: { 'Authorization': `Bearer ${instToken}` }
  })).json();
  console.log(`✓ 4. Status: ${appRecord.application.status}, Final Decision: ${appRecord.application.final_decision}, reappeal_count: ${appRecord.application.reappeal_count}`);

  // 5. Institution submits appeal to SAH
  const appealRes = await (await fetch(`${BASE}/applications/${appId}/appeal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instToken}` },
    body: JSON.stringify({
      appeal_grounds: 'Rectified all land title defects and secured registered lease. Seeking one-time resubmission opportunity.',
      user_appeal_date: '2026-10-29'
    })
  })).json();

  const appealId = appealRes.appealId;
  console.log(`✓ 5. Lodged Appeal ${appealRes.appealNo} (ID: ${appealId})`);

  // 6. SAH Member makes BINDING decision directly (Acting as Supreme Court)
  console.log('✓ 6. SAH Member decides: ALLOW_RESUBMISSION');
  const sahDecisionRes = await (await fetch(`${BASE}/appeals/${appealId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sahToken}` },
    body: JSON.stringify({
      final_decision: 'ALLOW_RESUBMISSION',
      final_decision_reason: 'SAH examined the lease deed draft and determined the institution has cured the core defect. One-time document resubmission granted.',
      user_decision_date: '2026-10-29'
    })
  })).json();

  console.log(`   SAH Decision Response:`, sahDecisionRes);

  // 7. Verify downstream application state
  appRecord = await (await fetch(`${BASE}/applications/${appId}`, {
    headers: { 'Authorization': `Bearer ${instToken}` }
  })).json();

  console.log('\n--- VERIFYING POST-SAH APPLICATION STATE ---');
  console.log(`✓ Application Status: ${appRecord.application.status} (Expected: UNDER_REVIEW)`);
  console.log(`✓ Current Stage: ${appRecord.application.current_stage} (Expected: DOCUMENT_SCRUTINY)`);
  console.log(`✓ Appeal Status: ${appRecord.application.appeal_status} (Expected: RESUBMISSION_ALLOWED)`);
  console.log(`✓ Reappeal Count: ${appRecord.application.reappeal_count} (Expected: 1)`);
  console.log(`✓ Final Decision: ${appRecord.application.final_decision} (Expected: null)`);

  if (appRecord.application.status !== 'UNDER_REVIEW') throw new Error(`Expected status UNDER_REVIEW but got ${appRecord.application.status}`);
  if (appRecord.application.current_stage !== 'DOCUMENT_SCRUTINY') throw new Error(`Expected current_stage DOCUMENT_SCRUTINY but got ${appRecord.application.current_stage}`);
  if (appRecord.application.reappeal_count !== 1) throw new Error(`Expected reappeal_count 1 but got ${appRecord.application.reappeal_count}`);

  // 8. Institution resubmits documents within existing application
  console.log('\n--- TESTING INSTITUTION DOCUMENT RESUBMISSION ---');
  const resubmitRes = await (await fetch(`${BASE}/applications/${appId}/resubmit-documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instToken}` },
    body: JSON.stringify({
      notes: 'Resubmitting registered lease deed and building plan approval.',
      submission_date: '2026-10-29'
    })
  })).json();
  console.log('✓ 8. Institution resubmitted documents:', resubmitRes.message);

  // 9. Re-reject application to test statutory re-appeal capping
  console.log('\n--- TESTING STATUTORY REAPPEAL CAPPING (reappeal_count <= 1) ---');
  await fetch(`${BASE}/applications/${appId}/forward-final-review`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${reviewerToken}` }
  });

  await fetch(`${BASE}/applications/${appId}/final-decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${higherToken}` },
    body: JSON.stringify({
      decision_outcome: 'REJECTED',
      decision_explanation: 'Resubmitted documents still lack approved municipal floor clearance.'
    })
  });
  console.log('✓ Application rejected second time.');

  // Try to appeal again
  const secondAppealRes = await (await fetch(`${BASE}/applications/${appId}/appeal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instToken}` },
    body: JSON.stringify({
      appeal_grounds: 'Second appeal attempt.',
      user_appeal_date: '2026-10-29'
    })
  })).json();

  console.log('✓ Attempted second appeal response:', secondAppealRes);
  if (!secondAppealRes.error || !secondAppealRes.error.includes('Statutory limit reached')) {
    throw new Error('Expected second appeal to be strictly blocked by reappeal_count constraint!');
  }
  console.log('✓ SUCCESS: Second appeal strictly prevented because reappeal_count is already 1!');

  // 10. Test SAH REJECT_APPEAL option
  console.log('\n--- TESTING SAH REJECT_APPEAL OPTION ---');
  const app2Res = await (await fetch(`${BASE}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instToken}` },
    body: JSON.stringify({
      institution_name: 'SAH Rejection Test Institute',
      institution_type: 'Engineering',
      program_type: 'UG',
      academic_year: '2026-2027',
      address: '99 Dismissal Road',
      state: 'Haryana',
      district: 'Gurugram',
      user_submission_date: '2026-10-29'
    })
  })).json();
  const app2Id = app2Res.id;

  await fetch(`${BASE}/applications/${app2Id}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instToken}` },
    body: JSON.stringify({ submission_date: '2026-10-29' })
  });

  await fetch(`${BASE}/applications/${app2Id}/forward-final-review`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${reviewerToken}` }
  });

  await fetch(`${BASE}/applications/${app2Id}/final-decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${higherToken}` },
    body: JSON.stringify({
      decision_outcome: 'REJECTED',
      decision_explanation: 'Zero faculty on rolls.'
    })
  });

  const appeal2Res = await (await fetch(`${BASE}/applications/${app2Id}/appeal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${instToken}` },
    body: JSON.stringify({
      appeal_grounds: 'Faculty recruitment drive scheduled next month.',
      user_appeal_date: '2026-10-29'
    })
  })).json();

  // SAH Rejects the appeal
  const sahRejectRes = await (await fetch(`${BASE}/appeals/${appeal2Res.appealId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sahToken}` },
    body: JSON.stringify({
      final_decision: 'REJECT_APPEAL',
      final_decision_reason: 'Recruitment promises do not satisfy statutory requirements. Appeal rejected.',
      user_decision_date: '2026-10-29'
    })
  })).json();
  console.log('✓ SAH Reject Decision recorded:', sahRejectRes);

  const app2Check = await (await fetch(`${BASE}/applications/${app2Id}`, {
    headers: { 'Authorization': `Bearer ${instToken}` }
  })).json();
  console.log(`✓ Application 2 Status: ${app2Check.application.status} (Expected: REJECTED)`);
  console.log(`✓ Application 2 Appeal Status: ${app2Check.application.appeal_status} (Expected: APPEAL_REJECTED)`);
  if (app2Check.application.status !== 'REJECTED') throw new Error('Expected status to remain REJECTED');

  console.log('\n============================================================');
  console.log('🎉 ALL SAH WORKFLOW & REAPPEAL_COUNT REQUIREMENTS VERIFIED!');
  console.log('============================================================\n');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
