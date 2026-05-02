/**
 * volvix-asana-wiring.js
 * Asana integration: tasks, projects, teams, workflows.
 * Exposes window.AsanaAPI
 */
(function (global) {
  'use strict';

  const ASANA_BASE = 'https://app.asana.com/api/1.0';
  const STORAGE_KEY = 'volvix.asana.token';
  const CACHE_KEY = 'volvix.asana.cache';
  const CACHE_TTL_MS = 60 * 1000;

  const state = {
    token: null,
    workspaceGid: null,
    userGid: null,
    cache: new Map(),
    listeners: new Set()
  };

  // ---------- token / config ----------
  function setToken(token, workspaceGid) {
    state.token = token || null;
    if (workspaceGid) state.workspaceGid = workspaceGid;
    try {
      if (token) localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, workspaceGid: workspaceGid || state.workspaceGid }));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    emit('auth', { authenticated: !!token });
  }

  function loadToken() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const obj = JSON.parse(raw);
      state.token = obj.token || null;
      state.workspaceGid = obj.workspaceGid || null;
      return !!state.token;
    } catch (_) { return false; }
  }

  function isAuthenticated() { return !!state.token; }

  // ---------- events ----------
  function on(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }
  function emit(type, payload) { state.listeners.forEach(fn => { try { fn({ type, payload }); } catch (_) {} }); }

  // ---------- low-level fetch ----------
  async function request(path, opts = {}) {
    if (!state.token) throw new Error('Asana: no token. Call AsanaAPI.setToken(token) first.');
    const url = path.startsWith('http') ? path : ASANA_BASE + path;
    const method = opts.method || 'GET';
    const cacheKey = method + ' ' + url + (opts.body ? ':' + JSON.stringify(opts.body) : '');
    if (method === 'GET' && !opts.fresh) {
      const hit = state.cache.get(cacheKey);
      if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.v;
    }
    const headers = {
      'Authorization': 'Bearer ' + state.token,
      'Accept': 'application/json'
    };
    if (opts.body) headers['Content-Type'] = 'application/json';
    let resp;
    try {
      resp = await fetch(url, {
        method,
        headers,
        body: opts.body ? JSON.stringify({ data: opts.body }) : undefined
      });
    } catch (e) {
      emit('error', { path, error: e.message });
      throw e;
    }
    if (resp.status === 401) { setToken(null); throw new Error('Asana: 401 unauthorized'); }
    if (resp.status === 429) {
      const retry = parseInt(resp.headers.get('Retry-After') || '5', 10);
      await new Promise(r => setTimeout(r, retry * 1000));
      return request(path, opts);
    }
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error('Asana ' + resp.status + ': ' + txt);
    }
    const json = await resp.json();
    const value = json.data;
    if (method === 'GET') state.cache.set(cacheKey, { t: Date.now(), v: value });
    return value;
  }

  function clearCache() { state.cache.clear(); }

  // ---------- user / workspaces ----------
  async function me() {
    const u = await request('/users/me');
    state.userGid = u.gid;
    if (!state.workspaceGid && u.workspaces && u.workspaces[0]) state.workspaceGid = u.workspaces[0].gid;
    return u;
  }
  async function workspaces() { return request('/workspaces'); }
  function workspace() { return state.workspaceGid; }
  function setWorkspace(gid) { state.workspaceGid = gid; clearCache(); }

  // ---------- teams ----------
  async function teams(workspaceGid) {
    const ws = workspaceGid || state.workspaceGid;
    if (!ws) throw new Error('Asana: workspaceGid required');
    return request('/organizations/' + ws + '/teams');
  }
  async function team(gid) { return request('/teams/' + gid); }
  async function teamProjects(teamGid) { return request('/teams/' + teamGid + '/projects'); }

  // ---------- projects ----------
  async function projects(opts = {}) {
    const ws = opts.workspace || state.workspaceGid;
    const params = new URLSearchParams({ workspace: ws, archived: opts.archived ? 'true' : 'false' });
    if (opts.team) params.set('team', opts.team);
    return request('/projects?' + params);
  }
  async function project(gid) { return request('/projects/' + gid); }
  async function createProject(data) {
    return request('/projects', {
      method: 'POST',
      body: Object.assign({ workspace: state.workspaceGid }, data)
    });
  }
  async function updateProject(gid, data) {
    return request('/projects/' + gid, { method: 'PUT', body: data });
  }
  async function deleteProject(gid) {
    return request('/projects/' + gid, { method: 'DELETE' });
  }
  async function projectSections(projectGid) {
    return request('/projects/' + projectGid + '/sections');
  }

  // ---------- tasks ----------
  async function tasks(opts = {}) {
    const params = new URLSearchParams();
    if (opts.project) params.set('project', opts.project);
    else if (opts.assignee) {
      params.set('assignee', opts.assignee);
      params.set('workspace', opts.workspace || state.workspaceGid);
    } else if (opts.section) params.set('section', opts.section);
    else throw new Error('Asana.tasks: need project, assignee, or section');
    if (opts.completed_since) params.set('completed_since', opts.completed_since);
    if (opts.opt_fields) params.set('opt_fields', opts.opt_fields);
    return request('/tasks?' + params);
  }
  async function task(gid) {
    return request('/tasks/' + gid + '?opt_fields=name,notes,completed,due_on,due_at,assignee,assignee.name,projects,tags,custom_fields,parent,subtasks');
  }
  async function createTask(data) {
    const body = Object.assign({ workspace: state.workspaceGid }, data);
    return request('/tasks', { method: 'POST', body });
  }
  async function updateTask(gid, data) {
    return request('/tasks/' + gid, { method: 'PUT', body: data });
  }
  async function deleteTask(gid) {
    return request('/tasks/' + gid, { method: 'DELETE' });
  }
  async function completeTask(gid) { return updateTask(gid, { completed: true }); }
  async function reopenTask(gid) { return updateTask(gid, { completed: false }); }
  async function assignTask(gid, userGid) { return updateTask(gid, { assignee: userGid }); }
  async function addSubtask(parentGid, data) {
    return request('/tasks/' + parentGid + '/subtasks', { method: 'POST', body: data });
  }
  async function subtasks(gid) { return request('/tasks/' + gid + '/subtasks'); }
  async function addToProject(taskGid, projectGid, sectionGid) {
    const body = { project: projectGid };
    if (sectionGid) body.section = sectionGid;
    return request('/tasks/' + taskGid + '/addProject', { method: 'POST', body });
  }
  async function removeFromProject(taskGid, projectGid) {
    return request('/tasks/' + taskGid + '/removeProject', { method: 'POST', body: { project: projectGid } });
  }
  async function addTag(taskGid, tagGid) {
    return request('/tasks/' + taskGid + '/addTag', { method: 'POST', body: { tag: tagGid } });
  }
  async function searchTasks(query, opts = {}) {
    const ws = opts.workspace || state.workspaceGid;
    const params = new URLSearchParams({ 'text': query });
    if (opts.assignee) params.set('assignee.any', opts.assignee);
    if (opts.completed != null) params.set('completed', String(opts.completed));
    return request('/workspaces/' + ws + '/tasks/search?' + params);
  }

  // ---------- stories / comments ----------
  async function taskStories(gid) { return request('/tasks/' + gid + '/stories'); }
  async function commentTask(gid, text) {
    return request('/tasks/' + gid + '/stories', { method: 'POST', body: { text } });
  }

  // ---------- sections ----------
  async function createSection(projectGid, name) {
    return request('/projects/' + projectGid + '/sections', { method: 'POST', body: { name } });
  }
  async function moveTaskToSection(sectionGid, taskGid) {
    return request('/sections/' + sectionGid + '/addTask', { method: 'POST', body: { task: taskGid } });
  }

  // ---------- tags ----------
  async function tags(workspaceGid) {
    const ws = workspaceGid || state.workspaceGid;
    return request('/workspaces/' + ws + '/tags');
  }
  async function createTag(name, color) {
    return request('/tags', { method: 'POST', body: { workspace: state.workspaceGid, name, color } });
  }

  // ---------- workflows / custom fields ----------
  async function customFields(workspaceGid) {
    const ws = workspaceGid || state.workspaceGid;
    return request('/workspaces/' + ws + '/custom_fields');
  }
  async function projectCustomFields(projectGid) {
    return request('/projects/' + projectGid + '/custom_field_settings');
  }
  async function setCustomField(taskGid, fieldGid, value) {
    const custom = {}; custom[fieldGid] = value;
    return updateTask(taskGid, { custom_fields: custom });
  }

  // ---------- workflows (rules / status updates) ----------
  async function projectStatuses(projectGid) {
    return request('/projects/' + projectGid + '/project_statuses');
  }
  async function postProjectStatus(projectGid, data) {
    return request('/projects/' + projectGid + '/project_statuses', { method: 'POST', body: data });
  }
  async function runWorkflow(workflowName, ctx) {
    // Built-in workflow shortcuts
    switch (workflowName) {
      case 'triage':
        return createTask(Object.assign({ name: ctx.title, notes: ctx.notes, projects: [ctx.project] }, ctx.extra || {}));
      case 'close-and-comment':
        await commentTask(ctx.task, ctx.comment || 'Closed via Volvix');
        return completeTask(ctx.task);
      case 'move-to-done': {
        const secs = await projectSections(ctx.project);
        const done = secs.find(s => /done|complete|cerrad/i.test(s.name));
        if (!done) throw new Error('No Done section found');
        return moveTaskToSection(done.gid, ctx.task);
      }
      default: throw new Error('Unknown workflow: ' + workflowName);
    }
  }

  // ---------- batch ----------
  async function batch(actions) {
    return request('/batch', { method: 'POST', body: { actions } });
  }

  // ---------- init ----------
  function init(opts = {}) {
    if (opts.token) setToken(opts.token, opts.workspaceGid);
    else loadToken();
    if (state.token) { me().catch(() => {}); }
    return { authenticated: isAuthenticated(), workspace: state.workspaceGid };
  }

  // ---------- export ----------
  global.AsanaAPI = {
    init, setToken, loadToken, isAuthenticated, on,
    me, workspaces, workspace, setWorkspace,
    teams, team, teamProjects,
    projects, project, createProject, updateProject, deleteProject, projectSections,
    tasks, task, createTask, updateTask, deleteTask,
    completeTask, reopenTask, assignTask,
    addSubtask, subtasks, addToProject, removeFromProject, addTag, searchTasks,
    taskStories, commentTask,
    createSection, moveTaskToSection,
    tags, createTag,
    customFields, projectCustomFields, setCustomField,
    projectStatuses, postProjectStatus, runWorkflow,
    batch, clearCache,
    _state: state
  };

  if (typeof document !== 'undefined' && document.readyState !== 'loading') init();
  else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => init());
})(typeof window !== 'undefined' ? window : globalThis);
