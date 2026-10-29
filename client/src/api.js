// api.js - Centralized API Service for AICTE FlowTrack
const API_BASE = '/api';

export function getAuthHeaders() {
  const token = localStorage.getItem('flowtrack_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export async function fetchDemoUsers() {
  const res = await fetch(`${API_BASE}/auth/demo-users`);
  return res.json();
}

export async function demoLogin(userId) {
  const res = await fetch(`${API_BASE}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  const data = await res.json();
  if (data.token) {
    localStorage.setItem('flowtrack_token', data.token);
    localStorage.setItem('flowtrack_user', JSON.stringify(data.user));
  }
  return data;
}

export async function fetchDashboardStats() {
  const res = await fetch(`${API_BASE}/dashboard/stats`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function fetchApplications() {
  const res = await fetch(`${API_BASE}/applications`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function fetchTasks() {
  const res = await fetch(`${API_BASE}/tasks`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function fetchApplicationDetails(id) {
  const res = await fetch(`${API_BASE}/applications/${id}`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function createApplication(data) {
  const res = await fetch(`${API_BASE}/applications`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function uploadDocument(appId, docData) {
  const res = await fetch(`${API_BASE}/applications/${appId}/documents`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(docData)
  });
  return res.json();
}

export async function submitApplication(appId, submissionDate) {
  const res = await fetch(`${API_BASE}/applications/${appId}/submit`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ submission_date: submissionDate })
  });
  return res.json();
}

export async function reviewDocument(docId, data) {
  const res = await fetch(`${API_BASE}/documents/${docId}/review`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function requestClarification(appId, data) {
  const res = await fetch(`${API_BASE}/applications/${appId}/request-clarification`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function respondClarification(clarifId, data) {
  const res = await fetch(`${API_BASE}/clarifications/${clarifId}/respond`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function fetchWorkflowRoutes() {
  const res = await fetch(`${API_BASE}/workflow-routes`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function selectWorkflowRoute(appId, data) {
  const res = await fetch(`${API_BASE}/applications/${appId}/select-route`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function previewDeadlines(taskType, taskExtent) {
  const res = await fetch(`${API_BASE}/tasks/preview-deadline`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ taskType, taskExtent })
  });
  return res.json();
}

export async function createTask(appId, data) {
  const res = await fetch(`${API_BASE}/applications/${appId}/create-task`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function fetchTaskDetails(taskId) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function updateTaskStatus(taskId, status) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/status`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status })
  });
  return res.json();
}

export async function submitTaskReport(taskId, reportData) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/submit-report`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(reportData)
  });
  return res.json();
}

export async function reviewReport(reportId, reviewData) {
  const res = await fetch(`${API_BASE}/reports/${reportId}/review`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(reviewData)
  });
  return res.json();
}

export async function forwardForFinalReview(appId) {
  const res = await fetch(`${API_BASE}/applications/${appId}/forward-final-review`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function recordFinalDecision(appId, decisionData) {
  const res = await fetch(`${API_BASE}/applications/${appId}/final-decision`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(decisionData)
  });
  return res.json();
}

export async function reassignTask(taskId, reassignData) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/reassign`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(reassignData)
  });
  return res.json();
}

export async function extendDeadline(taskId, extensionData) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/extend-deadline`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(extensionData)
  });
  return res.json();
}

export async function requestTaskDeadlineExtension(taskId, data) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/request-extension`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function loginWithCredentials(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.token) {
    localStorage.setItem('flowtrack_token', data.token);
    localStorage.setItem('flowtrack_user', JSON.stringify(data.user));
  }
  return data;
}

export async function fetchExtensionRequests() {
  const res = await fetch(`${API_BASE}/requests/extensions`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function rejectExtensionRequest(requestId, decisionNotes) {
  const res = await fetch(`${API_BASE}/requests/${requestId}/reject`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ decision_notes: decisionNotes })
  });
  return res.json();
}

export async function fetchCandidateOfficers(role) {
  const res = await fetch(`${API_BASE}/users/candidates?role=${role}`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function fetchNotifications() {
  const res = await fetch(`${API_BASE}/notifications`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function markNotificationAsRead(id) {
  const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function fetchAuditLogs(entityId = null) {
  const url = entityId ? `${API_BASE}/audit-logs?entityId=${entityId}` : `${API_BASE}/audit-logs`;
  const res = await fetch(url, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function fetchDeadlinePolicies() {
  const res = await fetch(`${API_BASE}/deadline-policies`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function updateDeadlinePolicy(policyId, data) {
  const res = await fetch(`${API_BASE}/deadline-policies/${policyId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

// SAC Appeals API
export async function submitSacAppeal(appId, data) {
  const res = await fetch(`${API_BASE}/applications/${appId}/appeal`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function fetchAppeals() {
  const res = await fetch(`${API_BASE}/appeals`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function fetchAppealDetails(appealId) {
  const res = await fetch(`${API_BASE}/appeals/${appealId}`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function submitSacRecommendation(appealId, data) {
  const res = await fetch(`${API_BASE}/appeals/${appealId}/recommend`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function recordSacAppealDecision(appealId, data) {
  const res = await fetch(`${API_BASE}/appeals/${appealId}/decision`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function resubmitApplicationDocuments(appId, data) {
  const res = await fetch(`${API_BASE}/applications/${appId}/resubmit-documents`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  return res.json();
}

// Overdue Tasks & Escalations API
export async function fetchOverdueTasks() {
  const res = await fetch(`${API_BASE}/overdue-tasks`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

export async function notifyOverdueTask(taskId, customMessage) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}/notify-overdue`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ customMessage })
  });
  return res.json();
}

export async function broadcastOverdueEscalation(escalationMessage) {
  const res = await fetch(`${API_BASE}/escalations/broadcast`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ escalationMessage })
  });
  return res.json();
}

// Pending reports for Higher-Level Officer & Reviewer
export async function fetchPendingReports() {
  const res = await fetch(`${API_BASE}/reports/pending-review`, {
    headers: getAuthHeaders()
  });
  return res.json();
}

// Document Access & View
export async function viewDocument(docId) {
  const res = await fetch(`${API_BASE}/documents/${docId}/view`, {
    headers: getAuthHeaders()
  });
  return res.json();
}
