// v0: Secure API-backed version (no browser-to-DB).
const STORAGE_TOKEN_KEY = "fitHubAdminToken";
const STORAGE_ACTOR_KEY = "fitHubActor";

const state = {
  adminToken: localStorage.getItem(STORAGE_TOKEN_KEY) || "",
  actor: localStorage.getItem(STORAGE_ACTOR_KEY) || "Braxton",
  teams: [],
  teamId: null,
  isoWeek: null,
  weeks: [],
  weekUpdatedAt: null,
  members: [],
  weekTasks: [],
  taskAttendance: {},
  cache: new Map(), // key: `${teamId}:${isoWeek}`
  lastTraceId: "—",
  lastSavedAt: null,
  lastError: null,
  saving: false,
};


const getToastContainer = () => document.getElementById("toast-container");

const showToast = (title, message, { type = "error", meta = "" , timeoutMs = 12000 } = {}) => {
  const container = getToastContainer();
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const body = document.createElement("div");
  body.className = "toast-body";

  const h = document.createElement("div");
  h.className = "toast-title";
  h.textContent = title || (type === "success" ? "Success" : "Error");

  const p = document.createElement("p");
  p.className = "toast-msg";
  p.textContent = message || "";

  body.appendChild(h);
  body.appendChild(p);

  if (meta) {
    const m = document.createElement("div");
    m.className = "toast-meta";
    m.textContent = meta;
    body.appendChild(m);
  }

  const close = document.createElement("button");
  close.className = "toast-close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  close.addEventListener("click", () => toast.remove());

  toast.appendChild(body);
  toast.appendChild(close);

  container.prepend(toast);

  window.setTimeout(() => {
    if (toast.isConnected) toast.remove();
  }, timeoutMs);
};

window.addEventListener("error", (e) => {
  const msg = e?.message || "Unexpected error";
  showToast("App crashed", msg, { type: "error" });
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = e?.reason?.message || String(e?.reason || "Unhandled promise rejection");
  showToast("Unhandled error", msg, { type: "error" });
});


const elements = {
  teamSelect: document.getElementById("team-select"),
  isoWeek: document.getElementById("iso-week"),
  saveWeek: document.getElementById("save-week"),
  saveRoster: document.getElementById("save-roster"),
  toggleRoster: document.getElementById("toggle-roster"),
  rosterFilter: document.getElementById("roster-filter"),
  rosterList: document.getElementById("roster-list"),
  newMemberName: document.getElementById("new-member-name"),
  newMemberEmail: document.getElementById("new-member-email"),
  newMemberPhone: document.getElementById("new-member-phone"),
  newMemberTeam: document.getElementById("new-member-team"),
  addMember: document.getElementById("add-member"),
  teamRosterTitle: document.getElementById("team-roster-title"),
  teamRosterDisplay: document.getElementById("team-roster-display"),
  weekStatus: document.getElementById("week-status"),
  memberFilter: document.getElementById("member-filter"),
  weeklyTasks: document.getElementById("weekly-tasks"),
  toggleMembers: document.getElementById("toggle-members"),
  membersPanel: document.getElementById("members-panel"),
  weeksList: document.getElementById("weeks-list"),
  exportTeam: document.getElementById("export-team"),
  exportAll: document.getElementById("export-all"),
  chatInsights: document.getElementById("chat-insights"),
  exportStatus: document.getElementById("export-status"),
  actorSelect: document.getElementById("actor-select"),
  clearToken: document.getElementById("clear-token"),
  toast: document.getElementById("toast"),
  diagHealth: document.getElementById("diag-health"),
  diagContext: document.getElementById("diag-context"),
  diagSaved: document.getElementById("diag-saved"),
  diagTrace: document.getElementById("diag-trace"),
  diagError: document.getElementById("diag-error"),
};

const uuidv4 = () => {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const setToast = (message, ms = 2400) => {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(setToast._t);
  setToast._t = window.setTimeout(() => elements.toast.classList.remove("show"), ms);
};

const setWeekStatus = (message) => {
  if (elements.weekStatus) elements.weekStatus.textContent = message || "";
};

const setExportStatus = (message) => {
  if (elements.exportStatus) elements.exportStatus.textContent = message || "";
};

const setDiagnostics = () => {
  if (elements.diagContext) elements.diagContext.textContent = `${state.teamId || "—"} / ${state.isoWeek || "—"}`;
  if (elements.diagTrace) elements.diagTrace.textContent = state.lastTraceId || "—";
  if (elements.diagSaved) elements.diagSaved.textContent = state.lastSavedAt ? new Date(state.lastSavedAt).toLocaleString() : "—";
  if (elements.diagError) elements.diagError.textContent = state.lastError ? JSON.stringify(state.lastError, null, 2) : "—";
};

const apiFetch = async (path, { method = "GET", body, headers = {} } = {}) => {
  const traceId = uuidv4();
  state.lastTraceId = traceId;
  setDiagnostics();

  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": state.adminToken,
      "x-actor": state.actor,
      "x-trace-id": traceId,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { ok: false, error: text || "Invalid JSON response" };
  }

  if (res.status === 401) {
    // Session invalid
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    state.adminToken = "";
    try { sessionStorage.setItem("fitHubFlash", "Session expired or invalid token. Please re-enter."); } catch {}
    // Redirect immediately to access screen
    window.location.href = "/index.html";
  }

  if (!res.ok || payload?.ok === false) {
    state.lastError = { status: res.status, path, payload };
    setDiagnostics();
    const msg = (payload && (payload.error || payload.message)) ? (payload.error || payload.message) : `Request failed (${res.status})`;
    const meta = `Path: ${path} • Trace: ${traceId}`;
    showToast(res.status === 401 ? "Unauthorized" : "Request failed", msg, { type: "error", meta });
  }

  return { status: res.status, ok: res.ok, payload };
};

// ISO week formatting: "YYYY-Www"
const getISOWeekKey = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Thursday determines the year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const ww = String(weekNo).padStart(2, "0");
  return `${d.getUTCFullYear()}-W${ww}`;
};

const requireAuthOrRedirect = async () => {
  if (!state.adminToken) {
    window.location.href = "/index.html";
    return false;
  }
  const { status } = await apiFetch("/api/health");
  if (status === 401) {
    window.location.href = "/index.html";
    return false;
  }
  return true;
};

const refreshHealth = async () => {
  const { status, payload } = await apiFetch("/api/health");
  if (elements.diagHealth) {
    elements.diagHealth.textContent = status === 200 && payload?.ok ? "OK" : `ERR ${status}`;
  }
  setDiagnostics();
};

const loadTeams = async () => {
  const { status, payload } = await apiFetch("/api/teams-list");
  if (status !== 200 || !payload?.ok) {
    setToast("Failed to load teams");
    return;
  }

  state.teams = payload.teams || [];
  elements.teamSelect.innerHTML = "";
  elements.newMemberTeam.innerHTML = "";
  state.teams.forEach((team) => {
    const option = document.createElement("option");
    option.value = team.id;
    option.textContent = team.id === "all" ? "All Teams" : team.name;
    elements.teamSelect.appendChild(option);

    // Roster add-member dropdown should not allow "all"
    if (team.id !== "all") {
      const opt2 = document.createElement("option");
      opt2.value = team.id;
      opt2.textContent = team.name;
      elements.newMemberTeam.appendChild(opt2);
    }
  });

  // Default team selection
  state.teamId = state.teamId || (state.teams.find((t) => t.id !== "all")?.id || state.teams[0]?.id || null);
  if (state.teamId) elements.teamSelect.value = state.teamId;
};

const loadWeeks = async () => {
  if (!state.teamId || state.teamId === "all") {
    state.weeks = [];
    elements.weeksList.innerHTML = `<div class="muted">Select a specific team to view week history.</div>`;
    return;
  }
  const { status, payload } = await apiFetch(`/api/weeks-list?teamId=${encodeURIComponent(state.teamId)}`);
  if (status !== 200 || !payload?.ok) {
    setToast("Failed to load weeks");
    return;
  }
  state.weeks = payload.weeks || [];
  renderWeeksList();
};

const renderWeeksList = () => {
  elements.weeksList.innerHTML = "";
  const current = getISOWeekKey(new Date());
  const list = [current, ...state.weeks.filter((w) => w !== current)].slice(0, 24);

  list.forEach((week) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = week === state.isoWeek ? "primary" : "secondary";
    btn.textContent = week === current ? `${week} (current)` : week;
    btn.addEventListener("click", async () => {
      await setWeek(week);
    });
    elements.weeksList.appendChild(btn);
  });
};

const setWeek = async (isoWeek) => {
  state.isoWeek = isoWeek;
  elements.isoWeek.textContent = isoWeek;
  setDiagnostics();
  await loadWeekData(true);
  renderWeeksList();
};

const loadWeekData = async (useNetwork = false) => {
  if (!state.teamId || !state.isoWeek) return;

  const cacheKey = `${state.teamId}:${state.isoWeek}`;
  if (!useNetwork && state.cache.has(cacheKey)) {
    const cached = state.cache.get(cacheKey);
    Object.assign(state, cached);
    renderAll();
    return;
  }

  setWeekStatus("Loading...");
  const { status, payload } = await apiFetch(
    `/api/week-get?teamId=${encodeURIComponent(state.teamId)}&isoWeek=${encodeURIComponent(state.isoWeek)}`
  );

  if (status !== 200 || !payload?.ok) {
    setWeekStatus("Failed to load week");
    setToast("Failed to load week");
    return;
  }

  state.weekUpdatedAt = payload.weekUpdatedAt || null;
  state.members = payload.members || [];
  state.weekTasks = payload.weekTasks || [];
  state.taskAttendance = payload.taskAttendance || {};
  state.cache.set(cacheKey, {
    weekUpdatedAt: state.weekUpdatedAt,
    members: state.members,
    weekTasks: state.weekTasks,
    taskAttendance: state.taskAttendance,
  });

  setWeekStatus("");
  renderAll();
};

const renderAll = () => {
  renderRosterDisplay();
  renderWeeklyTasks();
  renderMembersPanel();
  setDiagnostics();
};

const renderRosterDisplay = () => {
  const activeCount = (state.members || []).filter((m) => m.active).length;
  elements.teamRosterTitle.textContent = state.teamId === "all" ? "All Teams" : (state.teams.find((t) => t.id === state.teamId)?.name || "Roster");
  elements.teamRosterDisplay.textContent = `${activeCount} active / ${(state.members || []).length} total`;
};

let rosterPanelOpen = true;
const setRosterPanelOpen = (open) => {
  rosterPanelOpen = open;
  elements.rosterList.style.display = open ? "block" : "none";
  elements.saveRoster.style.display = open ? "inline-flex" : "none";
  elements.toggleRoster.textContent = open ? "Hide roster editor" : "Edit roster";
};

const renderRosterList = async () => {
  elements.rosterList.innerHTML = "";

  if (state.teamId === "all") {
    elements.rosterList.innerHTML = `<div class="muted">Roster editing is disabled in All Teams view. Select a specific team.</div>`;
    elements.saveRoster.disabled = true;
    elements.addMember.disabled = true;
    elements.newMemberName.disabled = true;
    elements.newMemberEmail.disabled = true;
    elements.newMemberPhone.disabled = true;
    elements.newMemberTeam.disabled = true;
    return;
  }

  elements.saveRoster.disabled = false;
  elements.addMember.disabled = false;
  elements.newMemberName.disabled = false;
  elements.newMemberEmail.disabled = false;
  elements.newMemberPhone.disabled = false;
  elements.newMemberTeam.disabled = false;

  const filter = (elements.rosterFilter.value || "").trim().toLowerCase();
  const filtered = (state.members || []).filter((m) => !filter || (m.name || "").toLowerCase().includes(filter));

  filtered.forEach((m) => {
    const card = document.createElement("div");
    card.className = "member-card";
    card.dataset.memberId = m.id;

    card.innerHTML = `
      <div class="member-row">
        <input class="text" data-field="name" value="${escapeHtml(m.name || "")}" />
        <label class="toggle">
          <input type="checkbox" data-field="active" ${m.active ? "checked" : ""} />
          <span>Active</span>
        </label>
      </div>
      <div class="member-row">
        <input class="text" data-field="email" placeholder="email" value="${escapeHtml(m.email || "")}" />
        <input class="text" data-field="phone" placeholder="phone" value="${escapeHtml(m.phone || "")}" />
      </div>
      <div class="muted mono">ID: ${m.id}</div>
    `;

    // attach inputs
    card.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.dataset.field;
        if (field === "active") {
          m.active = input.checked;
        } else {
          m[field] = input.value;
        }
      });
      input.addEventListener("change", () => {
        const field = input.dataset.field;
        if (field === "active") m.active = input.checked;
      });
    });

    elements.rosterList.appendChild(card);
  });
};

const escapeHtml = (str) =>
  String(str).replace(/[&<>"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));

const renderWeeklyTasks = () => {
  elements.weeklyTasks.innerHTML = "";

  const header = document.createElement("div");
  header.className = "row";
  header.innerHTML = `
    <div class="muted">Weekly Tasks</div>
    <button id="add-week-task" class="secondary" type="button">Add task</button>
  `;
  elements.weeklyTasks.appendChild(header);

  const tasks = state.weekTasks || [];
  if (tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No tasks yet.";
    elements.weeklyTasks.appendChild(empty);
  }

  tasks.forEach((task) => {
    const card = document.createElement("div");
    card.className = "task-card";

    const attendance = state.taskAttendance?.[task.id] || {};
    const activeMembers = (state.members || []).filter((m) => m.active);
    const attendedCount = activeMembers.filter((m) => attendance[m.id]?.attended).length;

    card.innerHTML = `
      <div class="member-row">
        <input class="text" data-field="label" value="${escapeHtml(task.label || "")}" />
        <span class="pill">${attendedCount}/${activeMembers.length} attended</span>
      </div>
      <div class="member-row">
        <input class="text" data-field="category" placeholder="category" value="${escapeHtml(task.category || "")}" />
        <input class="text" data-field="notes" placeholder="notes" value="${escapeHtml(task.notes || "")}" />
      </div>
      <details class="stack">
        <summary>Attendance</summary>
        <div class="stack attendance"></div>
      </details>
    `;

    // editable fields
    card.querySelectorAll('input[data-field]').forEach((input) => {
      input.addEventListener("input", () => {
        task[input.dataset.field] = input.value;
      });
    });

    const attendWrap = card.querySelector(".attendance");
    activeMembers.forEach((m) => {
      const row = document.createElement("label");
      row.className = "toggle";
      const checked = Boolean(attendance[m.id]?.attended);
      row.innerHTML = `
        <input type="checkbox" data-member-id="${m.id}" ${checked ? "checked" : ""} />
        <span>${escapeHtml(m.name || "")}</span>
      `;
      const cb = row.querySelector("input");
      cb.addEventListener("change", () => {
        if (!state.taskAttendance[task.id]) state.taskAttendance[task.id] = {};
        if (!state.taskAttendance[task.id][m.id]) state.taskAttendance[task.id][m.id] = {};
        state.taskAttendance[task.id][m.id].attended = cb.checked;
      });
      attendWrap.appendChild(row);
    });

    elements.weeklyTasks.appendChild(card);
  });

  const addBtn = header.querySelector("#add-week-task");
  addBtn.addEventListener("click", () => {
    state.weekTasks = state.weekTasks || [];
    state.weekTasks.push({ id: null, label: "New task", category: "", notes: "" });
    renderWeeklyTasks();
  });
};

let membersPanelOpen = false;
const setMembersPanelOpen = (open) => {
  membersPanelOpen = open;
  elements.membersPanel.style.display = open ? "block" : "none";
  elements.toggleMembers.textContent = open ? "Hide individuals" : "Edit individuals";
};

const renderMembersPanel = () => {
  elements.membersPanel.innerHTML = "";

  const filter = (elements.memberFilter.value || "").trim().toLowerCase();
  const list = (state.members || []).filter((m) => !filter || (m.name || "").toLowerCase().includes(filter));

  if (list.length === 0) {
    elements.membersPanel.innerHTML = `<div class="muted">No matching individuals.</div>`;
    return;
  }

  list.forEach((m) => {
    const card = document.createElement("div");
    card.className = "member-card";

    const s = m.state || {};
    if (!m.roleplays) m.roleplays = [];

    card.innerHTML = `
      <div class="member-row">
        <div>
          <div class="member-name">${escapeHtml(m.name || "")}</div>
          <div class="muted">${m.active ? "Active" : "Inactive"}</div>
        </div>
        <div class="stack" style="align-items:flex-end;">
          <label class="toggle"><input type="checkbox" data-field="weeklyFocusSet" ${s.weeklyFocusSet ? "checked" : ""} /><span>Weekly Focus</span></label>
          <label class="toggle"><input type="checkbox" data-field="roleplayDone" ${s.roleplayDone ? "checked" : ""} /><span>Roleplay Done</span></label>
        </div>
      </div>

      <div class="member-row">
        <label class="field" style="flex:1;">
          <span>First Meetings</span>
          <input class="text" type="number" min="0" data-field="firstMeetings" value="${Number(s.firstMeetings || 0)}" />
        </label>
        <label class="field" style="flex:1;">
          <span>Signed Recruits</span>
          <input class="text" type="number" min="0" data-field="signedRecruits" value="${Number(s.signedRecruits || 0)}" />
        </label>
      </div>

      <label class="field">
        <span>Goals</span>
        <textarea class="text" rows="2" data-field="goals">${escapeHtml(s.goals || "")}</textarea>
      </label>

      <label class="field">
        <span>Notes</span>
        <textarea class="text" rows="3" data-field="notes">${escapeHtml(s.notes || "")}</textarea>
      </label>

      <details class="stack">
        <summary>Roleplays</summary>
        <div class="stack roleplays"></div>
        <div class="member-row">
          <input class="text" data-roleplay="type" placeholder="Type (e.g., recruiting pitch)" />
          <input class="text" data-roleplay="note" placeholder="Note (optional)" />
          <button class="secondary" type="button" data-action="add-roleplay">Add</button>
        </div>
      </details>
    `;

    // bind state inputs
    card.querySelectorAll("[data-field]").forEach((el) => {
      const field = el.dataset.field;
      const isCheckbox = el.type === "checkbox";
      const apply = () => {
        m.state = m.state || {};
        if (isCheckbox) m.state[field] = el.checked;
        else if (el.type === "number") m.state[field] = Number(el.value) || 0;
        else m.state[field] = el.value;
      };
      el.addEventListener("input", apply);
      el.addEventListener("change", apply);
    });

    // roleplays list
    const renderRoleplays = () => {
      const wrap = card.querySelector(".roleplays");
      wrap.innerHTML = "";
      (m.roleplays || []).forEach((rp, idx) => {
        const row = document.createElement("div");
        row.className = "member-row";
        row.innerHTML = `
          <div class="stack" style="flex:1;">
            <div class="mono">${escapeHtml(rp.type || "")}</div>
            <div class="muted">${escapeHtml(rp.note || "")}</div>
            <div class="muted">${rp.timestamp ? new Date(rp.timestamp).toLocaleString() : ""}</div>
          </div>
          <button class="secondary" type="button" data-action="remove-roleplay" data-idx="${idx}">Remove</button>
        `;
        row.querySelector('[data-action="remove-roleplay"]').addEventListener("click", () => {
          m.roleplays.splice(idx, 1);
          renderRoleplays();
        });
        wrap.appendChild(row);
      });
      if ((m.roleplays || []).length === 0) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.textContent = "No roleplays logged.";
        wrap.appendChild(empty);
      }
    };

    renderRoleplays();

    card.querySelector('[data-action="add-roleplay"]').addEventListener("click", () => {
      const typeInput = card.querySelector('[data-roleplay="type"]');
      const noteInput = card.querySelector('[data-roleplay="note"]');
      const type = (typeInput.value || "").trim();
      const note = (noteInput.value || "").trim();
      if (!type) return setToast("Roleplay type required");
      m.roleplays = m.roleplays || [];
      m.roleplays.push({
        memberId: m.id,
        type,
        note,
        timestamp: new Date().toISOString(),
      });
      typeInput.value = "";
      noteInput.value = "";
      renderRoleplays();
    });

    elements.membersPanel.appendChild(card);
  });
};

const collectRoleplaysForSave = () => {
  const all = [];
  (state.members || []).forEach((m) => {
    (m.roleplays || []).forEach((rp) => {
      all.push({
        memberId: m.id,
        type: rp.type,
        note: rp.note,
        timestamp: rp.timestamp || new Date().toISOString(),
      });
    });
  });
  return all;
};

const saveWeek = async () => {
  if (state.saving) return;
  if (!state.teamId || !state.isoWeek) return;

  state.saving = true;
  elements.saveWeek.disabled = true;
  setWeekStatus("Saving...");

  const membersPayload = (state.members || []).map((m) => ({
    memberId: m.id,
    state: m.state || {},
  }));

  const roleplays = collectRoleplaysForSave();

  const { status, payload } = await apiFetch(
    `/api/week-save?teamId=${encodeURIComponent(state.teamId)}&isoWeek=${encodeURIComponent(state.isoWeek)}`,
    {
      method: "POST",
      body: {
        expectedWeekUpdatedAt: state.weekUpdatedAt,
        members: membersPayload,
        weekTasks: state.weekTasks || [],
        taskAttendance: state.taskAttendance || {},
        roleplays,
      },
    }
  );

  if (status === 409) {
    setWeekStatus("Conflict — reloading");
    setToast("Someone else updated this week. Reloaded.");
    await loadWeekData(true);
  } else if (status !== 200 || !payload?.ok) {
    setWeekStatus("Save failed");
    setToast("Save failed");
  } else {
    state.weekUpdatedAt = payload.weekUpdatedAt || state.weekUpdatedAt;
    state.weekTasks = payload.weekTasks || state.weekTasks;
    state.lastSavedAt = Date.now();
    setWeekStatus("Saved");
    setToast("Saved");
    // refresh cache
    state.cache.set(`${state.teamId}:${state.isoWeek}`, {
      weekUpdatedAt: state.weekUpdatedAt,
      members: state.members,
      weekTasks: state.weekTasks,
      taskAttendance: state.taskAttendance,
    });
  }

  elements.saveWeek.disabled = false;
  state.saving = false;
  setDiagnostics();
};

const loadRosterForEditing = async () => {
  if (!state.teamId || state.teamId === "all") {
    await renderRosterList();
    return;
  }
  const { status, payload } = await apiFetch(`/api/roster-get?teamId=${encodeURIComponent(state.teamId)}`);
  if (status !== 200 || !payload?.ok) {
    setToast("Failed to load roster");
    return;
  }
  // Replace members list but preserve current week state fields if loaded
  const roster = payload.members || [];
  const byId = new Map((state.members || []).map((m) => [m.id, m]));
  state.members = roster.map((m) => {
    const existing = byId.get(m.id);
    return {
      ...m,
      state: existing?.state || m.state || {},
      roleplays: existing?.roleplays || [],
    };
  });
  await renderRosterList();
  renderRosterDisplay();
};

const saveRoster = async () => {
  if (state.teamId === "all") return;

  // Save roster changes (update existing only) - create uses roster-save via Add button.
  const updates = [];
  (state.members || []).forEach((m) => {
    updates.push(
      apiFetch(`/api/roster-update?teamId=${encodeURIComponent(state.teamId)}`, {
        method: "PATCH",
        body: {
          memberId: m.id,
          name: (m.name || "").trim(),
          email: (m.email || "").trim(),
          phone: (m.phone || "").trim(),
          active: Boolean(m.active),
        },
      })
    );
  });

  setToast("Saving roster...");
  const results = await Promise.all(updates);
  const failures = results.filter((r) => r.status !== 200 || !r.payload?.ok);
  if (failures.length) {
    setToast("Roster save had errors");
  } else {
    setToast("Roster saved");
  }

  // reload week data to ensure we keep aligned members order
  await loadWeekData(true);
  await renderRosterList();
};

const addMember = async () => {
  if (state.teamId === "all") return;
  const name = (elements.newMemberName.value || "").trim();
  if (!name) return setToast("Name required");
  const email = (elements.newMemberEmail.value || "").trim();
  const phone = (elements.newMemberPhone.value || "").trim();
  const teamId = elements.newMemberTeam.value;

  const { status, payload } = await apiFetch(`/api/roster-save?teamId=${encodeURIComponent(teamId)}`, {
    method: "POST",
    body: { name, email, phone, active: true },
  });

  if (status !== 200 || !payload?.ok) {
    setToast("Failed to add member");
    return;
  }

  elements.newMemberName.value = "";
  elements.newMemberEmail.value = "";
  elements.newMemberPhone.value = "";

  // If member added to current team, reload.
  if (teamId === state.teamId) {
    await loadRosterForEditing();
    await loadWeekData(true);
  } else {
    setToast("Member added");
  }
};

const exportHistory = async (allTeams = false) => {
  setExportStatus("Exporting...");
  const qs = allTeams ? "allTeams=1" : `teamId=${encodeURIComponent(state.teamId || "")}`;
  const { status, payload } = await apiFetch(`/api/history-export?${qs}`);
  if (status !== 200 || !payload?.ok) {
    setExportStatus("Export failed");
    setToast("Export failed");
    return null;
  }
  const jsonText = JSON.stringify(payload.history || [], null, 2);
  await navigator.clipboard.writeText(jsonText);
  setExportStatus("Copied JSON to clipboard");
  setToast("Copied to clipboard");
  return jsonText;
};

const openChatInsights = async () => {
  const jsonText = await exportHistory(false);
  if (!jsonText) return;
  const prompt = `Analyze this team history JSON. Give: (1) top 5 wins, (2) top 5 bottlenecks, (3) weekly focus recommendation for next week, (4) which reps need coaching and why, (5) 3 specific actions for the leader. JSON is already copied to clipboard; I will paste it after your first message.`;
  window.open(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`, "_blank", "noopener,noreferrer");
};

const bindEvents = () => {
  elements.actorSelect.value = state.actor;
  elements.actorSelect.addEventListener("change", () => {
    state.actor = elements.actorSelect.value;
    localStorage.setItem(STORAGE_ACTOR_KEY, state.actor);
    setToast(`Actor: ${state.actor}`);
  });

  elements.teamSelect.addEventListener("change", async () => {
    state.teamId = elements.teamSelect.value;
    state.cache.clear();
    await loadWeeks();
    state.isoWeek = getISOWeekKey(new Date());
    elements.isoWeek.textContent = state.isoWeek;
    await loadRosterForEditing();
    await loadWeekData(true);
  });

  elements.saveWeek.addEventListener("click", saveWeek);

  elements.toggleMembers.addEventListener("click", () => {
    setMembersPanelOpen(!membersPanelOpen);
  });

  elements.memberFilter.addEventListener("input", () => renderMembersPanel());

  elements.toggleRoster.addEventListener("click", async () => {
    setRosterPanelOpen(!rosterPanelOpen);
    if (rosterPanelOpen) await renderRosterList();
  });

  elements.rosterFilter.addEventListener("input", () => renderRosterList());
  elements.saveRoster.addEventListener("click", saveRoster);
  elements.addMember.addEventListener("click", addMember);

  elements.exportTeam.addEventListener("click", () => exportHistory(false));
  elements.exportAll.addEventListener("click", () => exportHistory(true));
  elements.chatInsights.addEventListener("click", openChatInsights);

  elements.clearToken.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    state.adminToken = "";
    window.location.href = "/index.html";
  });
};

const init = async () => {
  // Must be authenticated
  const ok = await requireAuthOrRedirect();
  if (!ok) return;

  // UI defaults
  state.isoWeek = getISOWeekKey(new Date());
  elements.isoWeek.textContent = state.isoWeek;

  // Default panels
  setRosterPanelOpen(true);
  setMembersPanelOpen(false);

  bindEvents();

  await refreshHealth();
  await loadTeams();
  await loadWeeks();

  // pick defaults after teams load
  if (state.teamId) elements.teamSelect.value = state.teamId;

  // Load roster editor and week data
  await loadRosterForEditing();
  await setWeek(state.isoWeek);

  // periodic health
  window.setInterval(refreshHealth, 30_000);
};

init();
