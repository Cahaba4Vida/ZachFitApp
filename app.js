const state = {
  user: null,
  token: null,
  profile: null,
  program: null,
  workouts: {},
  prs: [],
  admin: {
    clients: [],
    selected: null,
  },
  chart: null,
};

const views = document.querySelectorAll(".view");
const navLinks = document.querySelectorAll("[data-nav]");
const adminLinks = document.querySelectorAll(".admin-only");

const elements = {
  userChip: document.getElementById("user-chip"),
  loginBtn: document.getElementById("login-btn"),
  logoutBtn: document.getElementById("logout-btn"),
  ctaSignup: document.getElementById("cta-signup"),
  ctaLogin: document.getElementById("cta-login"),
  planForm: document.getElementById("plan-form"),
  generateProgram: document.getElementById("generate-program"),
  saveOnboarding: document.getElementById("save-onboarding"),
  programTabs: document.getElementById("program-tabs"),
  programWeeks: document.getElementById("program-weeks"),
  refreshProgram: document.getElementById("refresh-program"),
  finalizeProgram: document.getElementById("finalize-program"),
  programChatInput: document.getElementById("program-chat-input"),
  programChatSend: document.getElementById("program-chat-send"),
  programChatClear: document.getElementById("program-chat-clear"),
  programChatResponse: document.getElementById("program-chat-response"),
  workoutCalendar: document.getElementById("workout-calendar"),
  workoutDetail: document.getElementById("workout-detail"),
  todayWorkout: document.getElementById("today-workout"),
  saveWorkout: document.getElementById("save-workout"),
  todayChatInput: document.getElementById("today-chat-input"),
  todayChatSend: document.getElementById("today-chat-send"),
  todayChatClear: document.getElementById("today-chat-clear"),
  todayChatResponse: document.getElementById("today-chat-response"),
  prForm: document.getElementById("pr-form"),
  addPr: document.getElementById("add-pr"),
  prHistory: document.getElementById("pr-history"),
  prChart: document.getElementById("pr-chart"),
  unitsToggle: document.getElementById("units-toggle"),
  adminWarning: document.getElementById("admin-warning"),
  clientList: document.getElementById("client-list"),
  clientDetail: document.getElementById("client-detail"),
  toastContainer: document.getElementById("toast-container"),
  debugPanel: document.getElementById("debug-panel"),
  debugToggle: document.getElementById("debug-toggle"),
  debugPanelBody: document.getElementById("debug-panel-body"),
};

const routes = ["home", "auth", "app", "workouts", "prs", "settings", "admin"];

const debugPanelState = {
  enabled: new URLSearchParams(window.location.search).get("debug") === "1",
  open: true,
  entries: {},
};

const generateTraceId = () =>
  `${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;

const parseJson = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
};

const showToast = (message, variant = "error") => {
  if (!elements.toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast ${variant}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
};

const updateDebugPanel = () => {
  if (!debugPanelState.enabled || !elements.debugPanel || !elements.debugPanelBody) {
    if (elements.debugPanel) elements.debugPanel.classList.add("hidden");
    return;
  }
  elements.debugPanel.classList.remove("hidden");
  elements.debugPanelBody.innerHTML = "";
  const entries = Object.entries(debugPanelState.entries);
  if (!entries.length) {
    elements.debugPanelBody.innerHTML = "<p class=\"muted\">No requests captured yet.</p>";
    return;
  }
  entries.forEach(([label, entry]) => {
    const container = document.createElement("div");
    const statusLine = document.createElement("div");
    statusLine.innerHTML = `<strong>${label}</strong> — status ${entry.status} — trace ${entry.traceId}`;
    const pre = document.createElement("pre");
    pre.textContent =
      typeof entry.body === "string" ? entry.body : JSON.stringify(entry.body, null, 2);
    container.appendChild(statusLine);
    container.appendChild(pre);
    elements.debugPanelBody.appendChild(container);
  });
};

const recordDebugEntry = (label, entry) => {
  if (!debugPanelState.enabled) return;
  debugPanelState.entries[label] = entry;
  updateDebugPanel();
};

const refreshAuthToken = async () => {
  const identity = window.netlifyIdentity;
  const user = identity?.currentUser ? identity.currentUser() : null;
  if (!user) {
    state.user = null;
    state.token = null;
    return null;
  }
  state.user = user;
  if (typeof user.jwt === "function") {
    try {
      state.token = await user.jwt();
      return state.token;
    } catch (err) {
      console.warn("Failed to refresh token.", err);
    }
  }
  state.token = user.token?.access_token || null;
  return state.token;
};

const requireAuthToken = async () => {
  const token = await refreshAuthToken();
  if (!state.user || !token) {
    showToast("Please log in to continue.", "error");
    window.location.hash = "#/auth";
    return null;
  }
  return token;
};

const apiFetch = async (path, options = {}) => {
  const { returnMeta = false, ...requestOptions } = options;
  const headers = { ...(requestOptions.headers || {}) };
  const traceId = generateTraceId();
  headers["X-Trace-Id"] = traceId;
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  if (requestOptions.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, { ...requestOptions, headers });
  const text = await response.text();
  const data = parseJson(text);
  const meta = { status: response.status, body: data, traceId };
  if (!response.ok) {
    const message =
      typeof data === "object" && data
        ? data.error || data.message || `Request failed: ${response.status}`
        : text || `Request failed: ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.body = data;
    error.traceId = data?.traceId || traceId;
    console.error(`[trace ${error.traceId}] API error`, {
      path,
      status: error.status,
      error: message,
      details: data?.details,
    });
    throw error;
  }
  if (response.status === 204) {
    return returnMeta ? { data: null, ...meta } : null;
  }
  return returnMeta ? { data, ...meta } : data;
};

const formatDate = (date = new Date()) => date.toISOString().split("T")[0];

const showView = (name) => {
  views.forEach((view) => {
    view.classList.toggle("active", view.dataset.view === name);
  });
  navLinks.forEach((link) => {
    const route = link.getAttribute("href").replace("#/", "");
    link.classList.toggle("active", route === name || (route === "" && name === "home"));
  });
};

const ensureAuth = () => {
  if (!state.user) {
    window.location.hash = "#/auth";
    return false;
  }
  return true;
};

const bindListener = (element, eventName, handler) => {
  if (!element) {
    console.warn(`Missing element for ${eventName} listener.`);
    return;
  }
  element.addEventListener(eventName, (event) => {
    Promise.resolve(handler(event)).catch((err) => {
      console.error(err);
      showToast(err?.message || "Something went wrong.", "error");
    });
  });
};

const handleActionError = (label, err) => {
  const message = err?.message || "Something went wrong.";
  const traceInfo = err?.traceId ? ` (trace ${err.traceId})` : "";
  showToast(`${label} failed: ${message}${traceInfo}`, "error");
  recordDebugEntry(label, {
    status: err?.status || "error",
    body: err?.body || message,
    traceId: err?.traceId || "unknown",
  });
};

const updateUserChip = () => {
  if (state.user) {
    elements.userChip.textContent = state.user.email;
    elements.loginBtn.style.display = "none";
    elements.logoutBtn.style.display = "inline-flex";
  } else {
    elements.userChip.textContent = "Not signed in";
    elements.loginBtn.style.display = "inline-flex";
    elements.logoutBtn.style.display = "none";
  }
};

const loadWhoAmI = async () => {
  if (!state.token) return;
  const data = await apiFetch("/api/whoami");
  state.profile = data.profile;
  state.user = data.user;
  updateUserChip();
  elements.unitsToggle.value = data.profile?.units || "lb";
  const isAdmin = data.user.role === "admin";
  adminLinks.forEach((link) => link.classList.toggle("visible", isAdmin));
  elements.adminWarning.textContent = isAdmin
    ? "Admin access granted."
    : "Admin access is restricted to allowlisted accounts.";
};

const loadProfile = async () => {
  const profile = await apiFetch("/api/profile-get");
  state.profile = profile;
  elements.unitsToggle.value = profile.units || "lb";
  return profile;
};

const saveProfile = async (partial) => {
  const profile = await apiFetch("/api/profile-save", {
    method: "POST",
    body: JSON.stringify(partial),
  });
  state.profile = profile;
  return profile;
};

const populateOnboardingForm = (profile) => {
  if (!profile?.onboarding) return;
  const data = profile.onboarding;
  Object.entries(data).forEach(([key, value]) => {
    const field = elements.planForm.elements.namedItem(key);
    if (field) {
      field.value = value;
    }
  });
};

const renderProgram = () => {
  elements.programTabs.innerHTML = "";
  elements.programWeeks.innerHTML = "";
  if (!state.program) {
    elements.programWeeks.innerHTML = "<p>No program yet. Generate one to get started.</p>";
    return;
  }
  const { weeks } = state.program;
  if (!weeks?.length) return;
  let activeWeek = 0;
  const renderWeek = (index) => {
    elements.programWeeks.innerHTML = "";
    const week = weeks[index];
    if (!week) return;
    const weekCard = document.createElement("div");
    weekCard.className = "week-card";
    weekCard.innerHTML = `<h3>${week.title}</h3><p class="muted">${week.focus}</p>`;
    week.days.forEach((day) => {
      const dayCard = document.createElement("div");
      dayCard.className = "day-card";
      dayCard.innerHTML = `
        <strong>${day.name}</strong>
        <div>${day.theme}</div>
        <ul class="exercise-list">
          ${day.exercises
            .map(
              (exercise) =>
                `<li>${exercise.name} — ${exercise.sets}x${exercise.reps} @ ${exercise.intensity}</li>`
            )
            .join("")}
        </ul>
      `;
      weekCard.appendChild(dayCard);
    });
    elements.programWeeks.appendChild(weekCard);
  };
  weeks.forEach((week, index) => {
    const button = document.createElement("button");
    button.textContent = week.title;
    button.className = index === 0 ? "active" : "";
    button.addEventListener("click", () => {
      activeWeek = index;
      [...elements.programTabs.children].forEach((child, idx) =>
        child.classList.toggle("active", idx === index)
      );
      renderWeek(index);
    });
    elements.programTabs.appendChild(button);
  });
  renderWeek(activeWeek);
};

const loadProgram = async () => {
  const program = await apiFetch("/api/program-get");
  state.program = program;
  renderProgram();
};

const loadWorkouts = async () => {
  const workouts = await apiFetch("/api/workouts-get");
  state.workouts = workouts || {};
  renderCalendar();
};

const renderCalendar = () => {
  elements.workoutCalendar.innerHTML = "";
  const entries = Object.entries(state.workouts);
  if (entries.length === 0) {
    elements.workoutCalendar.innerHTML = "<p>No workouts scheduled yet.</p>";
    return;
  }
  entries
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([date, workout]) => {
      const item = document.createElement("div");
      item.className = "calendar-item";
      item.innerHTML = `
        <div>
          <strong>${date}</strong>
          <div>${workout.name || "Workout"}</div>
        </div>
      `;
      const button = document.createElement("button");
      button.textContent = "View";
      button.className = "secondary";
      button.addEventListener("click", () => loadWorkout(date));
      item.appendChild(button);
      elements.workoutCalendar.appendChild(item);
    });
};

const renderWorkoutDetail = (workout, date) => {
  if (!workout) {
    elements.workoutDetail.innerHTML = "<p>Select a workout to view details.</p>";
    return;
  }
  elements.workoutDetail.innerHTML = "";
  const header = document.createElement("div");
  header.innerHTML = `<h3>${workout.name || "Workout"}</h3><p>${date}</p>`;
  elements.workoutDetail.appendChild(header);
  workout.exercises.forEach((exercise, idx) => {
    const container = document.createElement("div");
    container.className = "workout-exercise";
    container.innerHTML = `<strong>${exercise.name}</strong><div>${exercise.sets} sets x ${exercise.reps} reps @ ${exercise.intensity}</div>`;
    const sets = Array.from({ length: exercise.sets }).map((_, setIndex) => {
      const log = exercise.logs?.[setIndex] || { weight: "", reps: "", rpe: "" };
      return `
        <div class="set-row">
          <input type="number" step="0.5" placeholder="Weight" data-set="${idx}" data-field="weight" data-index="${setIndex}" value="${log.weight}" />
          <input type="number" step="1" placeholder="Reps" data-set="${idx}" data-field="reps" data-index="${setIndex}" value="${log.reps}" />
          <input type="number" step="0.5" placeholder="RPE" data-set="${idx}" data-field="rpe" data-index="${setIndex}" value="${log.rpe}" />
          <span>Set ${setIndex + 1}</span>
        </div>
      `;
    });
    container.insertAdjacentHTML("beforeend", sets.join(""));
    elements.workoutDetail.appendChild(container);
  });
  elements.workoutDetail.dataset.date = date;
};

const loadWorkout = async (date) => {
  const workout = await apiFetch(`/api/workout-get?date=${date}`);
  renderWorkoutDetail(workout, date);
};

const saveWorkoutLog = async () => {
  const date = elements.workoutDetail.dataset.date;
  if (!date) return;
  const workout = await apiFetch(`/api/workout-get?date=${date}`);
  const inputs = elements.workoutDetail.querySelectorAll("input[data-set]");
  inputs.forEach((input) => {
    const setIndex = Number(input.dataset.index);
    const exerciseIndex = Number(input.dataset.set);
    const field = input.dataset.field;
    const value = input.value === "" ? "" : Number(input.value);
    if (!workout.exercises[exerciseIndex].logs) {
      workout.exercises[exerciseIndex].logs = [];
    }
    if (!workout.exercises[exerciseIndex].logs[setIndex]) {
      workout.exercises[exerciseIndex].logs[setIndex] = { weight: "", reps: "", rpe: "" };
    }
    workout.exercises[exerciseIndex].logs[setIndex][field] = value;
  });
  const saved = await apiFetch(`/api/workout-log-save?date=${date}`, {
    method: "POST",
    body: JSON.stringify({ workout }),
  });
  state.workouts[date] = saved;
  renderWorkoutDetail(saved, date);
};

const loadPrs = async () => {
  const prs = await apiFetch("/api/pr-list");
  state.prs = prs || [];
  renderPrHistory();
  renderPrChart();
};

const renderPrHistory = () => {
  elements.prHistory.innerHTML = "";
  if (!state.prs.length) {
    elements.prHistory.innerHTML = "<p>No PRs logged yet.</p>";
    return;
  }
  const list = document.createElement("ul");
  state.prs.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = `${entry.date} - ${entry.lift} ${entry.weight} x ${entry.reps} (est 1RM ${entry.estimated1Rm})`;
    list.appendChild(item);
  });
  elements.prHistory.appendChild(list);
};

const renderPrChart = () => {
  if (!state.prs.length) return;
  const dataByLift = state.prs.reduce((acc, entry) => {
    acc[entry.lift] = acc[entry.lift] || [];
    acc[entry.lift].push(entry);
    return acc;
  }, {});
  const labels = [...new Set(state.prs.map((entry) => entry.date))];
  const datasets = Object.entries(dataByLift).map(([lift, entries], idx) => {
    const color = ["#1d4ed8", "#16a34a", "#f97316", "#9333ea"][idx % 4];
    return {
      label: lift,
      data: labels.map((label) => {
        const match = entries.find((entry) => entry.date === label);
        return match ? match.estimated1Rm : null;
      }),
      borderColor: color,
      backgroundColor: color,
      tension: 0.3,
    };
  });
  if (state.chart) {
    state.chart.destroy();
  }
  state.chart = new Chart(elements.prChart, {
    type: "line",
    data: { labels, datasets },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } },
  });
};

const loadAdminClients = async () => {
  const data = await apiFetch("/api/admin/clients-list");
  state.admin.clients = data.clients || [];
  renderClients();
};

const renderClients = () => {
  elements.clientList.innerHTML = "";
  if (!state.admin.clients.length) {
    elements.clientList.innerHTML = "<p>No clients yet.</p>";
    return;
  }
  state.admin.clients.forEach((client) => {
    const card = document.createElement("div");
    card.className = "calendar-item";
    card.innerHTML = `
      <div>
        <strong>${client.email}</strong>
        <div>Last login: ${client.lastLogin || "-"}</div>
      </div>
    `;
    const button = document.createElement("button");
    button.textContent = "Open";
    button.className = "secondary";
    button.addEventListener("click", () => loadClientDetail(client.userId));
    card.appendChild(button);
    elements.clientList.appendChild(card);
  });
};

const loadClientDetail = async (userId) => {
  const detail = await apiFetch(`/api/admin/client-get?userId=${userId}`);
  state.admin.selected = detail;
  renderClientDetail();
};

const buildCoachPrompt = (detail) => {
  const prompt = `You are Zach's coaching assistant.\n\nClient:\n- id: ${detail.userId}\n- email: ${detail.email}\n\nGoals & onboarding:\n${JSON.stringify(detail.profile?.onboarding || {}, null, 2)}\n\nPR summary:\n${JSON.stringify(detail.prs || [], null, 2)}\n\nCurrent program:\n${JSON.stringify(detail.program || {}, null, 2)}\n\nToday's workout:\n${JSON.stringify(detail.todayWorkout || {}, null, 2)}\n\nRecent logs:\n${JSON.stringify(detail.workoutLogs || {}, null, 2)}\n\nInstruction: propose minimal edits. Keep the existing JSON format. Return updated JSON for the specified workout or program section only.`;
  return prompt;
};

const renderClientDetail = () => {
  const detail = state.admin.selected;
  if (!detail) {
    elements.clientDetail.innerHTML = "<p>Select a client.</p>";
    return;
  }
  const prompt = buildCoachPrompt(detail);
  elements.clientDetail.innerHTML = `
    <div class="day-card">
      <strong>${detail.email}</strong>
      <p>User ID: ${detail.userId}</p>
      <p>Goal: ${detail.profile?.onboarding?.goal || "-"}</p>
      <p>Units: ${detail.profile?.units || "lb"}</p>
    </div>
    <div class="day-card">
      <h4>Program</h4>
      <pre class="chat-output">${JSON.stringify(detail.program || {}, null, 2)}</pre>
    </div>
    <div class="day-card">
      <h4>Workouts</h4>
      <textarea class="chat-output" rows="8" id="admin-workouts-json">${JSON.stringify(
        detail.workouts || {},
        null,
        2
      )}</textarea>
      <div class="button-row">
        <button class="secondary" id="save-admin-workouts">Save workouts</button>
      </div>
    </div>
    <div class="day-card">
      <h4>PRs</h4>
      <pre class="chat-output">${JSON.stringify(detail.prs || [], null, 2)}</pre>
    </div>
    <div class="day-card">
      <h4>Coach Prompt Link</h4>
      <textarea class="chat-output" rows="8" id="coach-prompt-text">${prompt}</textarea>
      <div class="button-row">
        <button class="secondary" id="copy-prompt">Copy prompt</button>
        <button class="primary" id="open-chatgpt">Open ChatGPT with prompt</button>
      </div>
    </div>
  `;
  const copyBtn = document.getElementById("copy-prompt");
  const openBtn = document.getElementById("open-chatgpt");
  const promptText = document.getElementById("coach-prompt-text");
  const saveWorkoutsBtn = document.getElementById("save-admin-workouts");
  const workoutsField = document.getElementById("admin-workouts-json");
  copyBtn.addEventListener("click", () => {
    promptText.select();
    document.execCommand("copy");
  });
  openBtn.addEventListener("click", () => {
    const url = `https://chat.openai.com/?prompt=${encodeURIComponent(prompt)}`;
    window.open(url, "_blank");
  });
  saveWorkoutsBtn.addEventListener("click", async () => {
    try {
      const workouts = JSON.parse(workoutsField.value || "{}");
      await apiFetch("/api/admin/client-update", {
        method: "POST",
        body: JSON.stringify({ userId: detail.userId, workouts }),
      });
    } catch (err) {
      console.error(err);
    }
  });
};

const initIdentity = () => {
  if (!window.netlifyIdentity) return;
  window.netlifyIdentity.on("init", async (user) => {
    state.user = user;
    await refreshAuthToken();
    updateUserChip();
    if (user) {
      loadWhoAmI().catch(console.error);
      loadProfile().then(populateOnboardingForm).catch(console.error);
    }
  });
  window.netlifyIdentity.on("login", async (user) => {
    state.user = user;
    await refreshAuthToken();
    updateUserChip();
    window.location.hash = "#/app";
    loadWhoAmI().catch(console.error);
    loadProfile().then(populateOnboardingForm).catch(console.error);
    apiFetch("/api/audit-log-event", {
      method: "POST",
      body: JSON.stringify({ type: "login", detail: "User logged in" }),
    }).catch(console.error);
  });
  window.netlifyIdentity.on("logout", () => {
    state.user = null;
    state.token = null;
    updateUserChip();
    window.location.hash = "#/";
  });
  window.netlifyIdentity.init();
};

const registerServiceWorker = () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js");
  }
};

const handleRoute = () => {
  const hash = window.location.hash.replace("#", "");
  const route = hash.replace("/", "");
  const name = routes.includes(route) ? route : "home";
  if (name !== "home" && name !== "auth" && !ensureAuth()) {
    return;
  }
  showView(name);
  if (name === "app" && state.user) {
    loadProgram().catch(console.error);
  }
  if (name === "workouts" && state.user) {
    loadWorkouts().catch(console.error);
  }
  if (name === "prs" && state.user) {
    loadPrs().catch(console.error);
  }
  if (name === "admin" && state.user) {
    loadAdminClients().catch(console.error);
  }
};

const setupListeners = () => {
  bindListener(elements.loginBtn, "click", () => {
    window.netlifyIdentity.open("login");
  });
  bindListener(elements.logoutBtn, "click", () => {
    window.netlifyIdentity.logout();
  });
  bindListener(elements.ctaSignup, "click", () => window.netlifyIdentity.open("signup"));
  bindListener(elements.ctaLogin, "click", () => window.netlifyIdentity.open("login"));
  bindListener(elements.generateProgram, "click", async () => {
    const label = "Generate Program";
    const token = await requireAuthToken();
    if (!token || !elements.planForm) return;
    const formData = new FormData(elements.planForm);
    const onboarding = Object.fromEntries(formData.entries());
    onboarding.days = Number(onboarding.days);
    try {
      const result = await apiFetch("/api/program-generate", {
        method: "POST",
        body: JSON.stringify({ onboarding }),
        returnMeta: true,
      });
      state.program = result.data?.program || result.data;
      renderProgram();
      recordDebugEntry(label, {
        status: result.status,
        body: result.body,
        traceId: result.traceId,
      });
      showToast("Program generated.", "success");
    } catch (err) {
      handleActionError(label, err);
    }
  });
  bindListener(elements.saveOnboarding, "click", async () => {
    const label = "Save Onboarding";
    const token = await requireAuthToken();
    if (!token || !elements.planForm) return;
    const formData = new FormData(elements.planForm);
    const onboarding = Object.fromEntries(formData.entries());
    onboarding.days = Number(onboarding.days);
    try {
      const result = await apiFetch("/api/profile-save", {
        method: "POST",
        body: JSON.stringify({ onboarding, units: onboarding.units || state.profile?.units || "lb" }),
        returnMeta: true,
      });
      state.profile = result.data;
      recordDebugEntry(label, {
        status: result.status,
        body: result.body,
        traceId: result.traceId,
      });
      showToast("Onboarding saved.", "success");
    } catch (err) {
      handleActionError(label, err);
    }
  });
  bindListener(elements.refreshProgram, "click", () => loadProgram());
  bindListener(elements.finalizeProgram, "click", async () => {
    const label = "Finalize Program";
    const token = await requireAuthToken();
    if (!token) return;
    try {
      const result = await apiFetch("/api/program-finalize", { method: "POST", returnMeta: true });
      recordDebugEntry(label, {
        status: result.status,
        body: result.body,
        traceId: result.traceId,
      });
      try {
        await apiFetch("/api/audit-log-event", {
          method: "POST",
          body: JSON.stringify({ type: "program_finalized", detail: "Program finalized" }),
        });
      } catch (err) {
        console.warn("Failed to record audit event.", err);
      }
      showToast("Program finalized.", "success");
    } catch (err) {
      handleActionError(label, err);
    }
  });
  bindListener(elements.programChatSend, "click", async () => {
    const prompt = elements.programChatInput.value.trim();
    if (!prompt) return;
    const response = await apiFetch("/api/ai", {
      method: "POST",
      body: JSON.stringify({ mode: "program_refine", prompt, program: state.program }),
    });
    elements.programChatResponse.textContent = response.message;
  });
  bindListener(elements.programChatClear, "click", () => {
    elements.programChatInput.value = "";
    elements.programChatResponse.textContent = "";
  });
  bindListener(elements.todayWorkout, "click", async () => {
    const date = formatDate();
    await loadWorkout(date);
  });
  bindListener(elements.saveWorkout, "click", () => saveWorkoutLog());
  bindListener(elements.todayChatSend, "click", async () => {
    const prompt = elements.todayChatInput.value.trim();
    if (!prompt) return;
    const date = formatDate();
    const workout = await apiFetch(`/api/workout-get?date=${date}`);
    const response = await apiFetch("/api/ai", {
      method: "POST",
      body: JSON.stringify({ mode: "today_adjust", prompt, workout }),
    });
    elements.todayChatResponse.textContent = response.message;
  });
  bindListener(elements.todayChatClear, "click", () => {
    elements.todayChatInput.value = "";
    elements.todayChatResponse.textContent = "";
  });
  bindListener(elements.addPr, "click", async () => {
    const formData = new FormData(elements.prForm);
    const pr = Object.fromEntries(formData.entries());
    pr.weight = Number(pr.weight);
    pr.reps = Number(pr.reps);
    pr.rpe = pr.rpe ? Number(pr.rpe) : null;
    await apiFetch("/api/pr-add", { method: "POST", body: JSON.stringify(pr) });
    await loadPrs();
  });
  bindListener(elements.unitsToggle, "change", async (event) => {
    if (!ensureAuth()) return;
    await saveProfile({ units: event.target.value });
    await loadPrs();
  });
  window.addEventListener("hashchange", handleRoute);
  elements.resetPassword = document.getElementById("reset-password");
  if (elements.resetPassword) {
    bindListener(elements.resetPassword, "click", () => {
      window.netlifyIdentity.open("login");
    });
  }
  if (elements.debugToggle) {
    bindListener(elements.debugToggle, "click", () => {
      debugPanelState.open = !debugPanelState.open;
      elements.debugPanelBody.classList.toggle("hidden", !debugPanelState.open);
      elements.debugToggle.textContent = debugPanelState.open ? "Hide" : "Show";
    });
  }
  updateDebugPanel();
};

initIdentity();
registerServiceWorker();
setupListeners();
handleRoute();
