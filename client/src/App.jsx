import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  FileText, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  ArrowRight, 
  ShieldAlert, 
  UserCheck, 
  Calendar, 
  Upload, 
  RotateCcw, 
  Search, 
  Bell, 
  LogOut, 
  ChevronRight, 
  Layers, 
  BarChart3, 
  HelpCircle, 
  Check, 
  X, 
  FileCheck2, 
  Briefcase, 
  SlidersHorizontal,
  ExternalLink,
  Scale,
  Sparkles
} from 'lucide-react';
import * as api from './api';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [demoUsers, setDemoUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [applications, setApplications] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [extensionRequests, setExtensionRequests] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('123456');
  const [loginError, setLoginError] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('DUE');

  // Forms modal states
  const [showNewAppModal, setShowNewAppModal] = useState(false);
  const [showSubmitAppModal, setShowSubmitAppModal] = useState(false);
  const [appSubmissionDate, setAppSubmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [showSacAppealModal, setShowSacAppealModal] = useState(false);
  const [sacAppealGrounds, setSacAppealGrounds] = useState('');
  const [sacAppealDate, setSacAppealDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedAppealDocIds, setSelectedAppealDocIds] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [selectedAppeal, setSelectedAppeal] = useState(null);
  const [showSacRecommendModal, setShowSacRecommendModal] = useState(false);
  const [showSacDecisionModal, setShowSacDecisionModal] = useState(false);
  const [overdueTasksData, setOverdueTasksData] = useState({ totalOverdue: 0, evc: [], shc: [], sac: [] });
  const [pendingReports, setPendingReports] = useState([]);
  const [showUploadDocModal, setShowUploadDocModal] = useState(false);
  const [selectedDocCategory, setSelectedDocCategory] = useState('APPROVED_BUILDING_PLAN');
  const [docUploadName, setDocUploadName] = useState('');

  const [showClarifModal, setShowClarifModal] = useState(false);
  const [showRespondClarifModal, setShowRespondClarifModal] = useState(false);
  const [selectedClarif, setSelectedClarif] = useState(null);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState('ROUTE-EVC-SHC');
  const [evcExtent, setEvcExtent] = useState('MEDIUM');
  const [evcReason, setEvcReason] = useState('Physical laboratories and workshop inspection spanning 2 workshop halls.');
  const [shcExtent, setShcExtent] = useState('MEDIUM');
  const [shcReason, setShcReason] = useState('Standing Hearing Committee assessment on faculty cadence and curriculum compliance.');
  const [showTaskAssessModal, setShowTaskAssessModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showFinalDecisionModal, setShowFinalDecisionModal] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showRequestExtensionModal, setShowRequestExtensionModal] = useState(false);

  // Load initial demo users
  useEffect(() => {
    loadDemoUsers();
  }, []);

  // Reload data on user change or tab change
  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser, activeTab]);

  async function loadDemoUsers() {
    try {
      const data = await api.fetchDemoUsers();
      setDemoUsers(data.users || []);
      const savedUser = localStorage.getItem('flowtrack_user');
      const savedToken = localStorage.getItem('flowtrack_token');
      if (savedUser && savedToken) {
        setCurrentUser(JSON.parse(savedUser));
      } else {
        setCurrentUser(null);
      }
    } catch (err) {
      console.error('Failed to load demo users', err);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('flowtrack_token');
    localStorage.removeItem('flowtrack_user');
    setCurrentUser(null);
    setSelectedApp(null);
    setSelectedTask(null);
    setActiveTab('dashboard');
  }

  async function handleCredentialLogin(e) {
    e.preventDefault();
    setLoginError('');
    try {
      setLoading(true);
      const res = await api.loginWithCredentials(loginEmail, loginPassword);
      if (res.error) {
        setLoginError(res.error);
      } else {
        setCurrentUser(res.user);
        setSelectedApp(null);
        setSelectedTask(null);
        setActiveTab('dashboard');
      }
    } catch (err) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoSwitch(userId) {
    try {
      setLoading(true);
      const res = await api.demoLogin(userId);
      setCurrentUser(res.user);
      setSelectedApp(null);
      setSelectedTask(null);
      setActiveTab('dashboard');
    } catch (err) {
      alert('Login failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadData() {
    try {
      const promises = [
        api.fetchDashboardStats(),
        api.fetchApplications(),
        api.fetchNotifications()
      ];

      // If user is Reviewer, Higher Officer, EVC, SHC or SAC, load tasks permitted for them
      if (currentUser?.role !== 'INSTITUTION') {
        promises.push(api.fetchTasks());
      }

      if (currentUser?.role === 'HIGHER_OFFICER') {
        promises.push(api.fetchExtensionRequests());
        promises.push(api.fetchOverdueTasks());
        promises.push(api.fetchPendingReports());
      }

      if (currentUser?.role === 'HIGHER_OFFICER' || currentUser?.role === 'SAC' || currentUser?.role === 'INSTITUTION' || currentUser?.role === 'REVIEWER') {
        promises.push(api.fetchAppeals());
      }

      const results = await Promise.all(promises);
      const sRes = results[0];
      const aRes = results[1];
      const nRes = results[2];
      setStats(sRes.stats || {});
      setApplications(aRes.applications || []);
      setNotifications(nRes.notifications || []);

      let nextIndex = 3;
      if (currentUser?.role !== 'INSTITUTION') {
        const tRes = results[nextIndex];
        if (tRes) setAllTasks(tRes.tasks || []);
        nextIndex++;
      }
      if (currentUser?.role === 'HIGHER_OFFICER') {
        const rRes = results[nextIndex];
        if (rRes) setExtensionRequests(rRes.requests || []);
        nextIndex++;
        const odRes = results[nextIndex];
        if (odRes) setOverdueTasksData(odRes);
        nextIndex++;
        const prRes = results[nextIndex];
        if (prRes) setPendingReports(prRes.reports || []);
        nextIndex++;
      }
      if (currentUser?.role === 'HIGHER_OFFICER' || currentUser?.role === 'SAC' || currentUser?.role === 'INSTITUTION' || currentUser?.role === 'REVIEWER') {
        const apRes = results[nextIndex];
        if (apRes) setAppeals(apRes.appeals || []);
        nextIndex++;
      }

      if (activeTab === 'policies') {
        const pRes = await api.fetchDeadlinePolicies();
        setPolicies(pRes.policies || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  }

  async function handleSelectApp(appId) {
    try {
      const res = await api.fetchApplicationDetails(appId);
      setSelectedApp(res);
      setSelectedTask(null);
      setActiveTab('application-detail');
    } catch (err) {
      alert('Error loading application details: ' + err.message);
    }
  }

  async function handleSelectTask(taskId) {
    try {
      const res = await api.fetchTaskDetails(taskId);
      setSelectedTask(res);
      setActiveTab('task-detail');
    } catch (err) {
      alert('Error loading task details: ' + err.message);
    }
  }

  function renderLoginScreen() {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between font-sans selection:bg-indigo-500 selection:text-white">
        {/* Top Banner Notice */}
        <div className="bg-amber-500 text-slate-900 px-4 py-1.5 text-xs font-semibold flex items-center justify-between shadow-xs border-b border-amber-600">
          <div className="flex items-center space-x-2">
            <span className="bg-amber-900 text-amber-100 text-[10px] px-2 py-0.5 rounded font-mono uppercase tracking-wider">Demo Environment</span>
            <span>AICTE FlowTrack • Official Prototype Demonstration Platform (Synthetic Demo Data)</span>
          </div>
          <span className="text-[11px] text-amber-950 font-medium">Verified for SIH Compliance Evaluation</span>
        </div>

        {/* Center Container */}
        <div className="max-w-5xl mx-auto w-full px-4 py-10 flex-1 flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 bg-linear-to-br from-indigo-500 to-blue-600 rounded-2xl items-center justify-center shadow-lg font-black text-2xl text-white mb-3">
              FT
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              AICTE FlowTrack
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-lg mx-auto">
              Institutional Regulatory Workflow, Task Allocation, Target Deadline Monitoring & Escalation Platform
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Credentials Login Form */}
            <div className="lg:col-span-5 bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 shadow-xl backdrop-blur-xs">
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-4 pb-2 border-b border-slate-700 flex items-center justify-between">
                <span>Account Login</span>
                <span className="text-[11px] font-mono text-indigo-400 font-normal">All Passwords: 123456</span>
              </h2>

              {loginError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleCredentialLogin} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="e.g. reviewer@flowtrack.demo"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-md transition duration-150 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                >
                  <span>{loading ? 'Authenticating...' : 'Sign In to Portal'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-4 pt-3 border-t border-slate-700/60 text-[11px] text-slate-400 text-center">
                Select an account on the right or enter your credentials above.
              </div>
            </div>

            {/* Demo Accounts List */}
            <div className="lg:col-span-7 bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 shadow-xl backdrop-blur-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  <span>Quick Demo Access (1-Click Login)</span>
                </h2>
                <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-700/50 px-2 py-0.5 rounded font-mono">
                  Password: 123456
                </span>
              </div>

              {/* Grouped by Role */}
              <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
                {/* Institutions */}
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Institutions (Applicants)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {demoUsers.filter(u => u.role === 'INSTITUTION').map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setLoginEmail(u.email);
                          setLoginPassword('123456');
                          handleDemoSwitch(u.id);
                        }}
                        className="text-left p-2.5 rounded-lg bg-slate-900/80 hover:bg-indigo-950/60 border border-slate-700/70 hover:border-indigo-500/60 transition group flex flex-col justify-between cursor-pointer"
                      >
                        <div className="font-semibold text-slate-200 text-xs truncate group-hover:text-indigo-300">{u.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">{u.email}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reviewer & Higher Officer */}
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Regulatory Authorities (Reviewer & Higher Officer)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {demoUsers.filter(u => u.role === 'REVIEWER' || u.role === 'HIGHER_OFFICER').map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setLoginEmail(u.email);
                          setLoginPassword('123456');
                          handleDemoSwitch(u.id);
                        }}
                        className={`text-left p-2.5 rounded-lg border transition group flex flex-col justify-between cursor-pointer ${
                          u.role === 'HIGHER_OFFICER' 
                            ? 'bg-purple-950/40 border-purple-800/60 hover:bg-purple-900/50 hover:border-purple-500' 
                            : 'bg-emerald-950/40 border-emerald-800/60 hover:bg-emerald-900/50 hover:border-emerald-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-slate-200 text-xs truncate group-hover:text-white">{u.name}</div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                            u.role === 'HIGHER_OFFICER' ? 'bg-purple-800 text-purple-200' : 'bg-emerald-800 text-emerald-200'
                          }`}>
                            {u.role === 'HIGHER_OFFICER' ? 'HIGHER OFFICER' : 'REVIEWER'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">{u.email}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* EVC Members */}
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                    <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                    <span>Expert Visit Committee (EVC Inspection Officers)</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {demoUsers.filter(u => u.role === 'EVC').map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setLoginEmail(u.email);
                          setLoginPassword('123456');
                          handleDemoSwitch(u.id);
                        }}
                        className="text-left p-2 rounded-lg bg-slate-900/80 hover:bg-amber-950/50 border border-slate-700/70 hover:border-amber-500/60 transition group cursor-pointer"
                      >
                        <div className="font-semibold text-slate-200 text-xs truncate group-hover:text-amber-300">{u.name}</div>
                        <div className="text-[9px] text-slate-400 font-mono truncate">{u.email.split('@')[0]}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* SHC Members */}
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                    <Briefcase className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Scrutiny / Standing Hearing Committee (SHC Members)</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {demoUsers.filter(u => u.role === 'SHC_SAH').map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setLoginEmail(u.email);
                          setLoginPassword('123456');
                          handleDemoSwitch(u.id);
                        }}
                        className="text-left p-2 rounded-lg bg-slate-900/80 hover:bg-cyan-950/50 border border-slate-700/70 hover:border-cyan-500/60 transition group cursor-pointer"
                      >
                        <div className="font-semibold text-slate-200 text-xs truncate group-hover:text-cyan-300">{u.name}</div>
                        <div className="text-[9px] text-slate-400 font-mono truncate">{u.email.split('@')[0]}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* SAC Members */}
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                    <Scale className="w-3.5 h-3.5 text-rose-400" />
                    <span>Standing Appellate Committee & Hearing (SAC / SAH - Final Authority)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {demoUsers.filter(u => u.role === 'SAC').map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setLoginEmail(u.email);
                          setLoginPassword('123456');
                          handleDemoSwitch(u.id);
                        }}
                        className="text-left p-2 rounded-lg bg-slate-900/80 hover:bg-rose-950/50 border border-slate-700/70 hover:border-rose-500/60 transition group cursor-pointer"
                      >
                        <div className="font-semibold text-slate-200 text-xs truncate group-hover:text-rose-300">{u.name}</div>
                        <div className="text-[9px] text-slate-400 font-mono truncate">{u.email}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-slate-950 border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
          AICTE FlowTrack System • Demonstration prototype for Smart India Hackathon (SIH) Evaluation
        </footer>
      </div>
    );
  }

  if (!currentUser) {
    return renderLoginScreen();
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Top Banner Notice */}
      <div className="bg-amber-500 text-slate-900 px-4 py-1.5 text-xs font-semibold flex items-center justify-between shadow-xs border-b border-amber-600">
        <div className="flex items-center space-x-2">
          <span className="bg-amber-900 text-amber-100 text-[10px] px-2 py-0.5 rounded font-mono uppercase tracking-wider">Prototype</span>
          <span>AICTE FlowTrack • Configurable Task Allocation, Deadlines & Escalation Platform (Synthetic Demonstration Data)</span>
        </div>
        <span className="text-[11px] text-amber-950 font-medium">Verified for SIH Compliance Evaluation</span>
      </div>

      {/* Main Header */}
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => { setSelectedApp(null); setSelectedTask(null); setActiveTab('dashboard'); }}>
            <div className="w-9 h-9 bg-linear-to-br from-indigo-500 to-blue-600 rounded-lg flex items-center justify-center shadow-inner font-bold text-lg text-white">
              FT
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-white flex items-center space-x-2">
                <span>AICTE FlowTrack</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700/50">v2.0</span>
              </div>
              <div className="text-[11px] text-slate-400">Institutional Workflow & Regulatory Allocation Engine</div>
            </div>
          </div>

          {/* Quick Demo Role Switcher */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
              <span className="text-xs text-slate-400 px-2 flex items-center space-x-1">
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Role Switch:</span>
              </span>
              <select 
                className="bg-slate-900 text-slate-200 text-xs rounded border border-slate-700 px-2 py-1 focus:ring-1 focus:ring-indigo-500 font-medium"
                value={currentUser?.id || ''}
                onChange={(e) => handleDemoSwitch(e.target.value)}
              >
                {demoUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    [{u.role}] {u.name.length > 32 ? u.name.substring(0, 32) + '...' : u.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button 
                onClick={() => setNotificationOpen(!notificationOpen)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 relative transition-colors"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {notifications.filter(n => !n.is_read).length}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Panel */}
              {notificationOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 text-slate-800 z-50 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                    <span className="font-semibold text-xs text-slate-700 uppercase tracking-wider">Notifications & Reminders</span>
                    <button 
                      onClick={async () => {
                        await api.fetchNotifications();
                        loadData();
                      }}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-slate-400">No new notifications</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className={`p-3 hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-indigo-50/50' : ''}`}>
                          <div className="font-semibold text-slate-900 flex items-center justify-between">
                            <span>{n.title}</span>
                            <span className="text-[10px] text-slate-400">{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-slate-600 mt-1 text-[11px] leading-relaxed">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Pill & Logout */}
            <div className="flex items-center space-x-3 pl-2 border-l border-slate-800">
              <div className="hidden lg:block text-right">
                <div className="text-xs font-semibold text-white leading-tight">{currentUser?.name}</div>
                <div className="text-[10px] text-indigo-300 font-mono font-medium">{currentUser?.role}</div>
              </div>
              <button 
                onClick={handleLogout}
                className="p-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 rounded-lg border border-slate-700 transition-colors flex items-center space-x-1 text-xs"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Profile Navigation Tabs */}
        <div className="bg-slate-950 border-t border-slate-800/80 px-4 sm:px-8 flex space-x-2 overflow-x-auto">
          <button 
            onClick={() => { setSelectedApp(null); setSelectedTask(null); setActiveTab('dashboard'); }}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'dashboard' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <button 
            onClick={() => { setSelectedApp(null); setSelectedTask(null); setActiveTab('applications'); }}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'applications' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{currentUser?.role === 'INSTITUTION' ? 'My Sent Applications' : (currentUser?.role === 'EVC' || currentUser?.role === 'SHC_SAH' ? 'My Allotted Applications' : 'All Applications Queue')}</span>
          </button>

          {(currentUser?.role === 'REVIEWER' || currentUser?.role === 'HIGHER_OFFICER' || currentUser?.role === 'EVC' || currentUser?.role === 'SHC_SAH' || currentUser?.role === 'SAC') && (
            <button 
              onClick={() => { setSelectedApp(null); setSelectedTask(null); setActiveTab('tasks'); }}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap ${
                activeTab === 'tasks' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>{currentUser?.role === 'REVIEWER' || currentUser?.role === 'HIGHER_OFFICER' ? 'All Tasks Status' : 'My Allotted Tasks'}</span>
            </button>
          )}

          {currentUser?.role === 'HIGHER_OFFICER' && (
            <button 
              onClick={() => { setSelectedApp(null); setSelectedTask(null); setActiveTab('requests'); }}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap ${
                activeTab === 'requests' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Officer Requests</span>
              {extensionRequests.filter(r => r.status === 'PENDING').length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                  {extensionRequests.filter(r => r.status === 'PENDING').length}
                </span>
              )}
            </button>
          )}

          {currentUser?.role === 'HIGHER_OFFICER' && (
            <button 
              onClick={() => { setSelectedApp(null); setSelectedTask(null); setActiveTab('evc-reports'); }}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap ${
                activeTab === 'evc-reports' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>EVC Reports Review</span>
              {pendingReports.filter(r => r.report_type === 'EVC_REPORT').length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500 text-slate-950">
                  {pendingReports.filter(r => r.report_type === 'EVC_REPORT').length}
                </span>
              )}
            </button>
          )}

          {currentUser?.role === 'HIGHER_OFFICER' && (
            <button 
              onClick={() => { setSelectedApp(null); setSelectedTask(null); setActiveTab('overdue-escalations'); }}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap ${
                activeTab === 'overdue-escalations' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Overdue & Escalations</span>
              {overdueTasksData.totalOverdue > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                  {overdueTasksData.totalOverdue}
                </span>
              )}
            </button>
          )}

          {(currentUser?.role === 'INSTITUTION' || currentUser?.role === 'SAC' || currentUser?.role === 'HIGHER_OFFICER' || currentUser?.role === 'REVIEWER') && (
            <button 
              onClick={() => { setSelectedApp(null); setSelectedTask(null); setActiveTab('sac-appeals'); }}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap ${
                activeTab === 'sac-appeals' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Scale className="w-3.5 h-3.5 text-rose-400" />
              <span>
                {currentUser?.role === 'INSTITUTION' ? 'My Appeals (SAH)' : (currentUser?.role === 'SAC' ? 'My Allotted SAH Appeals (Final Authority)' : 'SAH Appeals Queue')}
              </span>
            </button>
          )}

          {currentUser?.role === 'HIGHER_OFFICER' && (
            <button 
              onClick={() => { setActiveTab('workload'); }}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap ${
                activeTab === 'workload' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Workload Oversight & Allocation</span>
            </button>
          )}

          {currentUser?.role === 'HIGHER_OFFICER' && (
            <button 
              onClick={() => { setActiveTab('policies'); }}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap ${
                activeTab === 'policies' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Deadline Policies Config</span>
            </button>
          )}
        </div>
      </header>

      {/* Main View Container */}
      <main className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex-1">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <div className="text-sm font-medium">Loading AICTE FlowTrack environment...</div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'applications' && renderApplicationsList()}
            {activeTab === 'tasks' && renderTasksList()}
            {activeTab === 'application-detail' && renderApplicationDetail()}
            {activeTab === 'task-detail' && renderTaskDetail()}
            {activeTab === 'requests' && renderExtensionRequestsList()}
            {activeTab === 'evc-reports' && renderEvcReportsReviewList()}
            {activeTab === 'overdue-escalations' && renderOverdueAndEscalations()}
            {activeTab === 'sac-appeals' && renderSacAppealsList()}
            {activeTab === 'workload' && renderWorkloadOversight()}
            {activeTab === 'policies' && renderDeadlinePolicies()}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-500">
        AICTE FlowTrack System • Workload-balanced allocation • Non-AI deadline engine • Persisted SQLite WAL records • Demo Environment
      </footer>

      {/* Render Action Modals */}
      {showNewAppModal && renderNewAppModal()}
      {showSubmitAppModal && renderSubmitAppModal()}
      {showSacAppealModal && renderSacAppealModal()}
      {showSacRecommendModal && renderSacRecommendModal()}
      {showSacDecisionModal && renderSacDecisionModal()}
      {showUploadDocModal && renderUploadDocModal()}
      {showClarifModal && renderClarificationModal()}
      {showRespondClarifModal && renderRespondClarifModal()}
      {showRouteModal && renderRouteModal()}
      {showTaskAssessModal && renderTaskAssessModal()}
      {showReportModal && renderReportModal()}
      {showFinalDecisionModal && renderFinalDecisionModal()}
      {showReassignModal && renderReassignModal()}
      {showExtendModal && renderExtendModal()}
      {showRequestExtensionModal && renderRequestExtensionModal()}
      {showRequestExtensionModal && renderRequestExtensionModal()}
    </div>
  );

  // =========================================================================
  // RENDER SECTIONS
  // =========================================================================

  function renderDashboard() {
    return (
      <div className="space-y-6">
        {/* Profile specific welcome banner */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                {currentUser?.role} Dashboard
              </span>
              <span className="text-xs text-slate-400">• Current Session</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">{currentUser?.name}</h1>
            <p className="text-xs text-slate-500 mt-0.5">{currentUser?.organization} • Workload signals active</p>
          </div>

          <div className="flex items-center space-x-3">
            {currentUser?.role === 'INSTITUTION' && (
              <button 
                onClick={() => setShowNewAppModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-2 transition-all"
              >
                <Building2 className="w-4 h-4" />
                <span>Submit New Application</span>
              </button>
            )}
            {currentUser?.role === 'HIGHER_OFFICER' && (
              <button 
                onClick={async () => {
                  const res = await api.fetchApplications();
                  const esc = await fetch('/api/monitoring/run-escalations', { method: 'POST', headers: api.getAuthHeaders() }).then(r => r.json());
                  alert(`Escalation Daemon Executed: ${esc.results?.overdueTasksDetected || 0} overdue tasks identified and flagged.`);
                  loadData();
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-slate-200 text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-2 transition-all"
              >
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Trigger Escalation Check</span>
              </button>
            )}
          </div>
        </div>

        {/* Real Persisted Database Metrics */}
        {renderRoleSpecificStats()}

        {/* Quick Applications Table */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>{currentUser?.role === 'INSTITUTION' ? 'Recent Applications' : 'Current Workflow Action Items'}</span>
            </h2>
            <button 
              onClick={() => setActiveTab('applications')}
              className="text-xs text-indigo-600 font-semibold hover:underline flex items-center space-x-1"
            >
              <span>View All Applications</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">App Reference</th>
                  <th className="px-5 py-3">Institution / Program</th>
                  <th className="px-5 py-3">Current Stage</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Submission Date</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.slice(0, 5).map(app => (
                  <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-medium text-indigo-600">
                      {app.application_no}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{app.institution_name}</div>
                      <div className="text-[11px] text-slate-500">{app.program_type} ({app.academic_year})</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {app.current_stage}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {renderStatusBadge(app.status)}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">
                      {app.user_submission_date || (app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : (app.status === 'DRAFT' ? 'Draft (Not Submitted)' : '—'))}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button 
                        onClick={() => handleSelectApp(app.id)}
                        className="px-2.5 py-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function renderRoleSpecificStats() {
    if (!stats) return null;

    if (currentUser?.role === 'INSTITUTION') {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium">Total Submitted</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
            <div className="text-xs text-amber-700 font-medium">Action Required (Clarification)</div>
            <div className="text-2xl font-bold text-amber-900 mt-1">{stats.requiringClarification || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-xs">
            <div className="text-xs text-blue-700 font-medium">Under Review / Inspection</div>
            <div className="text-2xl font-bold text-blue-900 mt-1">{stats.underReview || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
            <div className="text-xs text-emerald-700 font-medium">Approved Outcomes</div>
            <div className="text-2xl font-bold text-emerald-900 mt-1">{stats.approved || 0}</div>
          </div>
        </div>
      );
    }

    if (currentUser?.role === 'REVIEWER') {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="text-xs text-slate-500 font-medium">Pending Document Review</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{stats.pendingReviews || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
            <div className="text-xs text-amber-700 font-medium">Awaiting Clarification Response</div>
            <div className="text-2xl font-bold text-amber-900 mt-1">{stats.awaitingClarification || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50/20 shadow-xs">
            <div className="text-xs text-purple-700 font-medium">Reports Awaiting Review</div>
            <div className="text-2xl font-bold text-purple-900 mt-1">{stats.reportsAwaitingReview || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-indigo-200 bg-indigo-50/20 shadow-xs">
            <div className="text-xs text-indigo-700 font-medium">Ready for Final Review</div>
            <div className="text-2xl font-bold text-indigo-900 mt-1">{stats.readyForFinal || 0}</div>
          </div>
        </div>
      );
    }

    if (currentUser?.role === 'EVC' || currentUser?.role === 'SHC_SAH') {
      const activeCount = allTasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && t.status !== 'CLOSED').length;
      const completedCount = allTasks.filter(t => t.status === 'COMPLETED').length;
      const overdueCount = allTasks.filter(t => t.is_overdue === 1 && t.status !== 'COMPLETED').length;

      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-indigo-200 bg-indigo-50/20 shadow-xs">
            <div className="text-xs text-indigo-700 font-medium uppercase tracking-wider">Tasks Due (Active)</div>
            <div className="text-2xl font-bold text-indigo-900 mt-1">{activeCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Tasks currently awaiting action/submission</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
            <div className="text-xs text-emerald-700 font-medium uppercase tracking-wider">Tasks Completed</div>
            <div className="text-2xl font-bold text-emerald-900 mt-1">{completedCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Formal reports reviewed and accepted</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/20 shadow-xs">
            <div className="text-xs text-rose-700 font-medium uppercase tracking-wider">Tasks Overdue</div>
            <div className="text-2xl font-bold text-rose-900 mt-1">{overdueCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Lapsed target planning deadlines</div>
          </div>
        </div>
      );
    }

    if (currentUser?.role === 'SAC') {
      const activeCount = allTasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && t.status !== 'CLOSED').length;
      const completedCount = allTasks.filter(t => t.status === 'COMPLETED').length;
      const overdueCount = allTasks.filter(t => (t.is_overdue === 1 || new Date(t.target_due_at) < new Date()) && t.status !== 'COMPLETED').length;

      return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/20 shadow-xs">
            <div className="text-xs text-rose-700 font-medium uppercase tracking-wider">Allotted SAC Appeals (Active)</div>
            <div className="text-2xl font-bold text-rose-900 mt-1">{activeCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Statutory appeals assigned for panel review</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
            <div className="text-xs text-emerald-700 font-medium uppercase tracking-wider">Final Decisions Recorded</div>
            <div className="text-2xl font-bold text-emerald-900 mt-1">{completedCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Appeals decided with final binding authority</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
            <div className="text-xs text-amber-700 font-medium uppercase tracking-wider">Overdue Appeals</div>
            <div className="text-2xl font-bold text-amber-900 mt-1">{overdueCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Appeals exceeding configured SAC turnaround cap</div>
          </div>
        </div>
      );
    }

    if (currentUser?.role === 'HIGHER_OFFICER') {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-indigo-200 bg-indigo-50/20 shadow-xs">
            <div className="text-xs text-indigo-700 font-medium">Awaiting Final Decision</div>
            <div className="text-2xl font-bold text-indigo-900 mt-1">{stats.awaitingDecision || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
            <div className="text-xs text-emerald-700 font-medium">EVC Reports to Accept</div>
            <div className="text-2xl font-bold text-emerald-900 mt-1">{stats.evcReportsAwaitingAcceptance || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/20 shadow-xs">
            <div className="text-xs text-rose-700 font-medium">Overdue & Escalations</div>
            <div className="text-2xl font-bold text-rose-900 mt-1">{stats.overdueTasks || stats.escalatedTasks || 0}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50/20 shadow-xs">
            <div className="text-xs text-purple-700 font-medium">Pending SAC Appeals</div>
            <div className="text-2xl font-bold text-purple-900 mt-1">{stats.pendingSacAppeals || 0}</div>
          </div>
        </div>
      );
    }

    return null;
  }

  function renderApplicationsList() {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {currentUser?.role === 'INSTITUTION' ? 'My Sent Applications' : (currentUser?.role === 'EVC' || currentUser?.role === 'SHC_SAH' ? 'My Allotted Applications' : 'Institutional Applications Queue (All)')}
            </h1>
            <p className="text-xs text-slate-500">
              {currentUser?.role === 'INSTITUTION'
                ? 'Only applications submitted by your institutional account'
                : (currentUser?.role === 'EVC' || currentUser?.role === 'SHC_SAH'
                  ? 'Strictly applications where inspection/hearing work is allotted to you'
                  : 'Full regulatory queue visible to Reviewing Officer and Higher-Level Officials')}
            </p>
          </div>
          {currentUser?.role === 'INSTITUTION' && (
            <button 
              onClick={() => setShowNewAppModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-2"
            >
              <Building2 className="w-4 h-4" />
              <span>Create Application</span>
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">App Reference</th>
                  <th className="px-5 py-3">Institution & Location</th>
                  <th className="px-5 py-3">Discipline</th>
                  <th className="px-5 py-3">Submission Date</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Stage</th>
                  <th className="px-5 py-3">Assigned Route</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-400 italic">
                      {currentUser?.role === 'INSTITUTION' ? 'No applications created yet.' : 'No applications allotted to your profile at this time.'}
                    </td>
                  </tr>
                ) : (
                  applications.map(app => (
                    <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-medium text-indigo-600">
                        {app.application_no}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{app.institution_name}</div>
                        <div className="text-[11px] text-slate-500">{app.district}, {app.state}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-800">{app.institution_type}</div>
                        <div className="text-[11px] text-slate-500">{app.program_type}</div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {app.user_submission_date || (app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : (app.status === 'DRAFT' ? 'Draft (Not Submitted)' : '—'))}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="space-y-1">
                          {renderStatusBadge(app.status)}
                          {app.appeal_status && app.appeal_status !== 'NONE' && (
                            <div className="flex flex-wrap gap-1">
                              <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                SAH: {app.appeal_status}
                              </span>
                              {app.reappeal_count > 0 && (
                                <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                  Reappeal: {app.reappeal_count}/1
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {app.current_stage}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {app.assigned_route_id ? (
                          <span className="font-mono text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                            {app.assigned_route_id}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not Assigned</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button 
                          onClick={() => handleSelectApp(app.id)}
                          className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded text-xs transition-colors"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function renderTasksList() {
    const isOfficer = currentUser?.role === 'EVC' || currentUser?.role === 'SHC_SAH';

    const filteredTasks = allTasks.filter(t => {
      if (taskStatusFilter === 'COMPLETED') return t.status === 'COMPLETED';
      return t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && t.status !== 'CLOSED';
    });

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {isOfficer ? 'My Allotted Tasks' : 'Workflow Tasks Oversight'}
            </h1>
            <p className="text-xs text-slate-500">
              {isOfficer
                ? 'Concise view of inspection visits and hearing sessions assigned to your queue'
                : 'Overview of all EVC inspection panels and SHC committee tasks across institutions'}
            </p>
          </div>

          {/* Tasks Filter: Tasks Due and Tasks Completed */}
          <div className="flex items-center space-x-1 bg-slate-200/80 p-1 rounded-lg text-xs font-semibold">
            <button 
              onClick={() => setTaskStatusFilter('DUE')}
              className={`px-3 py-1.5 rounded-md transition-colors ${taskStatusFilter === 'DUE' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Tasks Due ({allTasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && t.status !== 'CLOSED').length})
            </button>
            <button 
              onClick={() => setTaskStatusFilter('COMPLETED')}
              className={`px-3 py-1.5 rounded-md transition-colors ${taskStatusFilter === 'COMPLETED' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Tasks Completed ({allTasks.filter(t => t.status === 'COMPLETED').length})
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Task Reference</th>
                  <th className="px-5 py-3">Stage / Type</th>
                  <th className="px-5 py-3">Application & Institute</th>
                  {!isOfficer && <th className="px-5 py-3">Assigned Officer</th>}
                  <th className="px-5 py-3">Extent / Scope</th>
                  <th className="px-5 py-3">Target Deadline</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={isOfficer ? 7 : 8} className="p-6 text-center text-slate-400 italic">
                      No tasks found in this view.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-medium text-indigo-600">
                        {t.task_number}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-indigo-100 text-indigo-800">
                          {t.task_type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{t.application_no}</div>
                        <div className="text-[11px] text-slate-500">{t.institution_name}</div>
                      </td>
                      {!isOfficer && (
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-slate-800">{t.assignee_name || 'Unassigned'}</div>
                          <div className="text-[10px] text-slate-400">{t.assignee_role || ''}</div>
                        </td>
                      )}
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {t.task_extent}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-xs">{t.extent_reason}</div>
                      </td>
                      <td className="px-5 py-3.5 font-bold text-slate-900">
                        {t.authorized_extended_due_at ? (
                          <span className="text-indigo-600">{new Date(t.authorized_extended_due_at).toLocaleDateString()} (Ext)</span>
                        ) : (
                          new Date(t.target_due_at).toLocaleDateString()
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center space-x-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            t.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                            t.status === 'SUBMITTED' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                            t.status === 'RETURNED_FOR_CORRECTION' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                            'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {t.status}
                          </span>
                          {t.is_overdue === 1 && (
                            <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded text-[9px] font-bold">
                              OVERDUE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button 
                          onClick={() => handleSelectTask(t.id)}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold"
                        >
                          Workspace
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function renderApplicationDetail() {
    if (!selectedApp) return null;
    const { application, route, documents, clarifications, tasks } = selectedApp;
    const evcTask = tasks?.find(t => t.task_type === 'EVC');
    const shcTask = tasks?.find(t => t.task_type === 'SHC_SAH');

    return (
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <button onClick={() => setActiveTab('applications')} className="hover:underline">Applications</button>
          <span>/</span>
          <span className="font-mono text-slate-800 font-semibold">{application.application_no}</span>
        </div>

        {/* Header Summary Card */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-xl font-bold text-slate-900">{application.application_no}</h1>
                {renderStatusBadge(application.status)}
                <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                  AY {application.academic_year}
                </span>
                {application.reappeal_count > 0 && (
                  <span className="text-[10px] font-mono uppercase bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200">
                    SAH Reappeal: {application.reappeal_count}/1
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-800 mt-1">{application.institution_name}</p>
              <p className="text-xs text-slate-500">{application.address}, {application.district}, {application.state}</p>
              <p className="text-xs text-indigo-700 font-medium mt-1">Discipline: {application.institution_type} • Course: {application.program_type}</p>
            </div>

            {/* Role-Specific Action Triggers */}
            <div className="flex flex-wrap items-center gap-2">
              {currentUser?.role === 'INSTITUTION' && application.status === 'DRAFT' && (
                <button 
                  onClick={() => setShowSubmitAppModal(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer"
                >
                  Submit Application
                </button>
              )}

              {currentUser?.role === 'INSTITUTION' && application.final_decision === 'REJECTED' && (
                (application.reappeal_count >= 1) ? (
                  <span className="px-3 py-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg flex items-center space-x-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span>Rejection Final (Re-appeal Limit Reached: 1/1)</span>
                  </span>
                ) : application.appeal_status === 'APPEAL_REJECTED' ? (
                  <span className="px-3 py-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg flex items-center space-x-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span>Appeal Dismissed by SAH (Final Binding Decision)</span>
                  </span>
                ) : application.appeal_status === 'IN_SAC_REVIEW' ? (
                  <span className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-lg flex items-center space-x-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>Appeal Under Deliberation by SAH</span>
                  </span>
                ) : (
                  <button 
                    onClick={() => setShowSacAppealModal(true)}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Scale className="w-4 h-4" />
                    <span>Submit Appeal to SAH</span>
                  </button>
                )
              )}

              {currentUser?.role === 'REVIEWER' && (
                <>
                  <button 
                    onClick={() => setShowClarifModal(true)}
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer"
                  >
                    Request Clarification
                  </button>

                  {!application.assigned_route_id ? (
                    <button 
                      onClick={() => setShowRouteModal(true)}
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer"
                    >
                      Select Workflow Route
                    </button>
                  ) : (
                    <span className="px-3 py-2 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 text-xs font-semibold flex items-center space-x-1.5 shadow-2xs">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Route Assigned</span>
                    </span>
                  )}

                  <button 
                    onClick={async () => {
                      if (confirm('Forward this application to Higher-Level Officer for final regulatory decision?')) {
                        const res = await api.forwardForFinalReview(application.id);
                        alert(res.message);
                        handleSelectApp(application.id);
                      }
                    }}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer"
                  >
                    Forward for Final Review
                  </button>
                </>
              )}

              {currentUser?.role === 'HIGHER_OFFICER' && (
                <button 
                  onClick={() => setShowFinalDecisionModal(true)}
                  className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer"
                >
                  <FileCheck2 className="w-4 h-4" />
                  <span>Record Final Decision</span>
                </button>
              )}
            </div>
          </div>

          {/* SAH Resubmission Alert Banner */}
          {(application.appeal_status === 'RESUBMISSION_ALLOWED' || application.appeal_status === 'RESUBMITTED') && (
            <div className="mt-4 p-4 rounded-xl bg-cyan-50/70 border border-cyan-300 text-xs text-cyan-900 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2 font-bold text-cyan-950">
                  <Scale className="w-4 h-4 text-cyan-700" />
                  <span>SAH Final Authority Order: One-Time Document Resubmission Granted (Reappeal Count: {application.reappeal_count || 1}/1)</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-200/80 text-cyan-900">
                  {application.appeal_status === 'RESUBMITTED' ? 'REVISED DOCUMENTS SUBMITTED' : 'ACTION REQUIRED: RESUBMISSION PENDING'}
                </span>
              </div>
              <p className="text-[11px] text-cyan-800 leading-relaxed">
                The Standing Appellate Hearing (SAH) has exercised its final appellate authority to allow your appeal, remanding the application directly to the Reviewing Officer under status <strong>Under Review</strong>. Upload revised supporting documents below within this existing application, then confirm resubmission for Reviewer scrutiny.
              </p>
              {currentUser?.role === 'INSTITUTION' && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button 
                    onClick={() => setShowUploadDocModal(true)}
                    className="px-3 py-1.5 bg-white border border-cyan-300 hover:bg-cyan-100 text-cyan-800 font-semibold rounded-lg text-xs flex items-center space-x-1 shadow-2xs cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Revised Supporting Document</span>
                  </button>
                  <button 
                    onClick={async () => {
                      const notes = prompt('Enter resubmission remarks for Reviewing Officer:', 'All deficiencies rectified in revised building plan and land documents as per SAH directive.');
                      if (notes === null) return;
                      const res = await api.resubmitApplicationDocuments(application.id, { notes });
                      if (res.error) alert(res.error);
                      else {
                        alert(res.message || 'Documents successfully resubmitted to Reviewing Officer.');
                        handleSelectApp(application.id);
                        loadData();
                      }
                    }}
                    className="px-4 py-1.5 bg-cyan-700 hover:bg-cyan-800 text-white font-semibold rounded-lg text-xs flex items-center space-x-1 shadow-xs cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Confirm & Resubmit Documents to Reviewer</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Workflow Route & Regulatory Notice */}
          <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-700 block mb-1">Configured Workflow Route</span>
              {route ? (
                <div>
                  <div className="font-bold text-indigo-700">{route.title}</div>
                  <div className="text-slate-500 mt-0.5 text-[11px]">{route.description}</div>
                  <div className="flex items-center space-x-1 mt-2">
                    {route.stages.map((stg, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-[9px]">
                        {stg}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <span className="text-slate-400 italic">Route selection pending document review. Note: Institutions cannot select workflow route.</span>
              )}
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-700 block">Allotted Inspection Officer</span>
                {evcTask && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-200">
                    EVC ALLOTTED
                  </span>
                )}
              </div>

              {evcTask ? (
                <div className="space-y-1">
                  <div className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                    <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>{evcTask.assignee_name || 'Unassigned'}</span>
                  </div>
                  <div className="text-indigo-700 font-semibold text-[11px]">
                    Task Ref: {evcTask.task_number} • Extent: {evcTask.task_extent}
                  </div>
                  <div className="text-slate-600 text-[11px] bg-white p-1.5 rounded border border-slate-200">
                    <span className="font-semibold text-slate-800">Workload: </span>
                    {evcTask.active_tasks_before_assignment} active tasks before allocation → {evcTask.active_tasks_after_assignment || evcTask.active_tasks_before_assignment + 1} after
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center justify-between pt-0.5">
                    <span>Due: {new Date(evcTask.target_due_at).toLocaleDateString()}</span>
                    <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
                      evcTask.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                      evcTask.status === 'SUBMITTED' ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-200 text-slate-700'
                    }`}>
                      {evcTask.status}
                    </span>
                  </div>
                </div>
              ) : shcTask ? (
                <div className="space-y-1">
                  <div className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                    <UserCheck className="w-4 h-4 text-cyan-600 shrink-0" />
                    <span>{shcTask.assignee_name || 'Unassigned'}</span>
                  </div>
                  <div className="text-cyan-700 font-semibold text-[11px]">
                    SHC/SAH Task Ref: {shcTask.task_number} • Extent: {shcTask.task_extent}
                  </div>
                  <div className="text-slate-600 text-[11px] bg-white p-1.5 rounded border border-slate-200">
                    <span className="font-semibold text-slate-800">Workload: </span>
                    {shcTask.active_tasks_before_assignment} active tasks before allocation → {shcTask.active_tasks_after_assignment || shcTask.active_tasks_before_assignment + 1} after
                  </div>
                </div>
              ) : application.assigned_route_id ? (
                <div>
                  <div className="font-bold text-slate-800">Route Assigned</div>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    {application.current_stage === 'FINAL_REVIEW' ? 'Document Evaluation Pathway (Direct Final Review)' : 'Stage allocation in progress'}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-bold text-amber-800 text-xs">Route Selection Pending</div>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    Review uploaded documents above and select configured workflow route to allocate inspecting officer.
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="font-semibold text-slate-700 block mb-1">Final Regulatory Decision</span>
              {application.final_decision ? (
                <div>
                  <div className={`font-bold text-sm ${application.final_decision === 'APPROVED' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {application.final_decision}
                  </div>
                  <div className="text-slate-600 text-[11px] mt-0.5">{application.final_decision_reason}</div>
                  <div className="text-[10px] text-slate-400 mt-1">By {application.final_decision_by} on {new Date(application.final_decision_at).toLocaleDateString()}</div>
                </div>
              ) : (
                <span className="text-slate-400 italic">Decision not yet recorded by Higher-Level Officer.</span>
              )}
            </div>
          </div>
        </div>

        {/* Section 1: Uploaded Supporting Documents & Verification */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Supporting Documents & Manual Review</span>
            </h2>
            {currentUser?.role === 'INSTITUTION' && (
              <button 
                onClick={() => setShowUploadDocModal(true)}
                className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded text-xs flex items-center space-x-1 border border-indigo-200"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Document</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">File Name</th>
                  <th className="px-4 py-2.5">Review Status</th>
                  <th className="px-4 py-2.5">Officer Review Notes</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-400">No documents uploaded yet.</td>
                  </tr>
                ) : (
                  documents.map(doc => (
                    <tr key={doc.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <span>{doc.document_category}</span>
                        {doc.appeal_id && (
                          <span className="ml-1.5 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-100 text-rose-800">
                            APPEAL DOC
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-indigo-600">{doc.document_name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          doc.review_status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800' :
                          doc.review_status === 'CORRECTION_REQUIRED' ? 'bg-amber-100 text-amber-800' :
                          doc.review_status === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {doc.review_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 italic">{doc.review_notes || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button 
                            onClick={async () => {
                              const res = await api.viewDocument(doc.id);
                              if (res.error) alert(res.error);
                              else alert(`Access Granted: ${res.document?.document_name} (${res.document?.document_category})\nSecure File Path: ${res.view_url}\nRBAC Verification: Logged in immutable audit trail.`);
                            }}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-[10px]"
                          >
                            View
                          </button>
                          {currentUser?.role === 'REVIEWER' && (
                            <>
                              <button 
                                onClick={async () => {
                                  const notes = prompt('Enter review observation:', 'Verified in order.');
                                  await api.reviewDocument(doc.id, { review_status: 'ACCEPTED', review_notes: notes });
                                  handleSelectApp(application.id);
                                }}
                                className="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-semibold text-[10px]"
                              >
                                Accept
                              </button>
                              <button 
                                onClick={async () => {
                                  const notes = prompt('Enter defect / correction reason:');
                                  if (!notes) return;
                                  await api.reviewDocument(doc.id, { review_status: 'CORRECTION_REQUIRED', review_notes: notes });
                                  handleSelectApp(application.id);
                                }}
                                className="px-2 py-0.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded font-semibold text-[10px]"
                              >
                                Require Fix
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Clarification Requests & Institutional Responses */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center space-x-2">
            <HelpCircle className="w-4 h-4 text-amber-600" />
            <span>Clarification & Correction History</span>
          </h2>

          <div className="space-y-3">
            {clarifications.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No clarification requests recorded for this application.</p>
            ) : (
              clarifications.map(clr => (
                <div key={clr.id} className="p-4 rounded-lg bg-amber-50/40 border border-amber-200 text-xs space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-amber-900">Clarification by {clr.requested_by_name}</span>
                    <span className="text-[10px] text-amber-700 font-medium">Due: {new Date(clr.target_deadline).toLocaleDateString()}</span>
                  </div>
                  <p className="text-slate-800 font-medium">{clr.request_details}</p>
                  {clr.specific_documents_required && (
                    <p className="text-[11px] text-slate-600">Required: <span className="font-semibold">{clr.specific_documents_required}</span></p>
                  )}

                  {clr.response_text ? (
                    <div className="mt-2 pt-2 border-t border-amber-200/80 bg-white/80 p-2.5 rounded">
                      <span className="font-semibold text-emerald-800 block text-[11px]">Institution Response:</span>
                      <p className="text-slate-700 mt-0.5">{clr.response_text}</p>
                      <span className="text-[10px] text-slate-400 mt-1 block">Submitted on {new Date(clr.responded_at).toLocaleDateString()}</span>
                    </div>
                  ) : (
                    currentUser?.role === 'INSTITUTION' && (
                      <button 
                        onClick={() => { setSelectedClarif(clr); setShowRespondClarifModal(true); }}
                        className="mt-2 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold text-xs"
                      >
                        Submit Response & Uploads
                      </button>
                    )
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Section 3: Allocated Stage Tasks (EVC & SHC/SAH) - Hidden from Institution */}
        {currentUser?.role !== 'INSTITUTION' && (
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-indigo-600" />
                <span>
                  {currentUser?.role === 'REVIEWER' || currentUser?.role === 'HIGHER_OFFICER'
                    ? 'All Assigned Workflow Tasks & Deadline Evidence'
                    : 'My Allotted Task in this Application'}
                </span>
              </h2>
            </div>

            <div className="space-y-4">
              {tasks.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No inspection or committee tasks allocated yet.</p>
              ) : (
                tasks.map(tsk => (
                  <div key={tsk.id} className="p-4 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors bg-white">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-indigo-700 font-mono text-xs">{tsk.task_number}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                          {tsk.task_type}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          Extent: {tsk.task_extent}
                        </span>
                        {tsk.is_overdue === 1 && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 flex items-center space-x-1">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>OVERDUE</span>
                          </span>
                        )}
                        {tsk.is_cap_reached === 1 && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                            CAP REACHED
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-slate-700">Assignee: {tsk.assignee_name || 'Unassigned'}</span>
                        <button 
                          onClick={() => handleSelectTask(tsk.id)}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold"
                        >
                          Open Task Workspace
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Extent Assessment Reason</span>
                        <span className="text-slate-700 font-medium">{tsk.extent_reason}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Workload at Assignment</span>
                        <span className="text-slate-700 font-medium">
                          {tsk.active_tasks_before_assignment} active tasks before → {tsk.active_tasks_after_assignment || tsk.active_tasks_before_assignment + 1} after
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Target Planning Deadline</span>
                        <span className="font-bold text-slate-900">
                          {tsk.authorized_extended_due_at ? (
                            <span className="text-indigo-600">{new Date(tsk.authorized_extended_due_at).toLocaleDateString()} (Extended)</span>
                          ) : (
                            new Date(tsk.target_due_at).toLocaleDateString()
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 p-2 bg-indigo-50/60 rounded text-[11px] text-indigo-950 border border-indigo-100 font-mono">
                      <span className="font-semibold text-indigo-900">Allocation Transparency: </span>
                      {tsk.allocation_reason || `Selected because this officer had the lowest active workload, with ${tsk.active_tasks_before_assignment} active tasks before assignment.`}
                    </div>
                  </div>
                ))
              )}

              {/* Sequential Stage: If route includes SHC_SAH and no SHC task allocated yet */}
              {route && route.stages && route.stages.includes('SHC_SAH') && !tasks.some(t => t.task_type === 'SHC_SAH') && (
                <div className="p-4 rounded-xl border border-dashed border-cyan-300 bg-cyan-50/50 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-cyan-900">STAGE 2: SHC/SAH</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
                        PENDING EVC REPORT ACCEPTANCE
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-slate-700 border border-slate-200">
                        Saved Extent: {application.shc_task_extent || 'MEDIUM'}
                      </span>
                    </div>
                    <span className="text-[11px] text-cyan-700 font-semibold italic">Sequential Workflow</span>
                  </div>
                  <div className="text-xs text-slate-700">
                    <span className="font-semibold text-slate-800">Assessed Justification: </span>
                    <span>{application.shc_extent_reason || 'Standing Hearing Committee session planned for compliance verification.'}</span>
                  </div>
                  <div className="text-[11px] text-cyan-900 bg-white/90 p-2 rounded border border-cyan-200">
                    ⚡ <strong>Sequential Activation Rule:</strong> When the EVC inspection report is submitted and formally accepted by the Reviewing Officer, the system will automatically activate this stage, allocate it to the SHC member with the fewest active tasks at that time, and calculate its target deadline using this saved extent.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderTaskDetail() {
    if (!selectedTask) return null;
    const { task, reports, reassignments, extensions } = selectedTask;

    return (
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <button onClick={() => setActiveTab('applications')} className="hover:underline">Applications</button>
          <span>/</span>
          <button onClick={() => handleSelectApp(task.application_id)} className="hover:underline font-mono">{task.application_no}</button>
          <span>/</span>
          <span className="font-mono text-slate-800 font-semibold">{task.task_number}</span>
        </div>

        {/* 1. Primary Highlight Block: The Allotted Task */}
        <div className="bg-linear-to-r from-indigo-900 to-slate-900 text-white rounded-xl shadow-lg border border-indigo-700/50 p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
                  {task.task_type} ALLOTTED TASK
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  task.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                  task.status === 'SUBMITTED' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                  task.status === 'RETURNED_FOR_CORRECTION' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                  'bg-slate-700 text-slate-300 border border-slate-600'
                }`}>
                  Status: {task.status}
                </span>
                {task.is_overdue === 1 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/30 text-rose-200 border border-rose-500/50 flex items-center space-x-1">
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    <span>OVERDUE</span>
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-bold font-mono tracking-tight text-white">{task.task_number}</h1>
              
              <div className="text-xs text-slate-300 space-y-1">
                <div><span className="text-slate-400">Assessed Extent:</span> <strong className="text-white">{task.task_extent}</strong> — {task.extent_reason}</div>
                <div><span className="text-slate-400">Application Reference:</span> <strong className="text-indigo-300 font-mono">{task.application_no}</strong> ({task.institution_name})</div>
                <div><span className="text-slate-400">Program / Proposal:</span> <span className="text-slate-200">{task.program_type} ({task.institution_type})</span></div>
              </div>

              <div className="pt-2 flex items-center space-x-3 text-xs">
                <div className="bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
                  <span className="text-slate-400 block text-[10px] uppercase tracking-wider">Target Planning Deadline</span>
                  <span className="font-bold text-amber-400">
                    {task.authorized_extended_due_at ? (
                      <span>{new Date(task.authorized_extended_due_at).toLocaleDateString()} (Extended)</span>
                    ) : (
                      new Date(task.target_due_at).toLocaleDateString()
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Officer Actions Column */}
            <div className="flex flex-col space-y-2 min-w-56">
              {(currentUser?.role === 'EVC' || currentUser?.role === 'SHC_SAH') && task.assignee_id === currentUser?.id && (
                <>
                  <button 
                    onClick={() => setShowReportModal(true)}
                    className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    <span>Submit Task Report</span>
                  </button>

                  <button 
                    onClick={() => setShowRequestExtensionModal(true)}
                    className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 text-xs font-semibold rounded-lg border border-amber-500/30 shadow-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Request Deadline Extension</span>
                  </button>
                </>
              )}

              {currentUser?.role === 'HIGHER_OFFICER' && (
                <>
                  <button 
                    onClick={() => setShowReassignModal(true)}
                    className="w-full px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg shadow-xs"
                  >
                    Reassign Work
                  </button>
                  <button 
                    onClick={() => setShowExtendModal(true)}
                    className="w-full px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg shadow-xs"
                  >
                    Authorise Extension
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 2. Task Details Section */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
            <span>Inspection & Schedule Details</span>
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs mb-1">
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <span className="text-[10px] text-slate-400 block uppercase">Task Type</span>
              <span className="font-bold text-slate-800">{task.task_type}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <span className="text-[10px] text-slate-400 block uppercase">Assessed Extent</span>
              <span className="font-bold text-slate-800">{task.task_extent}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <span className="text-[10px] text-slate-400 block uppercase">Effective Due Date</span>
              <span className="font-bold text-indigo-600">
                {task.authorized_extended_due_at ? (
                  <span>{new Date(task.authorized_extended_due_at).toLocaleDateString()} (Extended)</span>
                ) : (
                  new Date(task.target_due_at).toLocaleDateString()
                )}
              </span>
            </div>
          </div>

          {/* Workload-Based Allocation Transparency */}
          <div className="mt-4 p-3 bg-indigo-50/70 rounded-lg border border-indigo-100 text-xs">
            <div className="font-bold text-indigo-950 flex items-center justify-between mb-2">
              <div className="flex items-center space-x-1.5">
                <UserCheck className="w-3.5 h-3.5 text-indigo-700" />
                <span>Workload-Based Allocation Transparency</span>
              </div>
              <span className="text-[10px] text-indigo-800 font-mono bg-white px-2 py-0.5 rounded border border-indigo-200">
                Database Verified
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-700 mb-2">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Allocated Officer</span>
                <span className="font-bold text-slate-900">{task.assignee_name || 'Unassigned'} ({task.assignee_role || ''})</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Workload Before & After Allocation</span>
                <span className="font-bold text-indigo-900">
                  {task.active_tasks_before_assignment} active tasks before → {task.active_tasks_after_assignment || task.active_tasks_before_assignment + 1} active tasks after
                </span>
              </div>
            </div>
            <div className="p-2.5 rounded bg-white border border-indigo-200 text-[11px] text-slate-800 font-mono leading-relaxed">
              <span className="font-bold text-indigo-950">Allocation Reason: </span>
              {task.allocation_reason || `Selected because this officer had the lowest active workload (${task.active_tasks_before_assignment} active tasks) at the time of allocation.`}
            </div>
          </div>
        </div>

        {/* Reports & Committee Records Section */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center space-x-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>Submitted Inspection & Committee Records</span>
          </h2>

          <div className="space-y-4">
            {reports.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No formal reports submitted for this task yet.</p>
            ) : (
              reports.map(rep => (
                <div key={rep.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-bold text-slate-900 text-xs">{rep.report_type} (v{rep.version})</span>
                      <div className="text-[11px] text-slate-500">Conducted: {rep.conducted_date || 'N/A'} • Mode: {rep.venue_mode}</div>
                    </div>
                    <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                      rep.recommendation === 'RECOMMENDED' ? 'bg-emerald-100 text-emerald-800' :
                      rep.recommendation === 'NOT_RECOMMENDED' ? 'bg-rose-100 text-rose-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      Recommendation: {rep.recommendation}
                    </span>
                  </div>

                  <div className="text-xs space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                    <div>
                      <span className="font-semibold text-slate-700 block text-[11px]">Officer Observations:</span>
                      <p className="text-slate-800 mt-0.5">{rep.observations}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700 block text-[11px]">Deficiencies Noted:</span>
                      <p className="text-slate-800 mt-0.5">{rep.deficiencies_noted}</p>
                    </div>
                  </div>

                  {rep.review_status === 'SUBMITTED' && (
                    <div className="pt-2">
                      {rep.report_type === 'EVC_REPORT' ? (
                        currentUser?.role === 'HIGHER_OFFICER' ? (
                          <div className="flex items-center space-x-2">
                            <button 
                              onClick={async () => {
                                const res = await api.reviewReport(rep.id, { review_status: 'ACCEPTED', review_feedback: 'EVC inspection report verified and formally accepted by Higher-Level Officer.' });
                                if (res.error) alert(res.error);
                                else {
                                  alert('EVC Report accepted by Higher-Level Officer! Sequential SHC stage activated if in route.');
                                  handleSelectTask(task.id);
                                  loadData();
                                }
                              }}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
                            >
                              Accept EVC Report (Higher Officer)
                            </button>
                            <button 
                              onClick={async () => {
                                const fb = prompt('Enter return feedback / correction requirements:');
                                if (!fb) return;
                                const res = await api.reviewReport(rep.id, { review_status: 'CORRECTION_REQUIRED', review_feedback: fb });
                                if (res.error) alert(res.error);
                                else {
                                  alert('EVC Report returned for correction.');
                                  handleSelectTask(task.id);
                                  loadData();
                                }
                              }}
                              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold"
                            >
                              Return for Correction
                            </button>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-medium flex items-center space-x-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>EVC Inspection Report submitted — Awaiting Higher-Level Officer review and acceptance. (Reviewing Officer may view only).</span>
                          </div>
                        )
                      ) : (
                        (currentUser?.role === 'REVIEWER' || currentUser?.role === 'HIGHER_OFFICER') && (
                          <div className="flex items-center space-x-2">
                            <button 
                              onClick={async () => {
                                await api.reviewReport(rep.id, { review_status: 'ACCEPTED', review_feedback: 'Report verified and accepted.' });
                                alert('Report accepted and stage marked complete!');
                                handleSelectTask(task.id);
                                loadData();
                              }}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
                            >
                              Accept Report
                            </button>
                            <button 
                              onClick={async () => {
                                const fb = prompt('Enter return feedback / missing information:');
                                if (!fb) return;
                                await api.reviewReport(rep.id, { review_status: 'CORRECTION_REQUIRED', review_feedback: fb });
                                alert('Report returned for correction.');
                                handleSelectTask(task.id);
                                loadData();
                              }}
                              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold"
                            >
                              Return for Correction
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Reassignment & Deadline Extension Histories */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Reassignment Audit History</h3>
            <div className="space-y-2 text-xs">
              {reassignments.length === 0 ? (
                <p className="text-slate-400 italic">No reassignments recorded.</p>
              ) : (
                reassignments.map(r => (
                  <div key={r.id} className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <div className="font-semibold text-slate-800">{r.prev_name || 'Unassigned'} → {r.next_name}</div>
                    <div className="text-slate-600 text-[11px] mt-0.5">{r.reason}</div>
                    <div className="text-[10px] text-slate-400 mt-1">Reassigned by {r.reassigned_by_name} on {new Date(r.reassigned_at).toLocaleDateString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Authorised Deadline Extensions</h3>
            <div className="space-y-2 text-xs">
              {extensions.length === 0 ? (
                <p className="text-slate-400 italic">No deadline extensions authorised.</p>
              ) : (
                extensions.map(e => (
                  <div key={e.id} className="p-2.5 rounded bg-slate-50 border border-slate-200">
                    <div className="font-semibold text-slate-800">New Deadline: {new Date(e.requested_deadline).toLocaleDateString()}</div>
                    <div className="text-slate-600 text-[11px] mt-0.5">{e.reason}</div>
                    <div className="text-[10px] text-slate-400 mt-1">Authorised by {e.approver_name} on {new Date(e.created_at).toLocaleDateString()}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderExtensionRequestsList() {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Officer Deadline Extension Requests</h1>
          <p className="text-xs text-slate-500">
            Requests submitted by assigned EVC inspection personnel and SHC committee members awaiting Higher-Level Officer review
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Task Reference</th>
                  <th className="px-5 py-3">Requesting Officer</th>
                  <th className="px-5 py-3">Application / College</th>
                  <th className="px-5 py-3">Current Due Date</th>
                  <th className="px-5 py-3">Requested Extended Date</th>
                  <th className="px-5 py-3">Reason / Justification</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {extensionRequests.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-400 italic">
                      No deadline extension requests recorded.
                    </td>
                  </tr>
                ) : (
                  extensionRequests.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-bold text-indigo-600">
                        {r.task_number}
                        <span className="block text-[10px] text-slate-400 font-sans font-normal">{r.task_type}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">{r.requester_name}</div>
                        <div className="text-[10px] text-indigo-600 font-semibold">{r.requester_role} • {r.requester_email}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-800">{r.application_no}</div>
                        <div className="text-[11px] text-slate-500">{r.institution_name}</div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {new Date(r.previous_deadline).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-amber-700">
                        {new Date(r.requested_deadline).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5 text-slate-700 max-w-xs">
                        {r.reason}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                          r.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {r.status}
                        </span>
                        {r.status === 'APPROVED' && r.approver_name && (
                          <div className="text-[10px] text-slate-400 mt-0.5">Approved by {r.approver_name}</div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1">
                        {r.status === 'PENDING' ? (
                          <>
                            <button 
                              onClick={async () => {
                                const reason = prompt('Enter approval justification/confirmation remarks:', 'Approved under institutional circumstances');
                                if (!reason) return;
                                await api.extendDeadline(r.task_id, {
                                  extendedDueAt: r.requested_deadline,
                                  reason,
                                  extensionRequestId: r.id
                                });
                                alert(`Deadline extension approved for ${r.requester_name}.`);
                                loadData();
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
                            >
                              Approve
                            </button>
                            <button 
                              onClick={async () => {
                                const notes = prompt('Enter rejection reason:');
                                if (!notes) return;
                                await api.rejectExtensionRequest(r.id, notes);
                                alert('Extension request rejected.');
                                loadData();
                              }}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold"
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Decided</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function renderWorkloadOversight() {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900">Workload-Balanced Allocation Oversight</h1>
              <p className="text-xs text-slate-500">Real persisted active task distribution among eligible inspection and hearing officers</p>
            </div>
            <div className="text-xs text-amber-900 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
              <strong>Core Rule:</strong> Allocates tasks solely based on current active task counts. Experience, expertise, and performance ratings are strictly excluded.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Officer Name</th>
                  <th className="px-5 py-3">Role Profile</th>
                  <th className="px-5 py-3 text-center">Active Tasks (Signal)</th>
                  <th className="px-5 py-3 text-center">Overdue Tasks</th>
                  <th className="px-5 py-3 text-center">Cap Reached Tasks</th>
                  <th className="px-5 py-3 text-center">Completed Tasks</th>
                  <th className="px-5 py-3 text-right">Availability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats?.workloadSnapshot?.map(w => (
                  <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{w.name}</div>
                      <div className="text-[11px] text-slate-400">{w.email}</div>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-700">{w.role}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`px-2.5 py-1 rounded-full font-bold text-xs ${
                        w.active_task_count === 0 ? 'bg-emerald-100 text-emerald-800' :
                        w.active_task_count < 3 ? 'bg-blue-100 text-blue-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {w.active_task_count}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {w.overdue_task_count > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                          {w.overdue_task_count}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {w.cap_reached_count > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                          {w.cap_reached_count}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center font-medium text-slate-700">
                      {w.completed_task_count}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                        Available
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function renderDeadlinePolicies() {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
          <h1 className="text-lg font-bold text-slate-900 mb-1">Configurable Task-Type Deadline Policies</h1>
          <p className="text-xs text-slate-500 mb-4">
            Transparent policy matrices defining base duration by assessed extent, workload buffer days, and hard maximum completion caps.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {policies.map(pol => (
              <div key={pol.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3 text-xs">
                <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span className="font-bold text-indigo-700 text-sm">{pol.task_type} POLICY</span>
                  <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px]">v{pol.version}</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Small Base</span>
                    <span className="font-bold text-slate-800">{pol.base_duration_small} days</span>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Medium Base</span>
                    <span className="font-bold text-slate-800">{pol.base_duration_medium} days</span>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Large Base</span>
                    <span className="font-bold text-slate-800">{pol.base_duration_large} days</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Buffer Per Active Task</span>
                    <span className="font-bold text-slate-800">+{pol.workload_buffer_per_task} day/task</span>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Hard Maximum Cap</span>
                    <span className="font-bold text-rose-700">{pol.max_allowed_duration} days max</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderAuditLogs() {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Append-Only Audit Log</h1>
          <p className="text-xs text-slate-500">Immutable record of submissions, route assignments, task allocations, and decisions</p>
        </div>

        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Event Type</th>
                  <th className="px-5 py-3">Entity Type & ID</th>
                  <th className="px-5 py-3">Actor & Role</th>
                  <th className="px-5 py-3">Reason / Justification</th>
                  <th className="px-5 py-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3 font-semibold text-indigo-700">{log.event_type}</td>
                    <td className="px-5 py-3 text-slate-800">{log.entity_type} ({log.entity_id})</td>
                    <td className="px-5 py-3 font-sans text-slate-700">{log.actor_name} [{log.actor_role}]</td>
                    <td className="px-5 py-3 font-sans text-slate-500">{log.reason || '—'}</td>
                    <td className="px-5 py-3 text-right text-slate-400">{new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function renderStatusBadge(status) {
    const config = {
      DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
      SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
      UNDER_DOCUMENT_REVIEW: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      UNDER_REVIEW: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      AWAITING_CLARIFICATION: 'bg-amber-50 text-amber-700 border-amber-200',
      CLARIFICATION_SUBMITTED: 'bg-sky-50 text-sky-700 border-sky-200',
      ROUTE_ASSIGNED: 'bg-purple-50 text-purple-700 border-purple-200',
      IN_EVC: 'bg-blue-50 text-blue-700 border-blue-200',
      IN_SHC_SAH: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      READY_FOR_FINAL_REVIEW: 'bg-violet-50 text-violet-700 border-violet-200',
      APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      REJECTED: 'bg-rose-50 text-rose-800 border-rose-200',
      RETURNED_FOR_FURTHER_INFO: 'bg-orange-50 text-orange-800 border-orange-200'
    };
    const c = config[status] || 'bg-slate-100 text-slate-700 border-slate-200';
    const displayLabel = status === 'UNDER_DOCUMENT_REVIEW' ? 'UNDER REVIEW' : status;
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${c}`}>
        {displayLabel}
      </span>
    );
  }

  // =========================================================================
  // ACTION MODALS
  // =========================================================================

  function renderNewAppModal() {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Create Institutional Application</h3>
            <button onClick={() => setShowNewAppModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target;
            const res = await api.createApplication({
              institution_type: form.institution_type.value,
              program_type: form.program_type.value,
              academic_year: '2026-2027',
              address: form.address.value,
              state: form.state.value,
              district: form.district.value
            });
            setShowNewAppModal(false);
            alert(`Application ${res.application_no} created in Draft status.`);
            loadData();
          }} className="space-y-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Discipline Category</label>
              <select name="institution_type" className="w-full p-2 border border-slate-200 rounded">
                <option value="Engineering & Technology">Engineering & Technology</option>
                <option value="Management">Management</option>
                <option value="Pharmacy">Pharmacy</option>
                <option value="Architecture & Planning">Architecture & Planning</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Program & Course Proposal</label>
              <input name="program_type" placeholder="e.g. UG - B.Tech in Artificial Intelligence & Data Science" required className="w-full p-2 border border-slate-200 rounded" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">State</label>
                <input name="state" defaultValue="Delhi" required className="w-full p-2 border border-slate-200 rounded" />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">District</label>
                <input name="district" defaultValue="New Delhi" required className="w-full p-2 border border-slate-200 rounded" />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Campus Physical Address</label>
              <textarea name="address" rows={2} defaultValue="Institutional Area, Sector 62" required className="w-full p-2 border border-slate-200 rounded"></textarea>
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowNewAppModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-indigo-600 text-white font-semibold">Save Draft</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderClarificationModal() {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Issue Institutional Clarification Request</h3>
            <button onClick={() => setShowClarifModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target;
            await api.requestClarification(selectedApp.application.id, {
              request_details: form.request_details.value,
              specific_documents_required: form.specific_documents.value,
              target_deadline_days: parseInt(form.deadline_days.value)
            });
            setShowClarifModal(false);
            alert('Clarification request dispatched to institution.');
            handleSelectApp(selectedApp.application.id);
          }} className="space-y-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Specific Information or Defect Clarification Required</label>
              <textarea name="request_details" rows={3} required placeholder="Specify exactly what document or explanation is deficient..." className="w-full p-2 border border-slate-200 rounded"></textarea>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Specific Documents to be Re-uploaded</label>
              <input name="specific_documents" placeholder="e.g. Non-Judicial Notarized Affidavit with current validity" className="w-full p-2 border border-slate-200 rounded" />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Response Target Deadline</label>
              <select name="deadline_days" className="w-full p-2 border border-slate-200 rounded">
                <option value="3">3 Days (Urgent)</option>
                <option value="5">5 Days (Standard Policy)</option>
                <option value="7">7 Days (Extended Period)</option>
              </select>
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowClarifModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-amber-600 text-white font-semibold">Issue Clarification</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderRespondClarifModal() {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Submit Clarification Response</h3>
            <button onClick={() => setShowRespondClarifModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target;
            await api.respondClarification(selectedClarif.id, {
              response_text: form.response_text.value
            });
            setShowRespondClarifModal(false);
            alert('Clarification response submitted to reviewing officer.');
            handleSelectApp(selectedApp.application.id);
          }} className="space-y-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Institution Explanation & Compliance Remarks</label>
              <textarea name="response_text" rows={4} required placeholder="Detail the corrected items or uploaded replacement records..." className="w-full p-2 border border-slate-200 rounded"></textarea>
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowRespondClarifModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-indigo-600 text-white font-semibold">Submit Response</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderRouteModal() {
    const isEvcIncluded = selectedRouteId === 'ROUTE-SCRUTINY-EVC' || selectedRouteId === 'ROUTE-EVC-SHC' || selectedRouteId === 'ROUTE-EVC-ONLY';
    const isShcIncluded = selectedRouteId === 'ROUTE-EVC-SHC';

    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 text-xs space-y-4 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Reviewer Workflow Route & Stage Assessment</h3>
              <p className="text-[11px] text-slate-500">Configure regulatory pathway and assess task sizing for all included committee stages.</p>
            </div>
            <button onClick={() => setShowRouteModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target;
            try {
              const res = await api.selectWorkflowRoute(selectedApp.application.id, {
                route_id: selectedRouteId,
                route_selection_reason: form.reason.value,
                evc_task_extent: isEvcIncluded ? evcExtent : null,
                evc_extent_reason: isEvcIncluded ? evcReason : null,
                shc_task_extent: isShcIncluded ? shcExtent : null,
                shc_extent_reason: isShcIncluded ? shcReason : null
              });

              if (res.error) {
                alert('Route assignment error: ' + res.error);
                return;
              }

              setShowRouteModal(false);
              let msg = 'Workflow route and stage assessment confirmed!';
              if (res.allocatedTask) {
                msg += `\n\n[Stage 1 Initiated: ${res.allocatedTask.taskType}]\n- Assigned Officer: ${res.allocatedTask.assignee?.name || 'Officer'}\n- Transparency: ${res.allocatedTask.allocationReason || ''}`;
              }
              if (isShcIncluded) {
                msg += '\n\n[Stage 2 Saved: SHC/SAH Hearing]\n- Status: Pending Activation\n- Will automatically allocate to lowest-workload SHC member once EVC report is accepted.';
              }
              alert(msg);
              handleSelectApp(selectedApp.application.id);
            } catch (err) {
              alert('Error selecting route: ' + err.message);
            }
          }} className="space-y-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Select Configured Route <span className="text-rose-500">*</span></label>
              <select 
                name="route_id" 
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded font-medium bg-white"
              >
                <option value="ROUTE-EVC-SHC">EVC + Standing Hearing Committee (SHC/SAH) [Sequential Pathway]</option>
                <option value="ROUTE-SCRUTINY-EVC">Scrutiny + Expert Visit Committee (EVC)</option>
                <option value="ROUTE-EVC-ONLY">Only EVC (Physical Site Visit Only)</option>
                <option value="ROUTE-SCRUTINY-ONLY">Only Scrutiny (Document Evaluation Only - Fast Track)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Reviewer's Justification for Route Selection <span className="text-rose-500">*</span></label>
              <textarea 
                name="reason" 
                rows={2} 
                required 
                defaultValue="Institutional application requires on-site physical laboratory verification and subsequent Standing Hearing Committee evaluation as per Approval Process Handbook criteria." 
                placeholder="Explain why this application requires EVC physical inspection or SHC committee hearing..." 
                className="w-full p-2 border border-slate-300 rounded"
              ></textarea>
            </div>

            {/* Stage 1: EVC Task Extent Assessment */}
            {isEvcIncluded && (
              <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200 space-y-3">
                <div className="flex items-center justify-between border-b border-amber-200/80 pb-1.5">
                  <div className="font-bold text-amber-950 flex items-center space-x-1.5 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-mono text-[10px]">STAGE 1</span>
                    <span>Expert Visit Committee (EVC) Inspection Assessment</span>
                  </div>
                  <span className="text-[10px] text-amber-800 font-semibold">Immediate Execution</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">EVC Task Extent <span className="text-rose-500">*</span></label>
                    <select 
                      value={evcExtent}
                      onChange={(e) => setEvcExtent(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded bg-white font-medium"
                    >
                      <option value="SMALL">Small Extent (1 campus / routine check)</option>
                      <option value="MEDIUM">Medium Extent (2-3 labs / workshop facilities)</option>
                      <option value="LARGE">Large Extent (Multi-discipline / large campus)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Allocation Rule Notice</label>
                    <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-amber-200">
                      System automatically allocates this task to the eligible EVC officer with the fewest active tasks at this moment.
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">EVC Extent Justification Reason <span className="text-rose-500">*</span></label>
                  <textarea 
                    value={evcReason}
                    onChange={(e) => setEvcReason(e.target.value)}
                    rows={2}
                    required 
                    placeholder="Specific rationale for assessed EVC sizing (e.g., verifying 3 new robotics laboratories and workshop halls)..." 
                    className="w-full p-2 border border-slate-300 rounded bg-white"
                  ></textarea>
                </div>
              </div>
            )}

            {/* Stage 2: SHC/SAH Task Extent Assessment */}
            {isShcIncluded && (
              <div className="p-3.5 bg-cyan-50/80 rounded-xl border border-cyan-200 space-y-3">
                <div className="flex items-center justify-between border-b border-cyan-200/80 pb-1.5">
                  <div className="font-bold text-cyan-950 flex items-center space-x-1.5 text-xs">
                    <span className="px-1.5 py-0.5 rounded bg-cyan-200 text-cyan-900 font-mono text-[10px]">STAGE 2</span>
                    <span>Standing Hearing Committee (SHC/SAH) Assessment</span>
                  </div>
                  <span className="text-[10px] text-cyan-800 font-semibold">Pending EVC Acceptance</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">SHC/SAH Task Extent <span className="text-rose-500">*</span></label>
                    <select 
                      value={shcExtent}
                      onChange={(e) => setShcExtent(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded bg-white font-medium"
                    >
                      <option value="SMALL">Small Extent (Limited agenda hearing / routine)</option>
                      <option value="MEDIUM">Medium Extent (Multi-agenda compliance evaluation)</option>
                      <option value="LARGE">Large Extent (Complex multi-cadre representation)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Sequential Activation Rule</label>
                    <div className="text-[11px] text-slate-600 bg-white p-2 rounded border border-cyan-200">
                      SHC/SAH task extent is saved independently. It will activate and compute deadline using the assigned SHC officer's workload when EVC is accepted.
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">SHC/SAH Extent Justification Reason <span className="text-rose-500">*</span></label>
                  <textarea 
                    value={shcReason}
                    onChange={(e) => setShcReason(e.target.value)}
                    rows={2}
                    required 
                    placeholder="Specific rationale for assessed SHC hearing scope (e.g., faculty cadence variance representations)..." 
                    className="w-full p-2 border border-slate-300 rounded bg-white"
                  ></textarea>
                </div>
              </div>
            )}

            <div className="p-2.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-[11px] flex items-center justify-between">
              <div>
                <strong>Authorised Reviewer:</strong> {currentUser?.name} • Action persisted in immutable audit log.
              </div>
              <span className="text-[10px] font-mono text-slate-500">RBAC Verified</span>
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowRouteModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs">
                Confirm Route & Stage Sizing
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderTaskAssessModal() {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Officer Task-Size Assessment & Allocation</h3>
            <button onClick={() => setShowTaskAssessModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target;
            const res = await api.createTask(selectedApp.application.id, {
              taskType: form.task_type.value,
              taskExtent: form.task_extent.value,
              extentReason: form.reason.value,
              scopeIndicators: {
                locations: form.locations.value,
                anticipatedScope: form.anticipated_scope.value
              }
            });
            setShowTaskAssessModal(false);
            alert(`Task ${res.outcome?.taskNumber || ''} created and allocated using workload balance engine.`);
            handleSelectApp(selectedApp.application.id);
          }} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Task Type</label>
                <select name="task_type" className="w-full p-2 border border-slate-200 rounded">
                  <option value="EVC">EVC (Inspection Panel)</option>
                  <option value="SHC_SAH">SHC/SAH (Hearing Committee)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Assessed Extent</label>
                <select name="task_extent" className="w-full p-2 border border-slate-200 rounded">
                  <option value="SMALL">Small Extent</option>
                  <option value="MEDIUM">Medium Extent</option>
                  <option value="LARGE">Large Extent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Reason for Assessed Extent</label>
              <textarea name="reason" rows={2} required placeholder="e.g. Scope encompasses 3 campus laboratories across 2 departmental buildings..." className="w-full p-2 border border-slate-200 rounded"></textarea>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Number of Locations / Labs</label>
                <input name="locations" defaultValue="2" className="w-full p-2 border border-slate-200 rounded" />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Anticipated Scope</label>
                <input name="anticipated_scope" defaultValue="Physical Verification" className="w-full p-2 border border-slate-200 rounded" />
              </div>
            </div>

            <div className="p-2.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[11px]">
              <strong>Allocation Engine Rule:</strong> The system automatically assigns this task to the eligible officer with the lowest active task count. No performance scores or inferred expertise are used.
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowTaskAssessModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold">Confirm Sizing & Allocate</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderReportModal() {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Submit Task Inspection/Hearing Report</h3>
            <button onClick={() => setShowReportModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target;
            await api.submitTaskReport(selectedTask.task.id, {
              conducted_date: form.conducted_date.value,
              submission_date: form.submission_date.value,
              venue_mode: form.venue_mode.value,
              observations: form.observations.value,
              deficiencies_noted: form.deficiencies.value,
              recommendation: form.recommendation.value
            });
            setShowReportModal(false);
            alert('Report submitted successfully.');
            handleSelectTask(selectedTask.task.id);
            loadData();
          }} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Date Conducted</label>
                <input type="date" name="conducted_date" defaultValue="2026-10-27" required className="w-full p-2 border border-slate-200 rounded" />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Report Submission Date</label>
                <input type="date" name="submission_date" defaultValue={new Date().toISOString().split('T')[0]} required className="w-full p-2 border border-slate-200 rounded" />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Venue / Mode</label>
                <select name="venue_mode" className="w-full p-2 border border-slate-200 rounded">
                  <option value="Campus On-Site Physical">Campus On-Site Physical</option>
                  <option value="Virtual Committee Hearing">Virtual Committee Hearing</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Official Observations</label>
              <textarea name="observations" rows={3} required placeholder="Detailed observations of labs, safety, faculty cadre..." className="w-full p-2 border border-slate-200 rounded"></textarea>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Deficiencies Noted (if any)</label>
              <textarea name="deficiencies" rows={2} defaultValue="None observed." className="w-full p-2 border border-slate-200 rounded"></textarea>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Committee / Officer Recommendation</label>
              <select name="recommendation" className="w-full p-2 border border-slate-200 rounded font-bold">
                <option value="RECOMMENDED">RECOMMENDED</option>
                <option value="RECOMMENDED_WITH_CONDITIONS">RECOMMENDED WITH CONDITIONS</option>
                <option value="NOT_RECOMMENDED">NOT RECOMMENDED</option>
                <option value="SEEK_FURTHER_HEARING">SEEK FURTHER HEARING</option>
              </select>
            </div>

            <div className="text-[11px] text-slate-500 italic">
              Note: Completing inspection or submitting recommendations does not automatically approve the application.
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowReportModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-indigo-600 text-white font-semibold">Submit Report</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderFinalDecisionModal() {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Higher-Level Officer: Record Final Regulatory Decision</h3>
            <button onClick={() => setShowFinalDecisionModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target;
            await api.recordFinalDecision(selectedApp.application.id, {
              decision_outcome: form.decision_outcome.value,
              decision_explanation: form.explanation.value
            });
            setShowFinalDecisionModal(false);
            alert(`Explicit final decision '${form.decision_outcome.value}' recorded in database and audit trail.`);
            handleSelectApp(selectedApp.application.id);
          }} className="space-y-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Decision Outcome</label>
              <select name="decision_outcome" className="w-full p-2 border border-slate-200 rounded font-bold">
                <option value="APPROVED">APPROVED (Formal Approval Granted)</option>
                <option value="REJECTED">REJECTED (Regulatory Rejection)</option>
                <option value="RETURNED_FOR_FURTHER_INFO">RETURNED FOR FURTHER INFO</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Explicit Reason & Regulatory Explanation</label>
              <textarea name="explanation" rows={4} required placeholder="Detailed reason referencing compliance with AICTE Approval Process Handbook (APH)..." className="w-full p-2 border border-slate-200 rounded"></textarea>
            </div>

            <div className="p-2.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 text-[11px]">
              <strong>Authorised Signatory:</strong> {currentUser?.name} • Decisions are explicitly recorded in SQLite and notify the institution.
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowFinalDecisionModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-indigo-700 text-white font-semibold">Record Decision</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderReassignModal() {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Authorise Work Reassignment</h3>
            <button onClick={() => setShowReassignModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target;
            const res = await api.reassignTask(selectedTask.task.id, {
              newAssigneeId: form.new_assignee.value,
              reason: form.reason.value
            });
            if (res.error) alert(res.error);
            else {
              setShowReassignModal(false);
              alert('Task reassigned successfully!');
              handleSelectTask(selectedTask.task.id);
            }
          }} className="space-y-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Select Replacement Officer (Same Profile Required)</label>
              <select name="new_assignee" className="w-full p-2 border border-slate-200 rounded">
                {demoUsers
                  .filter(u => u.role === (selectedTask.task.task_type === 'EVC' ? 'EVC' : 'SHC_SAH') && u.id !== selectedTask.task.assignee_id)
                  .map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Reassignment Justification</label>
              <textarea name="reason" rows={3} required placeholder="Explain why workload is being reallocated (e.g. officer emergency, workload redistribution)..." className="w-full p-2 border border-slate-200 rounded"></textarea>
            </div>

            <div className="text-[11px] text-slate-500 italic">
              Note: Reassigning work does not automatically extend the original planning deadline.
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowReassignModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-slate-800 text-white font-semibold">Confirm Reassignment</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderExtendModal() {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Authorise Deadline Extension</h3>
            <button onClick={() => setShowExtendModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target;
            const res = await api.extendDeadline(selectedTask.task.id, {
              extendedDueAt: new Date(form.extended_date.value).toISOString(),
              reason: form.reason.value
            });
            setShowExtendModal(false);
            alert('Deadline extension authorised and persisted in audit trail.');
            handleSelectTask(selectedTask.task.id);
          }} className="space-y-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Current Target Deadline</label>
              <input disabled value={new Date(selectedTask.task.target_due_at).toLocaleDateString()} className="w-full p-2 bg-slate-100 border border-slate-200 rounded" />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">New Authorised Deadline</label>
              <input type="date" name="extended_date" required className="w-full p-2 border border-slate-200 rounded" />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Extension Justification Reason</label>
              <textarea name="reason" rows={3} required placeholder="Detailed reason for authorised regulatory deadline extension..." className="w-full p-2 border border-slate-200 rounded"></textarea>
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowExtendModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-amber-600 text-white font-semibold">Grant Extension</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderRequestExtensionModal() {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Request Deadline Extension from Higher Officer</h3>
            <button onClick={() => setShowRequestExtensionModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target;
            const res = await api.requestTaskDeadlineExtension(selectedTask.task.id, {
              requestedDeadline: new Date(form.requested_date.value).toISOString(),
              reason: form.reason.value
            });
            if (res.error) alert(res.error);
            else {
              setShowRequestExtensionModal(false);
              alert(res.message);
              handleSelectTask(selectedTask.task.id);
            }
          }} className="space-y-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Current Target Deadline</label>
              <input disabled value={new Date(selectedTask.task.target_due_at).toLocaleDateString()} className="w-full p-2 bg-slate-100 border border-slate-200 rounded" />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Requested Extended Due Date</label>
              <input type="date" name="requested_date" required className="w-full p-2 border border-slate-200 rounded" />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Reason for Extension Request</label>
              <textarea name="reason" rows={3} required placeholder="Explain why the inspection visit or hearing preparation requires additional days..." className="w-full p-2 border border-slate-200 rounded"></textarea>
            </div>

            <div className="text-[11px] text-slate-500 italic">
              Note: This request will be submitted to the Higher-Level Officer for review and formal approval.
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowRequestExtensionModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-amber-600 text-white font-semibold">Submit Request</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderSacAppealsList() {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <Scale className="w-5 h-5 text-rose-600" />
              <span>
                {currentUser?.role === 'INSTITUTION' ? 'My Statutory Appeals (SAH)' : (currentUser?.role === 'SAC' ? 'My Allotted SAH Appeals (Final Authority)' : 'Standing Appellate Hearing (SAH) Appeals Queue')}
              </span>
            </h1>
            <p className="text-xs text-slate-500">
              {currentUser?.role === 'INSTITUTION'
                ? 'Appeals submitted against final rejected regulatory decisions • SAH decisions are final and binding'
                : (currentUser?.role === 'SAC'
                  ? 'Statutory appeals allocated to your SAH panel. Acting as final authority (Supreme Court) — only Reject Appeal or Allow Resubmission'
                  : 'Appellate committee review records and final binding appeal outcomes')}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Appeal No</th>
                  <th className="px-5 py-3">Application Reference</th>
                  <th className="px-5 py-3">Institution</th>
                  <th className="px-5 py-3">Appeal Date</th>
                  <th className="px-5 py-3">SAH Assigned</th>
                  <th className="px-5 py-3">SAH Binding Verdict</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appeals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                      No statutory appeals recorded in this queue.
                    </td>
                  </tr>
                ) : (
                  appeals.map(app => (
                    <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-medium text-rose-600">
                        {app.appeal_no}
                      </td>
                      <td className="px-5 py-3.5 font-mono font-medium text-indigo-600">
                        {app.application_no}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{app.institution_name}</div>
                        <div className="text-[11px] text-slate-500">{app.program_type}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        {app.user_appeal_date || new Date(app.submitted_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-800">{app.assigned_sac_name || 'Unassigned'}</div>
                        <div className="text-[10px] text-slate-400">{app.assigned_sac_email || ''}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        {app.final_decision ? (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            app.final_decision === 'ALLOW_RESUBMISSION' || app.final_decision === 'APPEAL_ALLOWED' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                            'bg-rose-50 text-rose-800 border-rose-200'
                          }`}>
                            {app.final_decision === 'ALLOW_RESUBMISSION' ? 'RESUBMISSION GRANTED (UNDER REVIEW)' :
                             app.final_decision === 'REJECT_APPEAL' ? 'APPEAL REJECTED (CLOSED)' :
                             app.final_decision.replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            AWAITING SAH DECISION
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1 whitespace-nowrap">
                        {currentUser?.role === 'SAC' && !app.final_decision && (
                          <button 
                            onClick={() => { setSelectedAppeal(app); setShowSacDecisionModal(true); }}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded text-xs shadow-2xs"
                          >
                            Record SAH Final Decision
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            alert(`Appeal Reference: ${app.appeal_no}\nApplication: ${app.application_no}\nInstitution: ${app.institution_name}\n\nAppeal Grounds:\n${app.appeal_grounds}\n\nOriginal Rejection Reason:\n${app.original_decision_reason || 'N/A'}${app.final_decision ? `\n\nSAH Binding Verdict: ${app.final_decision}\nVerdict Reasoning:\n${app.final_decision_reason}` : '\n\nSAH Deliberation: Pending'}`);
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-xs"
                        >
                          View Grounds
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function renderOverdueAndEscalations() {
    const { evc = [], shc = [], sac = [], totalOverdue = 0 } = overdueTasksData;

    const handleSendReminder = async (taskId, workerName, taskNo) => {
      const msg = prompt(`Enter custom reminder message for ${workerName} (Task: ${taskNo}):`, `Urgent Reminder: Task ${taskNo} is overdue. Please submit your inspection/hearing report or submit a formal extension request immediately.`);
      if (msg === null) return;
      const res = await api.notifyOverdueTask(taskId, msg);
      alert(res.message || 'Individual reminder sent.');
      loadData();
    };

    const handleBroadcastEscalation = async () => {
      if (!confirm(`Issue formal broadcast escalation to all workers currently having overdue tasks (${totalOverdue} tasks pending)?`)) return;
      const customMsg = prompt('Enter broadcast escalation note (or leave blank for standard statutory notice):', '');
      if (customMsg === null) return;
      const res = await api.broadcastOverdueEscalation(customMsg || undefined);
      alert(res.message || 'Broadcast escalation issued.');
      loadData();
    };

    const renderOverdueTable = (tasksList, committeeTitle, committeeColor) => (
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        <div className={`px-5 py-3 border-b border-slate-100 flex items-center justify-between ${committeeColor}`}>
          <div className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-2">
            <span>{committeeTitle}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white text-slate-800 border border-slate-200">
              {tasksList.length} Overdue
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Task Ref</th>
                <th className="px-5 py-3">Responsible Worker</th>
                <th className="px-5 py-3">Application</th>
                <th className="px-5 py-3">Target Due Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasksList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                    No overdue tasks in this committee. All deadlines currently compliant.
                  </td>
                </tr>
              ) : (
                tasksList.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-medium text-indigo-600">
                      {t.task_number}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{t.assignee_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{t.assignee_email}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-800">{t.application_no}</div>
                      <div className="text-[11px] text-slate-500">{t.institution_name}</div>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-rose-600">
                      {new Date(t.target_due_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button 
                        onClick={() => handleSendReminder(t.id, t.assignee_name, t.task_number)}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold rounded text-xs border border-amber-200 transition-colors"
                      >
                        Send Individual Reminder
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Overdue Regulatory Tasks & Escalations</h1>
            <p className="text-xs text-slate-500">
              Discrete oversight across EVC, SHC, and SAC committees • Individual worker notifications & broadcast escalation triggers
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={handleBroadcastEscalation}
              className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1.5 cursor-pointer"
            >
              <AlertTriangle className="w-4 h-4 text-rose-200" />
              <span>Broadcast Escalation to All Overdue Workers</span>
            </button>
          </div>
        </div>

        {renderOverdueTable(evc, 'Expert Visit Committee (EVC) Overdue Inspections', 'bg-amber-50/40')}
        {renderOverdueTable(shc, 'Standing Hearing Committee (SHC/SAH) Overdue Tasks', 'bg-cyan-50/40')}
        {renderOverdueTable(sac, 'Standing Appellate Committee (SAC) Overdue Tasks', 'bg-rose-50/40')}
      </div>
    );
  }

  function renderEvcReportsReviewList() {
    const evcReports = pendingReports.filter(r => r.report_type === 'EVC_REPORT');

    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900">EVC Inspection Reports Awaiting Acceptance</h1>
            <p className="text-xs text-slate-500">
              Higher-Level Officer statutory review queue • Review inspection reports and accept or return for correction
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Task Number</th>
                  <th className="px-5 py-3">Application & Institute</th>
                  <th className="px-5 py-3">Submitted By</th>
                  <th className="px-5 py-3">Submission Date</th>
                  <th className="px-5 py-3">Recommendation</th>
                  <th className="px-5 py-3">Observations</th>
                  <th className="px-5 py-3 text-right">Regulatory Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {evcReports.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                      No EVC inspection reports currently awaiting Higher-Level Officer acceptance.
                    </td>
                  </tr>
                ) : (
                  evcReports.map(rep => (
                    <tr key={rep.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-medium text-indigo-600">
                        {rep.task_number}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{rep.application_no}</div>
                        <div className="text-[11px] text-slate-500">{rep.institution_name}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-800">{rep.submitted_by_name}</div>
                        <div className="text-[10px] text-slate-400">{rep.submitted_by_role}</div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {rep.user_submission_date || new Date(rep.submitted_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          rep.recommendation === 'RECOMMENDED' ? 'bg-emerald-100 text-emerald-800' :
                          rep.recommendation === 'NOT_RECOMMENDED' ? 'bg-rose-100 text-rose-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {rep.recommendation}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 max-w-xs truncate text-[11px] text-slate-700">
                        {rep.observations}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1 whitespace-nowrap">
                        <button 
                          onClick={async () => {
                            if (!confirm(`Accept EVC report for ${rep.task_number}? If route includes SHC/SAH, it will automatically allocate the sequential SHC task.`)) return;
                            const res = await api.reviewReport(rep.id, {
                              review_status: 'ACCEPTED',
                              review_feedback: 'EVC inspection report verified and formally accepted by Higher-Level Officer.'
                            });
                            alert('EVC Report Accepted! Stage marked complete.');
                            loadData();
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded text-xs"
                        >
                          Accept Report
                        </button>
                        <button 
                          onClick={async () => {
                            const fb = prompt('Enter return feedback / correction requirements for EVC officer:');
                            if (!fb) return;
                            await api.reviewReport(rep.id, {
                              review_status: 'CORRECTION_REQUIRED',
                              review_feedback: fb
                            });
                            alert('Report returned to EVC officer for correction.');
                            loadData();
                          }}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded text-xs"
                        >
                          Return for Correction
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function renderSubmitAppModal() {
    if (!selectedApp) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Submit Application to AICTE</h3>
            <button onClick={() => setShowSubmitAppModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const res = await api.submitApplication(selectedApp.application.id, appSubmissionDate);
            if (res.error) {
              alert(res.error);
            } else {
              setShowSubmitAppModal(false);
              alert('Application submitted successfully!');
              handleSelectApp(selectedApp.application.id);
              loadData();
            }
          }} className="space-y-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Application Reference</label>
              <div className="p-2 bg-slate-100 rounded font-mono text-indigo-700 font-bold">{selectedApp.application.application_no}</div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Application Submission Date <span className="text-rose-500">*</span></label>
              <input 
                type="date" 
                value={appSubmissionDate}
                onChange={(e) => setAppSubmissionDate(e.target.value)}
                required 
                className="w-full p-2 border border-slate-200 rounded font-medium" 
              />
              <p className="text-[11px] text-slate-500 mt-1">This user-entered submission date will be captured and displayed across all regulatory dashboards.</p>
            </div>

            <div className="p-2.5 rounded bg-blue-50 border border-blue-200 text-blue-900 text-[11px]">
              <strong>Automated Pre-Check:</strong> Mandatory document verification (Land Title, Fire Safety, Faculty List) will run upon submission.
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowSubmitAppModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs">
                Confirm & Submit Application
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderSacAppealModal() {
    if (!selectedApp) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <h3 className="font-bold text-slate-900 text-sm">Submit Statutory Appeal to SAC</h3>
            </div>
            <button onClick={() => setShowSacAppealModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            if (!sacAppealGrounds.trim()) {
              alert('Appeal grounds are mandatory.');
              return;
            }
            const res = await api.submitSacAppeal(selectedApp.application.id, {
              appeal_grounds: sacAppealGrounds,
              user_appeal_date: sacAppealDate,
              supporting_documents: selectedAppealDocIds
            });
            if (res.error) {
              alert(res.error);
            } else {
              setShowSacAppealModal(false);
              alert(`SAC Appeal ${res.appealNo} submitted! Allocated to ${res.allocatedTask?.assignee?.name || 'SAC Panel'}. Original rejection and audit trail preserved.`);
              handleSelectApp(selectedApp.application.id);
              loadData();
            }
          }} className="space-y-3">
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-900 text-[11px]">
              <strong>Original Decision: REJECTED</strong>
              <p className="mt-0.5 text-rose-800">{selectedApp.application.final_decision_reason || 'Final regulatory decision'}</p>
              <p className="mt-1 text-[10px] text-slate-500 italic">Note: Submitting an appeal does not automatically reverse the rejection or approve the application.</p>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Appeal Submission Date <span className="text-rose-500">*</span></label>
              <input 
                type="date" 
                value={sacAppealDate}
                onChange={(e) => setSacAppealDate(e.target.value)}
                required 
                className="w-full p-2 border border-slate-200 rounded font-medium" 
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Grounds of Appeal & Regulatory Justification <span className="text-rose-500">*</span></label>
              <textarea 
                value={sacAppealGrounds}
                onChange={(e) => setSacAppealGrounds(e.target.value)}
                rows={4} 
                required 
                placeholder="State clear legal and technical grounds under AICTE Approval Process Handbook (e.g. rectifications completed, procedural variances, evidence submitted)..."
                className="w-full p-2 border border-slate-200 rounded"
              ></textarea>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Attach Supporting Documents</label>
              <p className="text-[10px] text-slate-500 mb-1">All uploaded application documents will be accessible by the SAC panel.</p>
              <div className="max-h-28 overflow-y-auto border border-slate-200 rounded p-2 space-y-1">
                {selectedApp.documents?.map(doc => (
                  <label key={doc.id} className="flex items-center space-x-2 text-[11px] text-slate-700">
                    <input 
                      type="checkbox" 
                      checked={selectedAppealDocIds.includes(doc.id)} 
                      onChange={(e) => {
                        if (e.target.checked) setSelectedAppealDocIds([...selectedAppealDocIds, doc.id]);
                        else setSelectedAppealDocIds(selectedAppealDocIds.filter(id => id !== doc.id));
                      }}
                      className="rounded border-slate-300"
                    />
                    <span>[{doc.document_category}] {doc.document_name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowSacAppealModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-xs">
                Lodge SAC Appeal
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderSacRecommendModal() {
    if (!selectedAppeal) return null;
    return renderSacDecisionModal();
  }

  function renderSacDecisionModal() {
    if (!selectedAppeal) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                <Scale className="w-4 h-4 text-rose-600" />
                <span>Standing Appellate Hearing (SAH): Final Authority Decision</span>
              </h3>
              <p className="text-[10px] text-slate-500">Treating SAH as the final authority (Supreme Court) • Decisions are final and binding</p>
            </div>
            <button onClick={() => setShowSacDecisionModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target;
            const res = await api.recordSacAppealDecision(selectedAppeal.id, {
              final_decision: form.decision.value,
              final_decision_reason: form.reason.value,
              user_decision_date: form.decision_date.value
            });
            if (res.error) alert(res.error);
            else {
              setShowSacDecisionModal(false);
              alert(res.message || 'SAH final decision recorded successfully and institution notified directly.');
              loadData();
            }
          }} className="space-y-3">
            <div className="p-2.5 rounded bg-slate-50 border border-slate-200 space-y-1">
              <div className="font-bold text-slate-800">Appeal: {selectedAppeal.appeal_no} ({selectedAppeal.application_no})</div>
              <div className="text-[11px] text-slate-700"><strong>Institution:</strong> {selectedAppeal.institution_name}</div>
              <div className="text-[11px] text-slate-600"><strong>Appeal Grounds:</strong> {selectedAppeal.appeal_grounds}</div>
              <div className="text-[11px] text-rose-600"><strong>Original Rejection Reason:</strong> {selectedAppeal.original_decision_reason || 'Deficiencies noted'}</div>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Deliberation / Decision Date <span className="text-rose-500">*</span></label>
              <input type="date" name="decision_date" defaultValue={new Date().toISOString().split('T')[0]} required className="w-full p-2 border border-slate-200 rounded font-medium" />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">SAH Final Binding Decision Option <span className="text-rose-500">*</span></label>
              <select name="decision" className="w-full p-2 border border-slate-200 rounded font-bold text-xs">
                <option value="REJECT_APPEAL">1. Reject the appeal (Application remains Rejected; Appeal Closed)</option>
                <option value="ALLOW_RESUBMISSION">2. Allow the institution one more opportunity to resubmit its documents (Reverts to Under Review; Sent to Reviewing Officer)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Deliberation Justification Reason <span className="text-rose-500">*</span></label>
              <textarea name="reason" rows={3} required placeholder="State comprehensive reasoning for the decision (deficiencies confirmed vs. procedural opportunity granted to resubmit)..." className="w-full p-2 border border-slate-200 rounded"></textarea>
            </div>

            <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded text-[10px] text-blue-900 space-y-1">
              <div><strong>⚖️ Final Authority Workflow Rules:</strong></div>
              <div>• SAH is the final authority in this workflow; not sent back to Higher-Level Officer for another decision.</div>
              <div>• If Resubmission is allowed: Application status changes from <em>Rejected</em> to <em>Under Review</em> and is immediately remanded to the Reviewing Officer.</div>
              <div>• <code>reappeal_count</code> increments to 1/1, strictly capping any further reappeal.</div>
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowSacDecisionModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-xs">
                Record Binding SAH Decision
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderUploadDocModal() {
    if (!selectedApp) return null;
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-bold text-slate-900 text-sm">Upload Supporting Document</h3>
            <button onClick={() => setShowUploadDocModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault();
            const fileName = docUploadName.trim() || `${selectedDocCategory.toLowerCase()}_verified.pdf`;
            await api.uploadDocument(selectedApp.application.id, {
              document_category: selectedDocCategory,
              document_name: fileName,
              file_path: `/uploads/${fileName}`,
              file_size: 204800,
              mime_type: 'application/pdf'
            });
            setShowUploadDocModal(false);
            setDocUploadName('');
            alert(`Document uploaded under ${selectedDocCategory}!`);
            handleSelectApp(selectedApp.application.id);
          }} className="space-y-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Document Category <span className="text-rose-500">*</span></label>
              <select 
                value={selectedDocCategory}
                onChange={(e) => setSelectedDocCategory(e.target.value)}
                className="w-full p-2 border border-slate-200 rounded font-medium"
              >
                <option value="APPROVED_BUILDING_PLAN">Approved Building Plan (Municipal / Town Planning)</option>
                <option value="AFFIDAVIT_2">Affidavit 2 (Regulatory Compliance Undertaking)</option>
                <option value="LAND_DOCUMENTS">Land Ownership / Registered Lease Documents</option>
                <option value="DETAILED_PROJECT_REPORT">Detailed Project Report (DPR)</option>
                <option value="LAND_TITLE">Land Title Certificate</option>
                <option value="FIRE_SAFETY">Fire Safety NOC</option>
                <option value="FACULTY_LIST">Faculty Cadre List</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Document File Name</label>
              <input 
                type="text"
                value={docUploadName}
                onChange={(e) => setDocUploadName(e.target.value)}
                placeholder="e.g. approved_building_plan_signed.pdf"
                className="w-full p-2 border border-slate-200 rounded"
              />
            </div>

            <div className="pt-2 flex justify-end space-x-2">
              <button type="button" onClick={() => setShowUploadDocModal(false)} className="px-3 py-1.5 rounded border border-slate-200 text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs">
                Upload Document
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }
}
