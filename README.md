# AICTE FlowTrack Platform

AICTE FlowTrack is a configurable workflow automation, deterministic task allocation, deadline monitoring, and escalation platform designed for institutional regulatory review.

## Architecture & Core Modules

* **Persistence Layer**: `server/src/database.js` (SQLite WAL mode with strict foreign keys and check constraints).
* **Role-Based Access Control & Auth**: `server/src/middleware.js` (JWT authentication, role enforcement for 5 distinct profiles).
* **Workload-Balanced Allocation Engine**: `server/src/allocationService.js` (Deterministic allocation using lowest active task count; excludes subjective performance scores).
* **Deadline Calculation Engine**: `server/src/deadlineService.js` (Rule-based formula: `Base + (Workload Buffer * Active Tasks)`, capped by configured maximum completion limit).
* **Workflow Engine & State Transitions**: `server/src/workflowEngine.js` (Immediate SQLite transactions for concurrency safety, task assignment, reassignment, and authorized extensions).
* **Escalation Daemon**: `server/src/escalationService.js` (Periodic monitoring for overdue tasks and clarification response lapses).
* **Audit Trail**: `server/src/auditService.js` (Immutable append-only audit log).
* **Frontend SPA**: React 19 + Tailwind CSS + Lucide Icons in `client/`.

## Running the Application

### 1. Backend Server & Client Host
```powershell
cd C:\Users\durga\FlowTrack
npm start # runs node server/src/index.js on port 4000
```
Visit: **http://localhost:4000**

### 2. Frontend Development Server (Optional for Live Hot-Reload)
```powershell
cd C:\Users\durga\FlowTrack\client
npm run dev
```

### 3. Running Automated Tests
```powershell
cd C:\Users\durga\FlowTrack
node server/tests/test_flowtrack.js
```

## Demo Credentials & Synthetic Profiles

All demo accounts share the password `aicte123` or can be switched instantly via the header role dropdown:
* **Institution**: `institution@flowtrack.demo`
* **Reviewing Officer**: `reviewer@flowtrack.demo`
* **EVC Officer A**: `evc.a@flowtrack.demo`
* **EVC Officer B**: `evc.b@flowtrack.demo`
* **EVC Officer C**: `evc.c@flowtrack.demo`
* **EVC Officer D**: `evc.d@flowtrack.demo`
* **SHC Member A**: `shc.a@flowtrack.demo`
* **SHC Member B**: `shc.b@flowtrack.demo`
* **SHC Member C**: `shc.c@flowtrack.demo`
* **SHC Member D**: `shc.d@flowtrack.demo`
* **Higher-Level Officer**: `higher@flowtrack.demo`
