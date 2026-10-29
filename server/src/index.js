// index.js - Main Express Application Server & REST API for AICTE FlowTrack
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { db } = require('./database');
const { generateToken, authenticateToken, requireRole } = require('./middleware');
const { logAudit, getAuditLogs } = require('./auditService');
const { createNotification, getNotificationsForUser, markAsRead, markAllAsRead } = require('./notificationService');
const { calculateDeadline, getPolicyForTaskType } = require('./deadlineService');
const { findEligibleWorkerForRole, getActiveTaskCountForUser, getWorkloadSnapshot } = require('./allocationService');
const { createTaskWithAllocation, reassignTask, authoriseDeadlineExtension } = require('./workflowEngine');
const { runOverdueAndEscalationCheck } = require('./escalationService');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Serve static uploaded files
const uploadsDir = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Serve built React client if available
const clientDistDir = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
}

// Run periodic overdue and escalation check every 60 seconds
setInterval(() => {
  try {
    runOverdueAndEscalationCheck();
  } catch (err) {
    console.error('Error during periodic escalation check:', err.message);
  }
}, 60000);

// ==========================================
// 1. AUTHENTICATION & DEMO LOGIN
// ==========================================

// List demo users for 1-click switch in UI
app.get('/api/auth/demo-users', (req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, role, organization, is_available 
    FROM users 
    WHERE is_demo = 1
    ORDER BY 
      CASE role 
        WHEN 'INSTITUTION' THEN 1
        WHEN 'REVIEWER' THEN 2
        WHEN 'EVC' THEN 3
        WHEN 'SHC_SAH' THEN 4
        WHEN 'HIGHER_OFFICER' THEN 5
      END, id ASC
  `).all();
  res.json({ users });
});

// Demo switch login (Instant login for synthetic accounts)
app.post('/api/auth/demo-login', (req, res) => {
  const { userId } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Demo user not found' });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organization: user.organization
    }
  });
});

// Standard credential login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organization: user.organization
    }
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, organization, is_available FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// ==========================================
// 2. NOTIFICATIONS & AUDIT LOGS
// ==========================================

app.get('/api/notifications', authenticateToken, (req, res) => {
  const notifs = getNotificationsForUser(req.user.id);
  res.json({ notifications: notifs });
});

app.post('/api/notifications/:id/read', authenticateToken, (req, res) => {
  markAsRead(req.params.id, req.user.id);
  res.json({ success: true });
});

app.post('/api/notifications/read-all', authenticateToken, (req, res) => {
  markAllAsRead(req.user.id);
  res.json({ success: true });
});

app.get('/api/audit-logs', authenticateToken, (req, res) => {
  const { entityId, limit } = req.query;
  const logs = getAuditLogs(entityId || null, limit ? parseInt(limit) : 50);
  res.json({ logs });
});

// ==========================================
// 3. WORKFLOW ROUTES & POLICIES
// ==========================================

app.get('/api/workflow-routes', authenticateToken, (req, res) => {
  const routes = db.prepare('SELECT * FROM workflow_routes WHERE is_active = 1').all();
  res.json({
    routes: routes.map(r => ({
      ...r,
      stages: JSON.parse(r.stages_json)
    }))
  });
});

app.get('/api/deadline-policies', authenticateToken, (req, res) => {
  const policies = db.prepare('SELECT * FROM deadline_policies WHERE is_active = 1').all();
  res.json({ policies });
});

// Update policy configuration (HIGHER_OFFICER only)
app.put('/api/deadline-policies/:id', authenticateToken, requireRole('HIGHER_OFFICER'), (req, res) => {
  const { id } = req.params;
  const { base_duration_small, base_duration_medium, base_duration_large, workload_buffer_per_task, max_allowed_duration } = req.body;

  const current = db.prepare('SELECT * FROM deadline_policies WHERE id = ?').get(id);
  if (!current) {
    return res.status(404).json({ error: 'Policy not found' });
  }

  db.prepare(`
    UPDATE deadline_policies 
    SET base_duration_small = ?, base_duration_medium = ?, base_duration_large = ?,
        workload_buffer_per_task = ?, max_allowed_duration = ?, version = version + 1
    WHERE id = ?
  `).run(base_duration_small, base_duration_medium, base_duration_large, workload_buffer_per_task, max_allowed_duration, id);

  logAudit({
    eventType: 'POLICY_UPDATED',
    entityType: 'POLICY',
    entityId: id,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    previousValue: current,
    newValue: req.body,
    reason: 'Administrative policy adjustment'
  });

  res.json({ success: true, message: 'Deadline policy updated successfully' });
});

// ==========================================
// 4. INSTITUTION APPLICATION SUBMISSION & TRACKING
// ==========================================

// Get applications with role-based filtering
app.get('/api/applications', authenticateToken, (req, res) => {
  let query = 'SELECT * FROM applications';
  const params = [];

  // Institution users can strictly only view their own sent applications
  if (req.user.role === 'INSTITUTION') {
    query += ' WHERE institution_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'EVC' || req.user.role === 'SHC_SAH') {
    // EVC and SHC officers must only view applications where tasks are allotted to them
    query = `
      SELECT DISTINCT a.* FROM applications a
      JOIN tasks t ON t.application_id = a.id
      WHERE t.assignee_id = ?
    `;
    params.push(req.user.id);
  }
  // REVIEWER and HIGHER_OFFICER can view all applications

  query += ' ORDER BY created_at DESC';
  const applications = db.prepare(query).all(...params);
  res.json({ applications });
});

// Get single application with related documents, clarifications, tasks, and audit events
app.get('/api/applications/:id', authenticateToken, (req, res) => {
  const appRecord = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!appRecord) {
    return res.status(404).json({ error: 'Application not found' });
  }

  // Access check for institution: strictly their own applications
  if (req.user.role === 'INSTITUTION' && appRecord.institution_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: Institutions can only view their own applications.' });
  }

  // Access check for EVC and SHC_SAH officers: must be allotted to this application
  if (req.user.role === 'EVC' || req.user.role === 'SHC_SAH') {
    const hasAssignedTask = db.prepare(`
      SELECT COUNT(*) as count FROM tasks 
      WHERE application_id = ? AND assignee_id = ?
    `).get(req.params.id, req.user.id);

    if (!hasAssignedTask || hasAssignedTask.count === 0) {
      return res.status(403).json({ error: 'Access denied: Officers can only access applications where work is allotted to them.' });
    }
  }

  const documents = db.prepare('SELECT * FROM application_documents WHERE application_id = ? ORDER BY uploaded_at ASC').all(req.params.id);
  const clarifications = db.prepare(`
    SELECT c.*, u.name as requested_by_name 
    FROM clarification_requests c 
    JOIN users u ON c.requested_by = u.id 
    WHERE c.application_id = ? 
    ORDER BY c.requested_at DESC
  `).all(req.params.id);

  let tasksQuery = `
    SELECT t.*, u.name as assignee_name, u.role as assignee_role
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    WHERE t.application_id = ?
  `;

  // Strict task visibility:
  // - EVC and SHC_SAH officers must ONLY view the task alloted to them
  // - Institutions cannot view internal officer allocation tasks
  // - REVIEWER and HIGHER_OFFICER can view all tasks
  if (req.user.role === 'EVC' || req.user.role === 'SHC_SAH') {
    tasksQuery += " AND t.assignee_id = '" + req.user.id + "'";
  } else if (req.user.role === 'INSTITUTION') {
    tasksQuery += " AND 1=0"; // Hide internal officer task breakdown from institution
  }

  tasksQuery += ' ORDER BY t.created_at ASC';
  const tasks = db.prepare(tasksQuery).all(req.params.id);

  // Parse route stages if route assigned
  let route = null;
  if (appRecord.assigned_route_id) {
    route = db.prepare('SELECT * FROM workflow_routes WHERE id = ?').get(appRecord.assigned_route_id);
    if (route) {
      route.stages = JSON.parse(route.stages_json);
    }
  }

  res.json({
    application: appRecord,
    route,
    documents,
    clarifications,
    tasks
  });
});

// Institution Creates Application (Draft)
app.post('/api/applications', authenticateToken, requireRole('INSTITUTION'), (req, res) => {
  const {
    institution_type,
    program_type,
    academic_year = '2026-2027',
    address,
    state,
    district
  } = req.body;

  if (!institution_type || !program_type || !address || !state || !district) {
    return res.status(400).json({ error: 'All institution and program fields are mandatory' });
  }

  const id = 'APP-' + crypto.randomUUID();
  const application_no = `AICTE-2026-${institution_type.substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;

  db.prepare(`
    INSERT INTO applications (
      id, application_no, institution_id, institution_name, institution_type,
      program_type, academic_year, address, state, district, status, current_stage, completeness_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 'SUBMISSION', 'PENDING')
  `).run(
    id, application_no, req.user.id, req.user.name, institution_type,
    program_type, academic_year, address, state, district
  );

  logAudit({
    eventType: 'APPLICATION_CREATED_DRAFT',
    entityType: 'APPLICATION',
    entityId: id,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: { application_no, institution_type, program_type }
  });

  res.json({ success: true, id, application_no });
});

// Document Upload for Application (Supporting documents)
app.post('/api/applications/:id/documents', authenticateToken, (req, res) => {
  const { 
    document_category, 
    document_name, 
    file_path, 
    file_size, 
    mime_type, 
    is_clarification_upload, 
    clarification_request_id,
    appeal_id 
  } = req.body;
  const appId = req.params.id;

  const appRecord = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
  if (!appRecord) {
    return res.status(404).json({ error: 'Application not found' });
  }

  if (req.user.role === 'INSTITUTION' && appRecord.institution_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const docId = 'DOC-' + crypto.randomUUID();
  db.prepare(`
    INSERT INTO application_documents (
      id, application_id, document_category, document_name, file_path, file_size, mime_type,
      review_status, is_clarification_upload, clarification_request_id, appeal_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
  `).run(
    docId, appId, document_category, document_name,
    file_path || `/uploads/${document_name}`,
    file_size || 102400,
    mime_type || 'application/pdf',
    is_clarification_upload ? 1 : 0,
    clarification_request_id || null,
    appeal_id || null
  );

  logAudit({
    eventType: 'DOCUMENT_UPLOADED',
    entityType: 'DOCUMENT',
    entityId: docId,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: { document_name, document_category, appId, appeal_id }
  });

  res.json({ success: true, docId });
});

// Document view with role-based access control and audit logging
app.get('/api/documents/:id/view', authenticateToken, (req, res) => {
  const doc = db.prepare(`
    SELECT d.*, a.institution_id, a.application_no
    FROM application_documents d
    JOIN applications a ON d.application_id = a.id
    WHERE d.id = ?
  `).get(req.params.id);

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Permission check:
  // - REVIEWER and HIGHER_OFFICER: all documents
  // - INSTITUTION: only documents for their own applications
  // - EVC, SHC_SAH: only if allocated a task for this application
  // - SAC: only if assigned to appeal for this application
  let allowed = false;
  if (req.user.role === 'REVIEWER' || req.user.role === 'HIGHER_OFFICER') {
    allowed = true;
  } else if (req.user.role === 'INSTITUTION' && doc.institution_id === req.user.id) {
    allowed = true;
  } else if (req.user.role === 'EVC' || req.user.role === 'SHC_SAH') {
    const taskAssigned = db.prepare(`
      SELECT id FROM tasks 
      WHERE application_id = ? AND assignee_id = ?
    `).get(doc.application_id, req.user.id);
    if (taskAssigned) allowed = true;
  } else if (req.user.role === 'SAC') {
    const sacAssigned = db.prepare(`
      SELECT id FROM sac_appeals 
      WHERE application_id = ? AND assigned_sac_id = ?
    `).get(doc.application_id, req.user.id);
    if (sacAssigned) allowed = true;
  }

  if (!allowed) {
    return res.status(403).json({ error: 'Access denied: You do not have permission to view this document.' });
  }

  // Audit document access
  logAudit({
    eventType: 'DOCUMENT_ACCESSED',
    entityType: 'DOCUMENT',
    entityId: doc.id,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: { document_name: doc.document_name, document_category: doc.document_category, application_id: doc.application_id }
  });

  res.json({
    success: true,
    document: doc,
    access_granted: true,
    view_url: doc.file_path
  });
});

// Submit Application (Stage 1 Automated Completeness Check)
app.post('/api/applications/:id/submit', authenticateToken, requireRole('INSTITUTION'), (req, res) => {
  const appId = req.params.id;
  const { submission_date } = req.body;

  if (!submission_date) {
    return res.status(400).json({ error: 'Application submission date is mandatory.' });
  }

  const appRecord = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);

  if (!appRecord || appRecord.institution_id !== req.user.id) {
    return res.status(404).json({ error: 'Application not found or unauthorized' });
  }

  // Automated completeness check (Fields & minimum supporting documents check)
  const docs = db.prepare('SELECT document_category FROM application_documents WHERE application_id = ?').all(appId);
  const docCategories = docs.map(d => d.document_category);

  // Check required document categories for submission
  const requiredCategories = ['LAND_TITLE', 'FIRE_SAFETY', 'FACULTY_LIST'];
  const missingCategories = requiredCategories.filter(cat => !docCategories.includes(cat));

  if (missingCategories.length > 0) {
    return res.status(400).json({
      error: `Automated Completeness Check Failed: Missing mandatory document categories: ${missingCategories.join(', ')}. Note: This is an administrative completeness check, not regulatory certification.`
    });
  }

  // Update application to SUBMITTED
  db.prepare(`
    UPDATE applications 
    SET status = 'SUBMITTED', current_stage = 'DOCUMENT_REVIEW',
        completeness_status = 'COMPLETE',
        completeness_notes = 'Automated administrative check verified mandatory fields and core uploads present.',
        user_submission_date = ?,
        submitted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(submission_date, appId);

  // Notify Reviewing Officers
  const reviewers = db.prepare("SELECT id FROM users WHERE role = 'REVIEWER'").all();
  for (const rev of reviewers) {
    createNotification({
      recipientId: rev.id,
      eventType: 'APPLICATION_SUBMITTED',
      title: `New Application Submitted: ${appRecord.application_no}`,
      message: `${appRecord.institution_name} submitted application ${appRecord.application_no} for ${appRecord.program_type}. Awaiting manual document review.`,
      relatedEntityType: 'APPLICATION',
      relatedEntityId: appId
    });
  }

  // Confirmation to Institution
  createNotification({
    recipientId: req.user.id,
    eventType: 'SUBMISSION_CONFIRMED',
    title: `Submission Received: ${appRecord.application_no}`,
    message: `Your application has passed initial automated completeness verification and is placed in the Reviewing Officer queue.`,
    relatedEntityType: 'APPLICATION',
    relatedEntityId: appId
  });

  logAudit({
    eventType: 'APPLICATION_SUBMITTED',
    entityType: 'APPLICATION',
    entityId: appId,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: { status: 'SUBMITTED', completeness: 'COMPLETE' }
  });

  res.json({ success: true, message: 'Application submitted successfully' });
});

// ==========================================
// 5. MANUAL DOCUMENT REVIEW & CLARIFICATION LOOP (REVIEWER)
// ==========================================

// Mark Document Review Status
app.post('/api/documents/:id/review', authenticateToken, requireRole('REVIEWER'), (req, res) => {
  const { review_status, review_notes } = req.body;
  const doc = db.prepare('SELECT * FROM application_documents WHERE id = ?').get(req.params.id);
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  db.prepare(`
    UPDATE application_documents 
    SET review_status = ?, review_notes = ?, reviewed_by = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).run(review_status, review_notes, req.user.name, req.params.id);

  logAudit({
    eventType: 'DOCUMENT_REVIEWED',
    entityType: 'DOCUMENT',
    entityId: req.params.id,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    previousValue: { review_status: doc.review_status },
    newValue: { review_status, review_notes }
  });

  res.json({ success: true });
});

// Reviewer Requests Clarification from Institution
app.post('/api/applications/:id/request-clarification', authenticateToken, requireRole('REVIEWER'), (req, res) => {
  const { request_details, specific_documents_required, target_deadline_days = 5 } = req.body;
  const appId = req.params.id;

  const appRecord = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
  if (!appRecord) {
    return res.status(404).json({ error: 'Application not found' });
  }

  const targetDeadline = new Date(Date.now() + target_deadline_days * 24 * 60 * 60 * 1000).toISOString();
  const clarifId = 'CLR-' + crypto.randomUUID();

  db.prepare(`
    INSERT INTO clarification_requests (
      id, application_id, request_details, specific_documents_required, requested_by,
      target_deadline, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN')
  `).run(clarifId, appId, request_details, specific_documents_required, req.user.id, targetDeadline);

  db.prepare(`
    UPDATE applications 
    SET status = 'AWAITING_CLARIFICATION', current_stage = 'CLARIFICATION', updated_at = datetime('now')
    WHERE id = ?
  `).run(appId);

  // Notify Institution
  createNotification({
    recipientId: appRecord.institution_id,
    eventType: 'CLARIFICATION_REQUESTED',
    title: `Action Required: Clarification Requested for ${appRecord.application_no}`,
    message: `Reviewing officer requested clarification: "${request_details}". Response deadline: ${new Date(targetDeadline).toLocaleDateString()}.`,
    relatedEntityType: 'CLARIFICATION',
    relatedEntityId: clarifId
  });

  logAudit({
    eventType: 'CLARIFICATION_REQUESTED',
    entityType: 'APPLICATION',
    entityId: appId,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: { request_details, targetDeadline }
  });

  res.json({ success: true, clarifId, targetDeadline });
});

// Institution Responds to Clarification
app.post('/api/clarifications/:id/respond', authenticateToken, requireRole('INSTITUTION'), (req, res) => {
  const { response_text } = req.body;
  const clarif = db.prepare('SELECT * FROM clarification_requests WHERE id = ?').get(req.params.id);
  if (!clarif) {
    return res.status(404).json({ error: 'Clarification request not found' });
  }

  const appRecord = db.prepare('SELECT * FROM applications WHERE id = ?').get(clarif.application_id);
  if (appRecord.institution_id !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  db.prepare(`
    UPDATE clarification_requests 
    SET response_text = ?, responded_at = datetime('now'), responded_by = ?, status = 'RESPONDED'
    WHERE id = ?
  `).run(response_text, req.user.name, req.params.id);

  db.prepare(`
    UPDATE applications 
    SET status = 'CLARIFICATION_SUBMITTED', current_stage = 'DOCUMENT_REVIEW', updated_at = datetime('now')
    WHERE id = ?
  `).run(clarif.application_id);

  // Notify Reviewing Officer
  createNotification({
    recipientId: clarif.requested_by,
    eventType: 'CLARIFICATION_RESPONDED',
    title: `Clarification Responded: ${appRecord.application_no}`,
    message: `${appRecord.institution_name} has submitted its clarification response.`,
    relatedEntityType: 'CLARIFICATION',
    relatedEntityId: req.params.id
  });

  logAudit({
    eventType: 'CLARIFICATION_SUBMITTED',
    entityType: 'CLARIFICATION',
    entityId: req.params.id,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: { response_text }
  });

  res.json({ success: true, message: 'Clarification response submitted' });
});

// ==========================================
// 6. WORKFLOW ROUTE SELECTION (REVIEWER ONLY)
// ==========================================

app.post('/api/applications/:id/select-route', authenticateToken, requireRole('REVIEWER'), (req, res) => {
  const { 
    route_id, 
    route_selection_reason,
    evc_task_extent,
    evc_extent_reason,
    shc_task_extent,
    shc_extent_reason
  } = req.body;
  const appId = req.params.id;

  if (!route_id || !route_selection_reason) {
    return res.status(400).json({ error: 'Route selection and explicit justification reason are mandatory.' });
  }

  const route = db.prepare('SELECT * FROM workflow_routes WHERE id = ?').get(route_id);
  if (!route) {
    return res.status(404).json({ error: 'Invalid workflow route' });
  }

  const appRecord = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
  if (!appRecord) {
    return res.status(404).json({ error: 'Application not found' });
  }

  // Prevent workflow route from being submitted twice for the same application/task
  if (appRecord.assigned_route_id) {
    return res.status(400).json({ 
      error: 'Workflow route has already been assigned for this application and cannot be submitted twice.' 
    });
  }

  const stages = JSON.parse(route.stages_json);

  // Validate required task assessment fields for each stage included in the route
  if (stages.includes('EVC')) {
    if (!evc_task_extent || !evc_extent_reason) {
      return res.status(400).json({ 
        error: 'EVC task extent (Small/Medium/Large) and justification reason are mandatory for routes including EVC.' 
      });
    }
  }

  if (stages.includes('SHC_SAH')) {
    if (!shc_task_extent || !shc_extent_reason) {
      return res.status(400).json({ 
        error: 'SHC/SAH task extent (Small/Medium/Large) and justification reason are mandatory for routes including SHC/SAH.' 
      });
    }
  }

  // Update application with route and separate stage assessments
  db.prepare(`
    UPDATE applications 
    SET assigned_route_id = ?, route_selection_reason = ?, route_selected_by = ?,
        route_selected_at = datetime('now'), route_version = route_version + 1,
        evc_task_extent = ?, evc_extent_reason = ?,
        shc_task_extent = ?, shc_extent_reason = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    route_id, 
    route_selection_reason, 
    req.user.name, 
    evc_task_extent || null, 
    evc_extent_reason || null,
    shc_task_extent || null, 
    shc_extent_reason || null,
    appId
  );

  let allocatedTask = null;
  let nextStatus = 'ROUTE_ASSIGNED';
  let nextStage = 'FINAL_REVIEW';
  let stageStates = {};

  // Sequential execution logic:
  // 1. If route includes EVC, execute EVC first! (SHC/SAH remains pending activation until EVC report acceptance)
  if (stages.includes('EVC')) {
    nextStage = 'EVC';
    nextStatus = 'IN_EVC';
    stageStates = stages.includes('SHC_SAH') 
      ? { EVC: 'ACTIVE', SHC_SAH: 'PENDING_ACTIVATION' } 
      : { EVC: 'ACTIVE' };

    try {
      allocatedTask = createTaskWithAllocation({
        applicationId: appId,
        taskType: 'EVC',
        taskExtent: evc_task_extent,
        extentReason: evc_extent_reason,
        scopeIndicators: { stage: 'EVC', routeCode: route.code },
        assessedBy: req.user.id,
        actorName: req.user.name,
        actorRole: req.user.role
      });
    } catch (err) {
      return res.status(500).json({ error: `EVC allocation failed: ${err.message}` });
    }
  } else if (stages.includes('SHC_SAH')) {
    // 2. If route includes SHC_SAH only (no EVC)
    nextStage = 'SHC_SAH';
    nextStatus = 'IN_SHC_SAH';
    stageStates = { SHC_SAH: 'ACTIVE' };

    try {
      allocatedTask = createTaskWithAllocation({
        applicationId: appId,
        taskType: 'SHC_SAH',
        taskExtent: shc_task_extent,
        extentReason: shc_extent_reason,
        scopeIndicators: { stage: 'SHC_SAH', routeCode: route.code },
        assessedBy: req.user.id,
        actorName: req.user.name,
        actorRole: req.user.role
      });
    } catch (err) {
      return res.status(500).json({ error: `SHC/SAH allocation failed: ${err.message}` });
    }
  } else {
    // 3. Scrutiny only (Administrative / routine pathway)
    nextStage = 'FINAL_REVIEW';
    nextStatus = 'READY_FOR_FINAL_REVIEW';
    stageStates = { SCRUTINY: 'COMPLETED' };
  }

  // Update application status and current stage
  db.prepare(`
    UPDATE applications 
    SET status = ?, current_stage = ?, stage_states_json = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(nextStatus, nextStage, JSON.stringify(stageStates), appId);

  logAudit({
    eventType: 'WORKFLOW_ROUTE_SELECTED',
    entityType: 'APPLICATION',
    entityId: appId,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    previousValue: { routeId: appRecord.assigned_route_id },
    newValue: { 
      routeId: route_id, 
      routeCode: route.code, 
      stages, 
      evcExtent: evc_task_extent, 
      shcExtent: shc_task_extent,
      allocatedTask: allocatedTask ? allocatedTask.taskNumber : null,
      assigneeName: allocatedTask?.assignee?.name,
      allocationReason: allocatedTask?.allocationReason
    },
    reason: route_selection_reason
  });

  res.json({ 
    success: true, 
    route, 
    nextStage, 
    nextStatus,
    allocatedTask,
    stageStates
  });
});

// ==========================================
// 7. TASK CREATION, SIZING & WORKLOAD ALLOCATION
// ==========================================

// Get tasks list (with strict profile boundary enforcement)
app.get('/api/tasks', authenticateToken, (req, res) => {
  let query = `
    SELECT t.*, u.name as assignee_name, u.role as assignee_role,
           a.application_no, a.institution_name, a.institution_type, a.program_type
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN applications a ON t.application_id = a.id
  `;
  const params = [];

  if (req.user.role === 'EVC' || req.user.role === 'SHC_SAH') {
    // EVC and SHC members can strictly ONLY view tasks alloted to them
    query += ' WHERE t.assignee_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'INSTITUTION') {
    // Institutions cannot view tasks list
    return res.json({ tasks: [] });
  }
  // REVIEWER and HIGHER_OFFICER can view all tasks

  query += ' ORDER BY t.created_at DESC';
  const tasks = db.prepare(query).all(...params);
  res.json({ tasks });
});

// Pre-flight deadline preview endpoint
app.post('/api/tasks/preview-deadline', authenticateToken, requireRole('REVIEWER', 'HIGHER_OFFICER'), (req, res) => {
  const { taskType, taskExtent } = req.body;
  const eligibleWorker = findEligibleWorkerForRole(taskType === 'EVC' ? 'EVC' : 'SHC_SAH');
  const activeCount = eligibleWorker ? eligibleWorker.active_task_count : 0;

  const result = calculateDeadline({
    taskType,
    taskExtent,
    activeTasksBeforeAssignment: activeCount
  });

  res.json({
    eligibleWorker,
    deadlineCalculation: result
  });
});

// Reviewing Officer confirms task extent assessment & allocates task
app.post('/api/applications/:id/create-task', authenticateToken, requireRole('REVIEWER'), (req, res) => {
  const { taskType, taskExtent, extentReason, scopeIndicators } = req.body;
  const appId = req.params.id;

  if (!taskType || !taskExtent || !extentReason) {
    return res.status(400).json({ error: 'Task type, task extent (SMALL/MEDIUM/LARGE), and assessment reason are mandatory.' });
  }

  try {
    const outcome = createTaskWithAllocation({
      applicationId: appId,
      taskType,
      taskExtent,
      extentReason,
      scopeIndicators: scopeIndicators || {},
      assessedBy: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role
    });

    res.json({ success: true, outcome });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get task details by ID
app.get('/api/tasks/:id', authenticateToken, (req, res) => {
  const task = db.prepare(`
    SELECT t.*, u.name as assignee_name, u.email as assignee_email, u.role as assignee_role,
           a.application_no, a.institution_name, a.institution_type, a.program_type
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN applications a ON t.application_id = a.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  // Access control: EVC or SHC_SAH can only open their own tasks
  if (req.user.role === 'EVC' && task.assignee_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied to this task' });
  }
  if (req.user.role === 'SHC_SAH' && task.assignee_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied to this task' });
  }

  const reports = db.prepare('SELECT * FROM task_reports WHERE task_id = ? ORDER BY version DESC').all(req.params.id);
  const reassignments = db.prepare(`
    SELECT r.*, prev.name as prev_name, nxt.name as next_name, u.name as reassigned_by_name
    FROM task_reassignments r
    LEFT JOIN users prev ON r.previous_assignee_id = prev.id
    JOIN users nxt ON r.new_assignee_id = nxt.id
    JOIN users u ON r.reassigned_by = u.id
    WHERE r.task_id = ?
    ORDER BY r.reassigned_at DESC
  `).all(req.params.id);

  const extensions = db.prepare(`
    SELECT e.*, req.name as requester_name, app.name as approver_name
    FROM deadline_extensions e
    JOIN users req ON e.requested_by = req.id
    LEFT JOIN users app ON e.approved_by = app.id
    WHERE e.task_id = ?
    ORDER BY e.created_at DESC
  `).all(req.params.id);

  res.json({
    task,
    reports,
    reassignments,
    extensions
  });
});

// Update Task Progress
app.post('/api/tasks/:id/status', authenticateToken, requireRole('EVC', 'SHC_SAH', 'REVIEWER', 'HIGHER_OFFICER'), (req, res) => {
  const { status } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if ((req.user.role === 'EVC' || req.user.role === 'SHC_SAH') && task.assignee_id !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized to update this task' });
  }

  db.prepare(`
    UPDATE tasks 
    SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, req.params.id);

  logAudit({
    eventType: 'TASK_STATUS_UPDATED',
    entityType: 'TASK',
    entityId: req.params.id,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    previousValue: { status: task.status },
    newValue: { status }
  });

  res.json({ success: true });
});

// Submit Task Report
app.post('/api/tasks/:id/submit-report', authenticateToken, requireRole('EVC', 'SHC_SAH'), (req, res) => {
  const {
    scheduled_date,
    conducted_date,
    submission_date,
    venue_mode,
    observations,
    deficiencies_noted,
    recommendation,
    report_data
  } = req.body;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task || task.assignee_id !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized or task not found' });
  }

  if (!observations || !recommendation) {
    return res.status(400).json({ error: 'Observations and formal recommendation are mandatory' });
  }

  const reportId = 'REP-' + crypto.randomUUID();
  const reportType = task.task_type === 'EVC' ? 'EVC_REPORT' : 'SHC_SAH_RECORD';
  const effectiveSubmissionDate = submission_date || new Date().toISOString().split('T')[0];

  db.prepare(`
    INSERT INTO task_reports (
      id, task_id, report_type, scheduled_date, conducted_date, venue_mode,
      observations, deficiencies_noted, recommendation, report_data_json,
      submitted_by, user_submission_date, review_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED')
  `).run(
    reportId, req.params.id, reportType, scheduled_date || null, conducted_date || null,
    venue_mode || 'Physical On-Site', observations, deficiencies_noted || 'None',
    recommendation, report_data ? JSON.stringify(report_data) : null, req.user.id,
    effectiveSubmissionDate
  );

  // Update task status to SUBMITTED
  db.prepare(`
    UPDATE tasks 
    SET status = 'SUBMITTED', updated_at = datetime('now')
    WHERE id = ?
  `).run(req.params.id);

  // Notify Higher-Level Officers & Reviewing Officers
  // For EVC reports, Higher-Level Officer must review and accept
  const recipients = db.prepare("SELECT id, role FROM users WHERE role IN ('HIGHER_OFFICER', 'REVIEWER')").all();
  for (const r of recipients) {
    createNotification({
      recipientId: r.id,
      eventType: 'REPORT_SUBMITTED',
      title: `${reportType} Submitted for ${task.task_number}`,
      message: `${req.user.name} submitted inspection/hearing report on ${effectiveSubmissionDate}. ${reportType === 'EVC_REPORT' ? 'Awaiting Higher-Level Officer acceptance.' : 'Awaiting review.'}`,
      relatedEntityType: 'TASK',
      relatedEntityId: req.params.id
    });
  }

  logAudit({
    eventType: 'TASK_REPORT_SUBMITTED',
    entityType: 'TASK_REPORT',
    entityId: reportId,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: { recommendation, observations, submissionDate: effectiveSubmissionDate }
  });

  res.json({ success: true, reportId });
});

// Higher-Level Officer reviews EVC inspection reports; Reviewing Officer reviews SHC reports
app.post('/api/reports/:id/review', authenticateToken, requireRole('REVIEWER', 'HIGHER_OFFICER'), (req, res) => {
  const { review_status, review_feedback } = req.body;
  const report = db.prepare('SELECT * FROM task_reports WHERE id = ?').get(req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  // Requirement: Higher-level officer—not the reviewing officer—must review and accept or return EVC inspection report
  if (report.report_type === 'EVC_REPORT' && req.user.role !== 'HIGHER_OFFICER') {
    return res.status(403).json({ 
      error: 'Access denied: Only Higher-Level Officer has regulatory authority to review, accept, or return EVC inspection reports. Reviewing Officer may view only.' 
    });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(report.task_id);

  db.prepare(`
    UPDATE task_reports 
    SET review_status = ?, review_feedback = ?, reviewed_by = ?, reviewed_at = datetime('now')
    WHERE id = ?
  `).run(review_status, review_feedback, req.user.name, req.params.id);

  if (review_status === 'ACCEPTED') {
    db.prepare(`
      UPDATE tasks 
      SET status = 'COMPLETED', completed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(report.task_id);

    // Notify Officer of acceptance
    createNotification({
      recipientId: report.submitted_by,
      eventType: 'REPORT_ACCEPTED',
      title: `Report Accepted: ${task.task_number}`,
      message: `Your submitted ${report.report_type} was accepted by ${req.user.name} (${req.user.role === 'HIGHER_OFFICER' ? 'Higher-Level Officer' : 'Reviewing Officer'}).`,
      relatedEntityType: 'TASK',
      relatedEntityId: task.id
    });

    // Sequential Workflow Progression
    const appRecord = db.prepare('SELECT * FROM applications WHERE id = ?').get(task.application_id);
    let routeStages = [];
    if (appRecord && appRecord.assigned_route_id) {
      const route = db.prepare('SELECT * FROM workflow_routes WHERE id = ?').get(appRecord.assigned_route_id);
      if (route) routeStages = JSON.parse(route.stages_json);
    }

    let nextStageActivated = null;

    if (task.task_type === 'EVC') {
      if (routeStages.includes('SHC_SAH')) {
        // Route includes SHC/SAH: check if already activated to avoid duplicate tasks
        const existingShc = db.prepare("SELECT * FROM tasks WHERE application_id = ? AND task_type = 'SHC_SAH' AND status NOT IN ('CANCELLED', 'CLOSED')").get(appRecord.id);

        if (!existingShc) {
          // Automatically activate and allocate SHC/SAH task using saved extent & current SHC officer workload at this time
          const shcOutcome = createTaskWithAllocation({
            applicationId: appRecord.id,
            taskType: 'SHC_SAH',
            taskExtent: appRecord.shc_task_extent || 'MEDIUM',
            extentReason: appRecord.shc_extent_reason || 'Sequential Standing Hearing Committee stage activated following verified EVC report acceptance',
            scopeIndicators: { stage: 'SHC_SAH', triggeredBy: 'EVC_ACCEPTANCE' },
            assessedBy: req.user.id,
            actorName: req.user.name,
            actorRole: req.user.role
          });

          nextStageActivated = shcOutcome;

          // Update application status to IN_SHC_SAH
          db.prepare(`
            UPDATE applications 
            SET status = 'IN_SHC_SAH', current_stage = 'SHC_SAH',
                stage_states_json = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(JSON.stringify({ EVC: 'COMPLETED', SHC_SAH: 'ACTIVE' }), appRecord.id);

          logAudit({
            eventType: 'SEQUENTIAL_STAGE_ACTIVATED',
            entityType: 'APPLICATION',
            entityId: appRecord.id,
            actorId: req.user.id,
            actorName: req.user.name,
            actorRole: req.user.role,
            newValue: {
              activatedStage: 'SHC_SAH',
              taskId: shcOutcome.taskId,
              taskNumber: shcOutcome.taskNumber,
              assigneeName: shcOutcome.assignee?.name,
              allocationReason: shcOutcome.allocationReason
            },
            reason: 'EVC report accepted by Higher-Level Officer; automatically activated subsequent SHC/SAH hearing stage.'
          });
        }
      } else {
        // EVC was the only committee stage in route: application is now ready for final review
        db.prepare(`
          UPDATE applications 
          SET status = 'READY_FOR_FINAL_REVIEW', current_stage = 'FINAL_REVIEW',
              stage_states_json = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(JSON.stringify({ EVC: 'COMPLETED' }), appRecord.id);
      }
    } else if (task.task_type === 'SHC_SAH') {
      // SHC/SAH was completed: all stages complete, ready for higher-level final review
      db.prepare(`
        UPDATE applications 
        SET status = 'READY_FOR_FINAL_REVIEW', current_stage = 'FINAL_REVIEW',
            stage_states_json = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify({ EVC: 'COMPLETED', SHC_SAH: 'COMPLETED' }), appRecord.id);
    }
  } else if (review_status === 'CORRECTION_REQUIRED') {
    db.prepare(`
      UPDATE tasks 
      SET status = 'RETURNED_FOR_CORRECTION', updated_at = datetime('now')
      WHERE id = ?
    `).run(report.task_id);

    // Notify Officer to correct
    createNotification({
      recipientId: report.submitted_by,
      eventType: 'REPORT_CORRECTION_REQUIRED',
      title: `Correction Required: ${task.task_number}`,
      message: `${req.user.role === 'HIGHER_OFFICER' ? 'Higher-Level Officer' : 'Reviewing Officer'} returned report for correction: "${review_feedback}". Please revise and resubmit.`,
      relatedEntityType: 'TASK',
      relatedEntityId: task.id
    });
  }

  logAudit({
    eventType: 'TASK_REPORT_REVIEWED',
    entityType: 'TASK_REPORT',
    entityId: req.params.id,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: { review_status, review_feedback, reportType: report.report_type }
  });

  res.json({ success: true, review_status });
});

// Get reports awaiting review (EVC reports for Higher Officer, SHC reports for Reviewer / Higher Officer)
app.get('/api/reports/pending-review', authenticateToken, requireRole('HIGHER_OFFICER', 'REVIEWER'), (req, res) => {
  const reports = db.prepare(`
    SELECT r.*, t.task_number, t.task_type, t.task_extent, t.assignee_id,
           u.name as submitted_by_name, u.role as submitted_by_role,
           a.id as application_id, a.application_no, a.institution_name, a.institution_type, a.program_type
    FROM task_reports r
    JOIN tasks t ON r.task_id = t.id
    JOIN users u ON r.submitted_by = u.id
    JOIN applications a ON t.application_id = a.id
    WHERE r.review_status = 'SUBMITTED'
    ORDER BY r.submitted_at ASC
  `).all();

  res.json({ reports });
});

// Reviewer forwards application for Final Review once required stages are complete
app.post('/api/applications/:id/forward-final-review', authenticateToken, requireRole('REVIEWER'), (req, res) => {
  const appId = req.params.id;
  const appRecord = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
  if (!appRecord) {
    return res.status(404).json({ error: 'Application not found' });
  }

  db.prepare(`
    UPDATE applications 
    SET status = 'READY_FOR_FINAL_REVIEW', current_stage = 'FINAL_REVIEW', updated_at = datetime('now')
    WHERE id = ?
  `).run(appId);

  // Notify Higher-Level Officer
  const higherOfficer = db.prepare("SELECT id FROM users WHERE role = 'HIGHER_OFFICER' LIMIT 1").get();
  if (higherOfficer) {
    createNotification({
      recipientId: higherOfficer.id,
      eventType: 'APPLICATION_FORWARDED_FOR_FINAL_REVIEW',
      title: `Ready for Final Review: ${appRecord.application_no}`,
      message: `Application ${appRecord.application_no} (${appRecord.institution_name}) has completed all assigned workflow stages. Submitted for explicit final regulatory review.`,
      relatedEntityType: 'APPLICATION',
      relatedEntityId: appId
    });
  }

  logAudit({
    eventType: 'APPLICATION_FORWARDED_FINAL_REVIEW',
    entityType: 'APPLICATION',
    entityId: appId,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    reason: 'Stage requirements verified complete by Reviewing Officer'
  });

  res.json({ success: true, message: 'Application forwarded for final review' });
});

// ==========================================
// 8. HIGHER-LEVEL OFFICER: DECISIONS, REASSIGNMENTS & EXTENSIONS
// ==========================================

// Explicit Final Decision by Higher-Level Officer
app.post('/api/applications/:id/final-decision', authenticateToken, requireRole('HIGHER_OFFICER'), (req, res) => {
  const { decision_outcome, decision_explanation } = req.body;
  const appId = req.params.id;

  if (!decision_outcome || !decision_explanation) {
    return res.status(400).json({ error: 'Explicit decision outcome (APPROVED/REJECTED/RETURNED_FOR_FURTHER_INFO) and explanation are mandatory.' });
  }

  const appRecord = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
  if (!appRecord) {
    return res.status(404).json({ error: 'Application not found' });
  }

  db.prepare(`
    UPDATE applications 
    SET status = ?, final_decision = ?, final_decision_reason = ?,
        final_decision_by = ?, final_decision_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(decision_outcome, decision_outcome, decision_explanation, req.user.name, appId);

  // Notify Institution of outcome
  createNotification({
    recipientId: appRecord.institution_id,
    eventType: 'FINAL_DECISION_RECORDED',
    title: `Final Decision Recorded: ${decision_outcome}`,
    message: `Final decision recorded for application ${appRecord.application_no}: ${decision_outcome}. Note: ${decision_explanation}`,
    relatedEntityType: 'APPLICATION',
    relatedEntityId: appId
  });

  logAudit({
    eventType: 'FINAL_DECISION_RECORDED',
    entityType: 'APPLICATION',
    entityId: appId,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: { decision_outcome, decision_explanation }
  });

  res.json({ success: true, decision_outcome });
});

// Reassign Task (Higher Officer)
app.post('/api/tasks/:id/reassign', authenticateToken, requireRole('HIGHER_OFFICER'), (req, res) => {
  const { newAssigneeId, reason } = req.body;
  if (!newAssigneeId || !reason) {
    return res.status(400).json({ error: 'New assignee and explicit reason are mandatory' });
  }

  try {
    const outcome = reassignTask({
      taskId: req.params.id,
      newAssigneeId,
      reason,
      actorId: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role
    });
    res.json({ success: true, outcome });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Officer Requests Deadline Extension (EVC / SHC_SAH)
app.post('/api/tasks/:id/request-extension', authenticateToken, requireRole('EVC', 'SHC_SAH'), (req, res) => {
  const { requestedDeadline, reason } = req.body;
  const taskId = req.params.id;

  if (!requestedDeadline || !reason) {
    return res.status(400).json({ error: 'Requested deadline date and reason are mandatory.' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task || task.assignee_id !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized: you can only request extension for your allotted task.' });
  }

  const previousDeadline = task.authorized_extended_due_at || task.target_due_at;
  const extId = 'EXT-' + crypto.randomUUID();

  db.prepare(`
    INSERT INTO deadline_extensions (
      id, task_id, previous_deadline, requested_deadline, reason,
      requested_by, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'))
  `).run(extId, taskId, previousDeadline, requestedDeadline, reason, req.user.id);

  // Notify Higher-Level Officer
  const higherOfficers = db.prepare("SELECT id FROM users WHERE role = 'HIGHER_OFFICER'").all();
  for (const hlo of higherOfficers) {
    createNotification({
      recipientId: hlo.id,
      eventType: 'DEADLINE_EXTENSION_REQUESTED',
      title: `Extension Request: Task ${task.task_number}`,
      message: `${req.user.name} requested deadline extension to ${new Date(requestedDeadline).toLocaleDateString()} for task ${task.task_number}. Reason: ${reason}`,
      relatedEntityType: 'TASK',
      relatedEntityId: taskId
    });
  }

  logAudit({
    eventType: 'DEADLINE_EXTENSION_REQUESTED',
    entityType: 'TASK',
    entityId: taskId,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: { requestedDeadline, reason }
  });

  res.json({ success: true, message: 'Deadline extension request submitted to Higher Officer for approval.' });
});

// Authorise Deadline Extension (Higher Officer)
app.post('/api/tasks/:id/extend-deadline', authenticateToken, requireRole('HIGHER_OFFICER'), (req, res) => {
  const { extendedDueAt, reason, extensionRequestId } = req.body;
  if (!extendedDueAt || !reason) {
    return res.status(400).json({ error: 'Extended due date and justification are mandatory' });
  }

  try {
    const outcome = authoriseDeadlineExtension({
      taskId: req.params.id,
      extendedDueAt,
      reason,
      actorId: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role,
      extensionRequestId: extensionRequestId || null
    });
    res.json({ success: true, outcome });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Reject Deadline Extension (Higher Officer)
app.post('/api/requests/:id/reject', authenticateToken, requireRole('HIGHER_OFFICER'), (req, res) => {
  const { decision_notes } = req.body;
  const extReq = db.prepare('SELECT * FROM deadline_extensions WHERE id = ?').get(req.params.id);
  if (!extReq) {
    return res.status(404).json({ error: 'Extension request not found' });
  }

  db.prepare(`
    UPDATE deadline_extensions 
    SET status = 'REJECTED', approved_by = ?, approved_at = datetime('now'), decision_notes = ?
    WHERE id = ?
  `).run(req.user.id, decision_notes || 'Extension request rejected by Higher Officer', req.params.id);

  // Notify requester
  createNotification({
    recipientId: extReq.requested_by,
    eventType: 'DEADLINE_EXTENSION_REJECTED',
    title: 'Extension Request Rejected',
    message: `Your deadline extension request was rejected by ${req.user.name}. Reason: ${decision_notes || 'Regulatory timeline requirements'}`,
    relatedEntityType: 'TASK',
    relatedEntityId: extReq.task_id
  });

  res.json({ success: true, message: 'Request rejected' });
});

// Get all deadline extension requests for Higher-Level Officer
app.get('/api/requests/extensions', authenticateToken, requireRole('HIGHER_OFFICER'), (req, res) => {
  const requests = db.prepare(`
    SELECT e.*, req.name as requester_name, req.role as requester_role, req.email as requester_email,
           app.name as approver_name,
           t.task_number, t.task_type, t.target_due_at, t.authorized_extended_due_at,
           a.application_no, a.institution_name
    FROM deadline_extensions e
    JOIN users req ON e.requested_by = req.id
    LEFT JOIN users app ON e.approved_by = app.id
    JOIN tasks t ON e.task_id = t.id
    JOIN applications a ON t.application_id = a.id
    ORDER BY 
      CASE e.status WHEN 'PENDING' THEN 1 ELSE 2 END,
      e.created_at DESC
  `).all();

  res.json({ requests });
});

// ==========================================
// SAC APPEALS & HEARINGS
// ==========================================

// Submit SAC Appeal (Institution only, for rejected applications)
app.post('/api/applications/:id/appeal', authenticateToken, requireRole('INSTITUTION'), (req, res) => {
  const appId = req.params.id;
  const { appeal_grounds, user_appeal_date, supporting_documents } = req.body;

  if (!appeal_grounds || !user_appeal_date) {
    return res.status(400).json({ error: 'Appeal grounds and appeal submission date are mandatory.' });
  }

  const appRecord = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
  if (!appRecord) {
    return res.status(404).json({ error: 'Application not found.' });
  }
  if (appRecord.institution_id !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized to appeal this application.' });
  }
  if (appRecord.final_decision !== 'REJECTED') {
    return res.status(400).json({ error: 'Appeals through SAC/SAH can only be submitted for applications with a final REJECTED decision.' });
  }

  // Statutory limit: at most once per application
  if ((appRecord.reappeal_count || 0) >= 1) {
    return res.status(400).json({ error: 'Statutory limit reached: Each institution can reappeal at most once per application. Reappeal count is already 1.' });
  }

  // Check if an active appeal already exists
  const existingAppeal = db.prepare("SELECT * FROM sac_appeals WHERE application_id = ? AND status NOT IN ('CLOSED', 'DECIDED')").get(appId);
  if (existingAppeal) {
    return res.status(400).json({ error: `An active SAC appeal (${existingAppeal.appeal_no}) already exists for this application.` });
  }

  const appealId = 'SAC-' + crypto.randomUUID();
  const appealNo = `SAC-APP-2026-${Date.now().toString().slice(-4)}`;

  // Create SAC Appeal Record (Preserving original rejection and audit history)
  db.prepare(`
    INSERT INTO sac_appeals (
      id, appeal_no, application_id, institution_id, original_decision,
      original_decision_reason, appeal_grounds, user_appeal_date, supporting_documents_json,
      status, submitted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'REJECTED', ?, ?, ?, ?, 'SUBMITTED', datetime('now'), datetime('now'), datetime('now'))
  `).run(
    appealId,
    appealNo,
    appId,
    req.user.id,
    appRecord.final_decision_reason || 'Rejection recorded in final review',
    appeal_grounds,
    user_appeal_date,
    supporting_documents ? JSON.stringify(supporting_documents) : '[]'
  );

  // Link uploaded appeal documents if provided
  if (Array.isArray(supporting_documents)) {
    for (const docId of supporting_documents) {
      db.prepare('UPDATE application_documents SET appeal_id = ? WHERE id = ?').run(appealId, docId);
    }
  }

  // Allocate SAC task to eligible SAC member with lowest active workload
  let allocatedTask = null;
  try {
    allocatedTask = createTaskWithAllocation({
      applicationId: appId,
      taskType: 'SAC',
      taskExtent: 'MEDIUM',
      extentReason: `Standing Appellate Committee statutory appeal examination for ${appRecord.application_no}`,
      scopeIndicators: { stage: 'SAC_APPEAL', appealNo },
      assessedBy: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role
    });

    // Link allocated task and SAC assignee to the appeal record
    db.prepare(`
      UPDATE sac_appeals 
      SET assigned_sac_id = ?, task_id = ?, status = 'ASSIGNED', updated_at = datetime('now')
      WHERE id = ?
    `).run(allocatedTask.assignee.id, allocatedTask.taskId, appealId);

  } catch (err) {
    console.error('Error allocating SAC task:', err);
  }

  // Update application appeal_status to IN_SAC_REVIEW (without reversing the original rejection)
  db.prepare(`
    UPDATE applications 
    SET appeal_status = 'IN_SAC_REVIEW', updated_at = datetime('now')
    WHERE id = ?
  `).run(appId);

  // Notify Higher-Level Officer
  const higherOfficers = db.prepare("SELECT id FROM users WHERE role = 'HIGHER_OFFICER'").all();
  for (const hlo of higherOfficers) {
    createNotification({
      recipientId: hlo.id,
      eventType: 'SAC_APPEAL_SUBMITTED',
      title: `SAC Appeal Lodged: ${appealNo}`,
      message: `${req.user.name} submitted an appeal through SAC for rejected application ${appRecord.application_no}. Allocated to ${allocatedTask?.assignee?.name || 'SAC Panel'}.`,
      relatedEntityType: 'APPLICATION',
      relatedEntityId: appId
    });
  }

  // Audit log
  logAudit({
    eventType: 'SAC_APPEAL_SUBMITTED',
    entityType: 'SAC_APPEAL',
    entityId: appealId,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: { appealNo, appId, assignedTo: allocatedTask?.assignee?.name, grounds: appeal_grounds }
  });

  res.json({
    success: true,
    appealId,
    appealNo,
    allocatedTask
  });
});

// List SAC Appeals (Role-based)
app.get('/api/appeals', authenticateToken, (req, res) => {
  let query = `
    SELECT sa.*, 
           a.application_no, a.institution_name, a.institution_type, a.program_type, a.status as app_status,
           u_inst.name as institution_user_name,
           u_sac.name as assigned_sac_name, u_sac.email as assigned_sac_email,
           t.task_number, t.target_due_at, t.is_overdue
    FROM sac_appeals sa
    JOIN applications a ON sa.application_id = a.id
    JOIN users u_inst ON sa.institution_id = u_inst.id
    LEFT JOIN users u_sac ON sa.assigned_sac_id = u_sac.id
    LEFT JOIN tasks t ON sa.task_id = t.id
  `;
  const params = [];

  if (req.user.role === 'INSTITUTION') {
    query += ' WHERE sa.institution_id = ?';
    params.push(req.user.id);
  } else if (req.user.role === 'SAC') {
    query += ' WHERE sa.assigned_sac_id = ?';
    params.push(req.user.id);
  }
  // HIGHER_OFFICER and REVIEWER can view all appeals

  query += ' ORDER BY sa.created_at DESC';
  const appeals = db.prepare(query).all(...params);
  res.json({ appeals });
});

// Get SAC Appeal details
app.get('/api/appeals/:id', authenticateToken, (req, res) => {
  const appeal = db.prepare(`
    SELECT sa.*, 
           a.application_no, a.institution_name, a.institution_type, a.program_type, a.status as app_status, a.final_decision,
           u_inst.name as institution_user_name, u_inst.email as institution_user_email,
           u_sac.name as assigned_sac_name, u_sac.email as assigned_sac_email,
           t.task_number, t.target_due_at, t.is_overdue, t.status as task_status
    FROM sac_appeals sa
    JOIN applications a ON sa.application_id = a.id
    JOIN users u_inst ON sa.institution_id = u_inst.id
    LEFT JOIN users u_sac ON sa.assigned_sac_id = u_sac.id
    LEFT JOIN tasks t ON sa.task_id = t.id
    WHERE sa.id = ?
  `).get(req.params.id);

  if (!appeal) {
    return res.status(404).json({ error: 'Appeal not found' });
  }

  // Access check
  if (req.user.role === 'INSTITUTION' && appeal.institution_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (req.user.role === 'SAC' && appeal.assigned_sac_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Fetch linked documents (both general application docs and appeal-specific docs)
  const documents = db.prepare(`
    SELECT * FROM application_documents 
    WHERE application_id = ? OR appeal_id = ?
    ORDER BY created_at ASC
  `).all(appeal.application_id, appeal.id);

  res.json({ appeal, documents });
});

// SAH (Standing Appellate Hearing) records binding final decision on Appeal (Acting as Supreme Court)
app.post('/api/appeals/:id/decision', authenticateToken, requireRole('SAC', 'HIGHER_OFFICER'), (req, res) => {
  const { final_decision, final_decision_reason, user_decision_date } = req.body;
  const appeal = db.prepare('SELECT * FROM sac_appeals WHERE id = ?').get(req.params.id);

  if (!appeal) {
    return res.status(404).json({ error: 'Appeal not found' });
  }

  // SAH must have only two decision options:
  // 1. REJECT_APPEAL (Reject the appeal)
  // 2. ALLOW_RESUBMISSION (Allow the institution one more opportunity to resubmit its documents)
  const validDecisions = ['REJECT_APPEAL', 'ALLOW_RESUBMISSION'];
  if (!validDecisions.includes(final_decision)) {
    return res.status(400).json({ 
      error: `Invalid SAH decision option. SAH is the final authority and must choose either 'REJECT_APPEAL' (Reject the appeal) or 'ALLOW_RESUBMISSION' (Allow document resubmission opportunity).` 
    });
  }

  if (!final_decision_reason || !final_decision_reason.trim()) {
    return res.status(400).json({ error: 'Deliberation justification reason is mandatory for SAH final decision.' });
  }

  const effectiveDecisionDate = user_decision_date || new Date().toISOString().split('T')[0];
  const appRecord = db.prepare('SELECT * FROM applications WHERE id = ?').get(appeal.application_id);
  if (!appRecord) {
    return res.status(404).json({ error: 'Associated application not found.' });
  }

  if (final_decision === 'REJECT_APPEAL') {
    // 1. REJECT THE APPEAL:
    // Keep the application rejected and close the appeal workflow.
    db.prepare(`
      UPDATE sac_appeals 
      SET final_decision = 'REJECT_APPEAL', final_decision_reason = ?, final_decision_by = ?,
          final_decision_at = datetime('now'), user_review_date = ?, status = 'CLOSED', updated_at = datetime('now')
      WHERE id = ?
    `).run(final_decision_reason, req.user.name, effectiveDecisionDate, req.params.id);

    // Keep application status as REJECTED, update appeal_status to APPEAL_REJECTED
    db.prepare(`
      UPDATE applications 
      SET status = 'REJECTED', appeal_status = 'APPEAL_REJECTED', updated_at = datetime('now')
      WHERE id = ?
    `).run(appeal.application_id);

    // Complete SAH task if one exists
    if (appeal.task_id) {
      db.prepare(`
        UPDATE tasks 
        SET status = 'COMPLETED', completed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(appeal.task_id);
    }

    // Send notification directly to the institution
    createNotification({
      recipientId: appeal.institution_id,
      eventType: 'SAH_APPEAL_DECISION_RECORDED',
      title: `SAH Appeal Decision: Appeal Rejected`,
      message: `The Standing Appellate Hearing (SAH) has rejected your appeal (${appeal.appeal_no}). Reason: ${final_decision_reason}. The application remains rejected and the appeal workflow is closed.`,
      relatedEntityType: 'SAC_APPEAL',
      relatedEntityId: appeal.id
    });

    // Record in audit trail
    logAudit({
      eventType: 'SAH_APPEAL_REJECTED',
      entityType: 'SAC_APPEAL',
      entityId: appeal.id,
      actorId: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role,
      newValue: {
        final_decision: 'REJECT_APPEAL',
        final_decision_reason,
        effectiveDecisionDate,
        decidedBy: req.user.name
      },
      reason: 'SAH (final appellate authority) dismissed appeal against rejection.'
    });

    return res.json({ 
      success: true, 
      decision: 'REJECT_APPEAL', 
      message: 'SAH final decision recorded: Appeal rejected and appeal workflow closed.' 
    });

  } else if (final_decision === 'ALLOW_RESUBMISSION') {
    // 2. ALLOW THE INSTITUTION ONE MORE OPPORTUNITY TO RESUBMIT ITS DOCUMENTS:
    // Check reappeal_count constraint: each institution can reappeal at most once, never exceeding 1
    const currentReappealCount = appRecord.reappeal_count || 0;
    if (currentReappealCount >= 1) {
      return res.status(400).json({ 
        error: `Cannot allow resubmission: Statutory maximum re-appeal limit reached (reappeal_count: ${currentReappealCount}/1). Each institution can reappeal at most once.` 
      });
    }

    const newReappealCount = currentReappealCount + 1;

    // Update sac_appeals record to CLOSED / ALLOW_RESUBMISSION
    db.prepare(`
      UPDATE sac_appeals 
      SET final_decision = 'ALLOW_RESUBMISSION', final_decision_reason = ?, final_decision_by = ?,
          final_decision_at = datetime('now'), user_review_date = ?, status = 'CLOSED', updated_at = datetime('now')
      WHERE id = ?
    `).run(final_decision_reason, req.user.name, effectiveDecisionDate, req.params.id);

    // Complete SAH task if one exists
    if (appeal.task_id) {
      db.prepare(`
        UPDATE tasks 
        SET status = 'COMPLETED', completed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(appeal.task_id);
    }

    // Automatically change application status from 'Rejected' to 'Under Review' ('UNDER_REVIEW')
    // Send the same application back to the reviewing officer (current_stage = 'DOCUMENT_SCRUTINY')
    // Update reappeal_count accordingly
    db.prepare(`
      UPDATE applications 
      SET status = 'UNDER_REVIEW',
          current_stage = 'DOCUMENT_SCRUTINY',
          appeal_status = 'RESUBMISSION_ALLOWED',
          reappeal_count = ?,
          final_decision = NULL,
          final_decision_reason = NULL,
          final_decision_by = NULL,
          final_decision_at = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(newReappealCount, appeal.application_id);

    // Send notification directly to the institution
    createNotification({
      recipientId: appeal.institution_id,
      eventType: 'SAH_APPEAL_DECISION_RECORDED',
      title: `SAH Appeal Decision: Document Resubmission Allowed`,
      message: `The Standing Appellate Hearing (SAH) has allowed your appeal (${appeal.appeal_no}) and granted a one-time opportunity to resubmit your supporting documents within your existing application. Application status has transitioned to Under Review. Please upload revised documents on your application portal.`,
      relatedEntityType: 'APPLICATION',
      relatedEntityId: appeal.application_id
    });

    // Notify Reviewing Officers that application has returned for document review
    const reviewers = db.prepare("SELECT id FROM users WHERE role = 'REVIEWER'").all();
    for (const rev of reviewers) {
      createNotification({
        recipientId: rev.id,
        eventType: 'APPLICATION_RETURNED_POST_SAH',
        title: `Application Returned: ${appRecord.application_no} Under Review`,
        message: `Application ${appRecord.application_no} (${appRecord.institution_name}) was granted document resubmission by SAH (reappeal_count: ${newReappealCount}/1). The application is now Under Review for scrutiny.`,
        relatedEntityType: 'APPLICATION',
        relatedEntityId: appeal.application_id
      });
    }

    // Record in audit trail
    logAudit({
      eventType: 'SAH_RESUBMISSION_GRANTED',
      entityType: 'APPLICATION',
      entityId: appeal.application_id,
      actorId: req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role,
      newValue: {
        final_decision: 'ALLOW_RESUBMISSION',
        final_decision_reason,
        effectiveDecisionDate,
        decidedBy: req.user.name,
        new_status: 'UNDER_REVIEW',
        reappeal_count: newReappealCount
      },
      reason: 'SAH (final appellate authority) allowed appeal and granted one-time document resubmission within existing application.'
    });

    return res.json({ 
      success: true, 
      decision: 'ALLOW_RESUBMISSION', 
      reappeal_count: newReappealCount,
      message: 'SAH final decision recorded: Resubmission allowed, application updated to Under Review and sent to Reviewing Officer.' 
    });
  }
});

// Institution confirms resubmission of documents within existing application
app.post('/api/applications/:id/resubmit-documents', authenticateToken, requireRole('INSTITUTION'), (req, res) => {
  const appId = req.params.id;
  const { notes, submission_date } = req.body;
  const appRecord = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);

  if (!appRecord) {
    return res.status(404).json({ error: 'Application not found' });
  }
  if (appRecord.institution_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: You can only resubmit documents for your own application.' });
  }
  if (appRecord.appeal_status !== 'RESUBMISSION_ALLOWED' && appRecord.appeal_status !== 'RESUBMITTED') {
    return res.status(400).json({ error: 'Document resubmission is only allowed when authorized by SAH.' });
  }

  const effectiveDate = submission_date || new Date().toISOString().split('T')[0];

  db.prepare(`
    UPDATE applications 
    SET status = 'UNDER_REVIEW',
        appeal_status = 'RESUBMITTED',
        current_stage = 'DOCUMENT_SCRUTINY',
        user_submission_date = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(effectiveDate, appId);

  // Notify Reviewing Officers
  const reviewers = db.prepare("SELECT id FROM users WHERE role = 'REVIEWER'").all();
  for (const rev of reviewers) {
    createNotification({
      recipientId: rev.id,
      eventType: 'DOCUMENTS_RESUBMITTED_POST_SAH',
      title: `Documents Resubmitted: ${appRecord.application_no}`,
      message: `${req.user.name} has submitted revised documents for ${appRecord.application_no} following the SAH resubmission order on ${effectiveDate}. Ready for document scrutiny. Notes: ${notes || 'None'}`,
      relatedEntityType: 'APPLICATION',
      relatedEntityId: appId
    });
  }

  logAudit({
    eventType: 'APPLICATION_DOCUMENTS_RESUBMITTED_POST_SAH',
    entityType: 'APPLICATION',
    entityId: appId,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: { resubmissionDate: effectiveDate, notes }
  });

  res.json({ success: true, message: 'Revised documents successfully submitted for Reviewing Officer scrutiny.' });
});

// ==========================================
// OVERDUE TASKS & ESCALATIONS (HIGHER-LEVEL OFFICER)
// ==========================================

// Get Overdue Tasks segregated by committee (EVC, SHC, SAC)
app.get('/api/overdue-tasks', authenticateToken, requireRole('HIGHER_OFFICER', 'REVIEWER'), (req, res) => {
  // First run overdue check to mark any newly overdue tasks
  runOverdueAndEscalationCheck();

  const overdueList = db.prepare(`
    SELECT t.*, 
           u.name as assignee_name, u.email as assignee_email, u.role as assignee_role, u.organization as assignee_org,
           a.application_no, a.institution_name, a.institution_type, a.program_type
    FROM tasks t
    JOIN users u ON t.assignee_id = u.id
    JOIN applications a ON t.application_id = a.id
    WHERE (t.is_overdue = 1 OR t.target_due_at < datetime('now'))
      AND t.status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED')
    ORDER BY t.target_due_at ASC
  `).all();

  const evcOverdue = overdueList.filter(t => t.task_type === 'EVC');
  const shcOverdue = overdueList.filter(t => t.task_type === 'SHC_SAH');
  const sacOverdue = overdueList.filter(t => t.task_type === 'SAC');

  res.json({
    totalOverdue: overdueList.length,
    evc: evcOverdue,
    shc: shcOverdue,
    sac: sacOverdue
  });
});

// Higher-Level Officer sends individual overdue reminder to a specific worker
app.post('/api/tasks/:id/notify-overdue', authenticateToken, requireRole('HIGHER_OFFICER'), (req, res) => {
  const taskId = req.params.id;
  const { customMessage } = req.body;

  const task = db.prepare(`
    SELECT t.*, u.name as assignee_name, u.email as assignee_email, a.application_no, a.institution_name
    FROM tasks t
    JOIN users u ON t.assignee_id = u.id
    JOIN applications a ON t.application_id = a.id
    WHERE t.id = ?
  `).get(taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const messageText = customMessage || `Urgent Reminder: Task ${task.task_number} for application ${task.application_no} (${task.institution_name}) is overdue (Target deadline was ${new Date(task.target_due_at).toLocaleDateString()}). Please submit your report or request a formal extension immediately.`;

  // Create individual reminder notification
  createNotification({
    recipientId: task.assignee_id,
    eventType: 'INDIVIDUAL_OVERDUE_REMINDER',
    title: `Overdue Task Reminder: ${task.task_number}`,
    message: messageText,
    relatedEntityType: 'TASK',
    relatedEntityId: taskId,
    isReminder: 1
  });

  // Log in audit trail
  logAudit({
    eventType: 'INDIVIDUAL_OVERDUE_REMINDER_SENT',
    entityType: 'TASK',
    entityId: taskId,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: {
      recipientId: task.assignee_id,
      recipientName: task.assignee_name,
      taskNumber: task.task_number,
      message: messageText
    }
  });

  res.json({
    success: true,
    message: `Individual reminder sent to ${task.assignee_name} for task ${task.task_number}.`
  });
});

// Higher-Level Officer sends broadcast escalation to all workers who currently have overdue tasks
app.post('/api/escalations/broadcast', authenticateToken, requireRole('HIGHER_OFFICER'), (req, res) => {
  const { escalationMessage } = req.body;

  // Run check first
  runOverdueAndEscalationCheck();

  // Find all active overdue tasks grouped by worker
  const overdueTasks = db.prepare(`
    SELECT t.id, t.task_number, t.task_type, t.target_due_at, t.assignee_id,
           u.name as assignee_name, u.email as assignee_email,
           a.application_no, a.institution_name
    FROM tasks t
    JOIN users u ON t.assignee_id = u.id
    JOIN applications a ON t.application_id = a.id
    WHERE (t.is_overdue = 1 OR t.target_due_at < datetime('now'))
      AND t.status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED')
    ORDER BY t.assignee_id
  `).all();

  if (overdueTasks.length === 0) {
    return res.json({ success: true, count: 0, message: 'No workers currently have overdue tasks.' });
  }

  // Group by assignee
  const workerMap = {};
  for (const t of overdueTasks) {
    if (!workerMap[t.assignee_id]) {
      workerMap[t.assignee_id] = {
        name: t.assignee_name,
        email: t.assignee_email,
        tasks: []
      };
    }
    workerMap[t.assignee_id].tasks.push(t);
  }

  const notifiedWorkers = [];

  for (const [assigneeId, data] of Object.entries(workerMap)) {
    const taskListSummary = data.tasks.map(t => `${t.task_number} (${t.task_type} for ${t.application_no}, due: ${new Date(t.target_due_at).toLocaleDateString()})`).join('; ');
    const msg = escalationMessage || `FORMAL BROADCAST ESCALATION from Higher-Level Officer: You have ${data.tasks.length} overdue task(s): ${taskListSummary}. Prompt compliance or immediate justification is required under AICTE regulatory timelines.`;

    // Send notification
    createNotification({
      recipientId: assigneeId,
      eventType: 'BROADCAST_OVERDUE_ESCALATION',
      title: `ESCALATION: Overdue Regulatory Tasks (${data.tasks.length} Pending)`,
      message: msg,
      relatedEntityType: 'WORKER_ESCALATION',
      relatedEntityId: assigneeId,
      isReminder: 1
    });

    // Mark tasks as escalated
    for (const t of data.tasks) {
      db.prepare("UPDATE tasks SET is_escalated = 1, updated_at = datetime('now') WHERE id = ?").run(t.id);
    }

    notifiedWorkers.push({
      workerId: assigneeId,
      workerName: data.name,
      overdueTaskCount: data.tasks.length,
      taskNumbers: data.tasks.map(t => t.task_number)
    });
  }

  // Audit trail for broadcast escalation
  logAudit({
    eventType: 'BROADCAST_ESCALATION_ISSUED',
    entityType: 'ESCALATION',
    entityId: 'BROADCAST-' + Date.now(),
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.user.role,
    newValue: {
      recipientCount: notifiedWorkers.length,
      recipients: notifiedWorkers,
      customMessage: escalationMessage || null
    }
  });

  res.json({
    success: true,
    count: notifiedWorkers.length,
    recipients: notifiedWorkers,
    message: `Broadcast escalation sent to ${notifiedWorkers.length} officer(s) with active overdue assignments.`
  });
});

// ==========================================
// 9. ROLE-SPECIFIC DASHBOARD ANALYTICS
// ==========================================

app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  const role = req.user.role;
  const userId = req.user.id;

  if (role === 'INSTITUTION') {
    const total = db.prepare('SELECT COUNT(*) as count FROM applications WHERE institution_id = ?').get(userId).count;
    const awaitingReview = db.prepare("SELECT COUNT(*) as count FROM applications WHERE institution_id = ? AND status IN ('SUBMITTED', 'UNDER_DOCUMENT_REVIEW')").get(userId).count;
    const requiringClarification = db.prepare("SELECT COUNT(*) as count FROM applications WHERE institution_id = ? AND status = 'AWAITING_CLARIFICATION'").get(userId).count;
    const underReview = db.prepare("SELECT COUNT(*) as count FROM applications WHERE institution_id = ? AND status IN ('ROUTE_ASSIGNED', 'IN_EVC', 'IN_SHC_SAH')").get(userId).count;
    const awaitingDecision = db.prepare("SELECT COUNT(*) as count FROM applications WHERE institution_id = ? AND status = 'READY_FOR_FINAL_REVIEW'").get(userId).count;
    const approved = db.prepare("SELECT COUNT(*) as count FROM applications WHERE institution_id = ? AND status = 'APPROVED'").get(userId).count;
    const otherOutcomes = db.prepare("SELECT COUNT(*) as count FROM applications WHERE institution_id = ? AND status IN ('REJECTED', 'RETURNED_FOR_FURTHER_INFO')").get(userId).count;
    const appealsCount = db.prepare("SELECT COUNT(*) as count FROM sac_appeals WHERE institution_id = ?").get(userId).count;

    return res.json({
      role,
      stats: {
        total,
        awaitingReview,
        requiringClarification,
        underReview,
        awaitingDecision,
        approved,
        otherOutcomes,
        appealsCount
      }
    });
  }

  if (role === 'REVIEWER') {
    const pendingReviews = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'SUBMITTED'").get().count;
    const awaitingClarification = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'AWAITING_CLARIFICATION'").get().count;
    const clarificationReturned = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'CLARIFICATION_SUBMITTED'").get().count;
    const inEvc = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'IN_EVC'").get().count;
    const inShc = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'IN_SHC_SAH'").get().count;
    const readyForFinal = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'READY_FOR_FINAL_REVIEW'").get().count;
    const reportsAwaitingReview = db.prepare("SELECT COUNT(*) as count FROM task_reports WHERE review_status = 'SUBMITTED'").get().count;

    return res.json({
      role,
      stats: {
        pendingReviews,
        awaitingClarification,
        clarificationReturned,
        inEvc,
        inShc,
        readyForFinal,
        reportsAwaitingReview
      }
    });
  }

  if (role === 'EVC' || role === 'SHC_SAH') {
    const activeTasks = db.prepare(`
      SELECT COUNT(*) as count FROM tasks 
      WHERE assignee_id = ? AND status IN ('ASSIGNED', 'IN_PROGRESS', 'AWAITING_SUBMISSION', 'RETURNED_FOR_CORRECTION')
    `).get(userId).count;

    const overdueTasks = db.prepare(`
      SELECT COUNT(*) as count FROM tasks 
      WHERE assignee_id = ? AND is_overdue = 1 AND status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED')
    `).get(userId).count;

    const submittedReports = db.prepare(`
      SELECT COUNT(*) as count FROM tasks 
      WHERE assignee_id = ? AND status IN ('SUBMITTED', 'COMPLETED')
    `).get(userId).count;

    const correctionsRequired = db.prepare(`
      SELECT COUNT(*) as count FROM tasks 
      WHERE assignee_id = ? AND status = 'RETURNED_FOR_CORRECTION'
    `).get(userId).count;

    return res.json({
      role,
      stats: {
        activeTasks,
        overdueTasks,
        submittedReports,
        correctionsRequired
      }
    });
  }

  if (role === 'SAC') {
    const activeTasks = db.prepare(`
      SELECT COUNT(*) as count FROM tasks 
      WHERE assignee_id = ? AND status IN ('ASSIGNED', 'IN_PROGRESS', 'AWAITING_REVIEW')
    `).get(userId).count;

    const overdueTasks = db.prepare(`
      SELECT COUNT(*) as count FROM tasks 
      WHERE assignee_id = ? AND (is_overdue = 1 OR target_due_at < datetime('now')) AND status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED')
    `).get(userId).count;

    const submittedRecommendations = db.prepare(`
      SELECT COUNT(*) as count FROM sac_appeals 
      WHERE assigned_sac_id = ? AND status IN ('RECOMMENDED', 'DECIDED', 'CLOSED')
    `).get(userId).count;

    return res.json({
      role,
      stats: {
        activeTasks,
        overdueTasks,
        submittedRecommendations
      }
    });
  }

  if (role === 'HIGHER_OFFICER') {
    const awaitingDecision = db.prepare("SELECT COUNT(*) as count FROM applications WHERE status = 'READY_FOR_FINAL_REVIEW'").get().count;
    const overdueTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE is_overdue = 1 AND status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED')").get().count;
    const escalatedTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE is_escalated = 1 AND status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED')").get().count;
    const capReachedTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE is_cap_reached = 1 AND status NOT IN ('COMPLETED', 'CANCELLED', 'CLOSED')").get().count;
    const unassignedTasks = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'AWAITING_ASSIGNMENT'").get().count;
    const totalDecisionsRecorded = db.prepare("SELECT COUNT(*) as count FROM applications WHERE final_decision IS NOT NULL").get().count;
    
    // EVC Reports awaiting acceptance by Higher Officer
    const evcReportsAwaitingAcceptance = db.prepare(`
      SELECT COUNT(*) as count FROM task_reports r 
      JOIN tasks t ON r.task_id = t.id 
      WHERE t.task_type = 'EVC' AND r.review_status = 'SUBMITTED'
    `).get().count;

    // SAC Appeals pending decision
    const pendingSacAppeals = db.prepare(`
      SELECT COUNT(*) as count FROM sac_appeals 
      WHERE status IN ('SUBMITTED', 'ASSIGNED', 'UNDER_REVIEW', 'RECOMMENDED')
    `).get().count;

    const workloadSnapshot = getWorkloadSnapshot();

    return res.json({
      role,
      stats: {
        awaitingDecision,
        overdueTasks,
        escalatedTasks,
        capReachedTasks,
        unassignedTasks,
        totalDecisionsRecorded,
        evcReportsAwaitingAcceptance,
        pendingSacAppeals
      },
      workloadSnapshot
    });
  }

  res.json({ role, stats: {} });
});

// Candidate workers list for reassignments
app.get('/api/users/candidates', authenticateToken, requireRole('HIGHER_OFFICER', 'REVIEWER'), (req, res) => {
  const { role } = req.query;
  let query = 'SELECT id, name, email, role, organization FROM users WHERE is_active = 1';
  const params = [];
  if (role) {
    query += ' AND role = ?';
    params.push(role);
  }
  const users = db.prepare(query).all(...params);
  res.json({
    users: users.map(u => ({
      ...u,
      activeTasks: getActiveTaskCountForUser(u.id)
    }))
  });
});

// Trigger manually an overdue evaluation cycle
app.post('/api/monitoring/run-escalations', authenticateToken, requireRole('HIGHER_OFFICER'), (req, res) => {
  const results = runOverdueAndEscalationCheck();
  res.json({ success: true, results });
});

// Client SPA fallback
if (fs.existsSync(clientDistDir)) {
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      return res.sendFile(path.join(clientDistDir, 'index.html'));
    }
    next();
  });
}

// Start Express Server
app.listen(PORT, () => {
  console.log(`AICTE FlowTrack Backend API running securely on port ${PORT}`);
});
