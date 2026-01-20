const state = {
  identityUser: null,
  user: null,
  isAuthReady: false,
  profile: null,
  program: null,
  programRevisions: [],
  workouts: {},
  prs: [],
  planDirty: false,
  admin: {
    clients: [],
    selected: null,
    audit: [],
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
  programImport: document.getElementById("program-import"),
  programImportFile: document.getElementById("program-import-file"),
  programImportStatus: document.getElementById("program-import-status"),
  planDirtyStatus: document.getElementById("plan-dirty-status"),
  programChatInput: document.getElementById("program-chat-input"),
  programChatSend: document.getElementById("program-chat-send"),
  programChatClear: document.getElementById("program-chat-clear"),
  programChatResponse: document.getElementById("program-chat-response"),
  programRevisions: document.getElementById("program-revisions"),
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
  prSummary: document.getElementById("pr-summary"),
  unitsToggle: document.getElementById("units-toggle"),
  adminWarning: document.getElementById("admin-warning"),
  clientList: document.getElementById("client-list"),
  clientDetail: document.getElementById("client-detail"),
  adminAuditLog: document.getElementById("admin-audit-log"),
  toast: document.getElementById("toast"),
};

const routes = ["home", "auth", "app", "workouts", "prs", "settings", "admin"];

const getCurrentUser = () => window.netlifyIdentity?.currentUser?.();

const apiFetch = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (path.startsWith("/api/")) {
    const currentUser = getCurrentUser();
    if (currentUser) {
      const token = await currentUser.jwt();
      headers.Authorization = `Bearer ${token}`;
    }
  }
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = text;
    }
  }
  if (!response.ok) {
    const message = data && typeof data === "object" ? data.error : text;
    throw new Error(message || `Request failed: ${response.status}`);
  }
  if (response.status === 204) {
    return null;
  }
  return data;
};

const formatDate = (date = new Date()) => date.toISOString().split("T")[0];
const ONBOARDING_DRAFT_KEY = "zachfitapp:onboardingDraft";
let onboardingDraftTimeout = null;

const setButtonLoading = (button, isLoading, loadingText) => {
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.textContent = loadingText || button.dataset.originalText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
};

const addListener = (element, event, handler) => {
  if (!element) return;
  element.addEventListener(event, handler);
};

const showToast = (message, type = "success") => {
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type}`;
  setTimeout(() => {
    elements.toast.className = "toast";
  }, 2500);
};

const authRequiredControls = [
  elements.generateProgram,
  elements.saveOnboarding,
  elements.programImport,
  elements.refreshProgram,
  elements.finalizeProgram,
  elements.programChatSend,
  elements.programChatClear,
  elements.todayWorkout,
  elements.saveWorkout,
  elements.todayChatSend,
  elements.todayChatClear,
  elements.addPr,
  elements.unitsToggle,
];

const setAuthReady = (ready) => {
  state.isAuthReady = ready;
  authRequiredControls.forEach((control) => {
    if (control) control.disabled = !ready;
  });
};

const setPlanDirty = (dirty, message) => {
  state.planDirty = dirty;
  if (!elements.planDirtyStatus) return;
  if (dirty) {
    elements.planDirtyStatus.textContent = message || "Unsaved changes";
  } else {
    elements.planDirtyStatus.textContent = "";
  }
};

const collectOnboardingForm = () => {
  const formData = new FormData(elements.planForm);
  const onboarding = Object.fromEntries(formData.entries());
  onboarding.days = Number(onboarding.days);
  return onboarding;
};

const saveOnboardingDraft = () => {
  const onboarding = collectOnboardingForm();
  localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(onboarding));
};

const scheduleOnboardingDraft = () => {
  setPlanDirty(true);
  if (onboardingDraftTimeout) clearTimeout(onboardingDraftTimeout);
  onboardingDraftTimeout = setTimeout(() => {
    saveOnboardingDraft();
  }, 800);
};

const applyOnboardingData = (data, { markDirty = false } = {}) => {
  if (!data) return;
  Object.entries(data).forEach(([key, value]) => {
    const field = elements.planForm.elements.namedItem(key);
    if (field) {
      field.value = value;
    }
  });
  if (markDirty) {
    setPlanDirty(true, "Draft restored");
  }
};

const restoreOnboardingDraft = () => {
  if (state.profile?.onboarding) return;
  const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    applyOnboardingData(data, { markDirty: true });
    showToast("Restored onboarding draft", "success");
  } catch (err) {
    console.error(err);
  }
};

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
  if (!state.isAuthReady) {
    return false;
  }
  if (!getCurrentUser()) {
    window.location.hash = "#/auth";
    return false;
  }
  return true;
};

const requireAuthOrLogin = () => {
  if (!state.isAuthReady) {
    showToast("Checking login status...", "error");
    return false;
  }
  if (!window.netlifyIdentity) {
    showToast("Auth is unavailable", "error");
    return false;
  }
  if (!getCurrentUser()) {
    showToast("Please log in to continue", "error");
    window.netlifyIdentity.open("login");
    return false;
  }
  return true;
};

const updateUserChip = () => {
  const email = state.user?.email || state.identityUser?.email;
  if (email) {
    elements.userChip.textContent = email;
    elements.loginBtn.style.display = "none";
    elements.logoutBtn.style.display = "inline-flex";
  } else {
    elements.userChip.textContent = "Not signed in";
    elements.loginBtn.style.display = "inline-flex";
    elements.logoutBtn.style.display = "none";
  }
};

const loadWhoAmI = async () => {
  if (!getCurrentUser()) return;
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
  applyOnboardingData(profile.onboarding, { markDirty: false });
  setPlanDirty(false);
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
  await loadProgramRevisions().catch(console.error);
};

const loadProgramRevisions = async () => {
  if (!elements.programRevisions) return;
  const revisions = await apiFetch("/api/program-revisions");
  state.programRevisions = revisions || [];
  renderProgramRevisions();
};

const renderProgramRevisions = () => {
  if (!elements.programRevisions) return;
  elements.programRevisions.innerHTML = "";
  if (!state.programRevisions.length) {
    elements.programRevisions.innerHTML = "<p>No revisions yet.</p>";
    return;
  }
  state.programRevisions.forEach((revision, index) => {
    const card = document.createElement("div");
    card.className = "revision-card";
    const updatedAt = revision.updatedAt ? new Date(revision.updatedAt).toLocaleString() : "Unknown";
    card.innerHTML = `
      <div>
        <strong>${revision.status || "draft"}</strong>
        <div>${updatedAt}</div>
      </div>
    `;
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = "Restore";
    button.addEventListener("click", async () => {
      setButtonLoading(button, true, "Restoring...");
      try {
        const restored = await apiFetch("/api/program-save", {
          method: "POST",
          body: JSON.stringify({ program: revision }),
        });
        state.program = restored;
        renderProgram();
        await loadProgramRevisions().catch(console.error);
        showToast("Program restored", "success");
      } catch (err) {
        console.error(err);
        showToast("Failed to restore revision", "error");
      } finally {
        setButtonLoading(button, false);
      }
    });
    card.appendChild(button);
    elements.programRevisions.appendChild(card);
  });
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
      item.className = `calendar-item${workout.completed ? " completed" : ""}`;
      item.innerHTML = `
        <div>
          <strong>${date}</strong>
          <div>${workout.name || "Workout"}</div>
          ${workout.completed ? "<span class=\"badge\">Completed</span>" : ""}
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
  header.innerHTML = `
    <div class="workout-title">
      <div>
        <h3>${workout.name || "Workout"}</h3>
        <p>${date}</p>
      </div>
      <label class="toggle">
        <span>Completed</span>
        <input type="checkbox" id="workout-complete" ${workout.completed ? "checked" : ""} />
      </label>
    </div>
  `;
  elements.workoutDetail.appendChild(header);
  workout.exercises.forEach((exercise, idx) => {
    const container = document.createElement("div");
    container.className = "workout-exercise";
    container.innerHTML = `
      <div class="workout-header">
        <div>
          <strong>${exercise.name}</strong>
          <div>${exercise.sets} sets x ${exercise.reps} reps @ ${exercise.intensity}</div>
        </div>
        <div class="quick-fill">
          <button class="ghost" data-action="copy-last" data-exercise="${idx}">Copy last</button>
          <button class="ghost" data-action="fill-all" data-exercise="${idx}">Fill all</button>
        </div>
      </div>
    `;
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
  setButtonLoading(elements.saveWorkout, true, "Saving...");
  try {
    const workout = await apiFetch(`/api/workout-get?date=${date}`);
    const inputs = elements.workoutDetail.querySelectorAll("input[data-set]");
    const completedToggle = elements.workoutDetail.querySelector("#workout-complete");
    workout.completed = completedToggle?.checked || false;
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
    renderCalendar();
    renderWorkoutDetail(saved, date);
    showToast("Workout saved", "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to save workout", "error");
  } finally {
    setButtonLoading(elements.saveWorkout, false);
  }
};

const loadPrs = async () => {
  const prs = await apiFetch("/api/pr-list");
  state.prs = prs || [];
  renderPrHistory();
  renderPrSummary();
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

const renderPrSummary = () => {
  if (!elements.prSummary) return;
  elements.prSummary.innerHTML = "";
  if (!state.prs.length) {
    elements.prSummary.innerHTML = "<p>No PR insights yet.</p>";
    return;
  }
  const latest = [...state.prs].sort((a, b) => b.date.localeCompare(a.date))[0];
  const bestByLift = state.prs.reduce((acc, entry) => {
    if (!acc[entry.lift] || entry.estimated1Rm > acc[entry.lift].estimated1Rm) {
      acc[entry.lift] = entry;
    }
    return acc;
  }, {});
  const cards = [
    { label: "Total PRs", value: `${state.prs.length}` },
    { label: "Latest PR", value: `${latest.lift} ${latest.weight}x${latest.reps}` },
  ];
  Object.values(bestByLift).forEach((entry) => {
    cards.push({
      label: `Best ${entry.lift}`,
      value: `${entry.estimated1Rm} est 1RM`,
    });
  });
  cards.forEach((card) => {
    const item = document.createElement("div");
    item.className = "summary-card";
    item.innerHTML = `<span>${card.label}</span><strong>${card.value}</strong>`;
    elements.prSummary.appendChild(item);
  });
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
  await loadAdminAudit().catch(console.error);
};

const loadAdminAudit = async () => {
  if (!elements.adminAuditLog) return;
  const events = await apiFetch("/api/admin/audit-list");
  state.admin.audit = events || [];
  renderAdminAudit();
};

const renderAdminAudit = () => {
  if (!elements.adminAuditLog) return;
  elements.adminAuditLog.innerHTML = "";
  if (!state.admin.audit?.length) {
    elements.adminAuditLog.innerHTML = "<p>No audit events yet.</p>";
    return;
  }
  const list = document.createElement("ul");
  state.admin.audit.slice(0, 20).forEach((event) => {
    const item = document.createElement("li");
    const time = event.createdAt ? new Date(event.createdAt).toLocaleString() : "-";
    item.textContent = `${time} • ${event.email} • ${event.type}`;
    list.appendChild(item);
  });
  elements.adminAuditLog.appendChild(list);
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
      <textarea class="chat-output" rows="8" id="admin-program-json">${JSON.stringify(
        detail.program || {},
        null,
        2
      )}</textarea>
      <div class="button-row">
        <button class="secondary" id="save-admin-program">Save program</button>
      </div>
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
  const saveProgramBtn = document.getElementById("save-admin-program");
  const programField = document.getElementById("admin-program-json");
  const workoutsField = document.getElementById("admin-workouts-json");
  copyBtn.addEventListener("click", () => {
    promptText.select();
    document.execCommand("copy");
  });
  openBtn.addEventListener("click", () => {
    const url = `https://chat.openai.com/?prompt=${encodeURIComponent(prompt)}`;
    window.open(url, "_blank");
  });
  saveProgramBtn.addEventListener("click", async () => {
    setButtonLoading(saveProgramBtn, true, "Saving...");
    try {
      const program = JSON.parse(programField.value || "{}");
      await apiFetch("/api/admin/client-update", {
        method: "POST",
        body: JSON.stringify({ userId: detail.userId, program }),
      });
      showToast("Program updated", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to update program", "error");
    } finally {
      setButtonLoading(saveProgramBtn, false);
    }
  });
  saveWorkoutsBtn.addEventListener("click", async () => {
    setButtonLoading(saveWorkoutsBtn, true, "Saving...");
    try {
      const workouts = JSON.parse(workoutsField.value || "{}");
      await apiFetch("/api/admin/client-update", {
        method: "POST",
        body: JSON.stringify({ userId: detail.userId, workouts }),
      });
      showToast("Workouts updated", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to update workouts", "error");
    } finally {
      setButtonLoading(saveWorkoutsBtn, false);
    }
  });
};

const initIdentity = () => {
  if (!window.netlifyIdentity) {
    setAuthReady(true);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.netlifyIdentity.on("init", async (user) => {
      state.identityUser = user;
      setAuthReady(true);
      updateUserChip();
      if (user) {
        await loadWhoAmI().catch(console.error);
        if (state.user?.role === "admin") {
          window.location.hash = "#/admin";
        }
        loadProfile()
          .then((profile) => {
            populateOnboardingForm(profile);
            restoreOnboardingDraft();
          })
          .catch(console.error);
      }
      resolve();
    });
    window.netlifyIdentity.on("login", async (user) => {
      state.identityUser = user;
      updateUserChip();
      await loadWhoAmI().catch(console.error);
      window.location.hash = state.user?.role === "admin" ? "#/admin" : "#/app";
      loadProfile()
        .then((profile) => {
          populateOnboardingForm(profile);
          restoreOnboardingDraft();
        })
        .catch(console.error);
      apiFetch("/api/audit-log-event", {
        method: "POST",
        body: JSON.stringify({ type: "login", detail: "User logged in" }),
      }).catch(console.error);
    });
    window.netlifyIdentity.on("logout", () => {
      state.user = null;
      state.identityUser = null;
      updateUserChip();
      window.location.hash = "#/";
    });
    window.netlifyIdentity.init();
  });
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
  if (name === "app" && getCurrentUser()) {
    loadProgram().catch(console.error);
  }
  if (name === "workouts" && getCurrentUser()) {
    loadWorkouts().catch(console.error);
  }
  if (name === "prs" && getCurrentUser()) {
    loadPrs().catch(console.error);
  }
  if (name === "admin" && getCurrentUser()) {
    loadAdminClients().catch(console.error);
  }
};

const setupListeners = () => {
  addListener(elements.planForm, "submit", (event) => {
    event.preventDefault();
  });
  addListener(elements.planForm, "input", () => {
    scheduleOnboardingDraft();
  });
  addListener(elements.loginBtn, "click", () => {
    window.netlifyIdentity.open("login");
  });
  addListener(elements.logoutBtn, "click", () => {
    window.netlifyIdentity.logout();
  });
  addListener(elements.ctaSignup, "click", () => window.netlifyIdentity.open("signup"));
  addListener(elements.ctaLogin, "click", () => window.netlifyIdentity.open("login"));
  addListener(elements.generateProgram, "click", async () => {
    if (!requireAuthOrLogin()) return;
    setButtonLoading(elements.generateProgram, true, "Generating...");
    try {
      const onboarding = collectOnboardingForm();
      const program = await apiFetch("/api/program-generate", {
        method: "POST",
        body: JSON.stringify({ onboarding }),
      });
      state.program = program;
      renderProgram();
      await loadProgramRevisions().catch(console.error);
      setPlanDirty(false);
      localStorage.removeItem(ONBOARDING_DRAFT_KEY);
      showToast("Program generated", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to generate program", "error");
    } finally {
      setButtonLoading(elements.generateProgram, false);
    }
  });
  addListener(elements.saveOnboarding, "click", async () => {
    if (!requireAuthOrLogin()) return;
    setButtonLoading(elements.saveOnboarding, true, "Saving...");
    try {
      const onboarding = collectOnboardingForm();
      await saveProfile({ onboarding, units: onboarding.units || state.profile?.units || "lb" });
      setPlanDirty(false);
      localStorage.removeItem(ONBOARDING_DRAFT_KEY);
      showToast("Onboarding saved", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to save onboarding", "error");
    } finally {
      setButtonLoading(elements.saveOnboarding, false);
    }
  });
  addListener(elements.programImport, "click", async () => {
    if (!requireAuthOrLogin()) return;
    const file = elements.programImportFile.files?.[0];
    if (!file) {
      showToast("Select a file or photo first", "error");
      return;
    }
    elements.programImportStatus.textContent = "Importing...";
    setButtonLoading(elements.programImport, true, "Importing...");
    try {
      const reader = new FileReader();
      const fileContent = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read file"));
        if (file.type.startsWith("image/")) {
          reader.readAsDataURL(file);
        } else {
          reader.readAsText(file);
        }
      });
      const response = await apiFetch("/api/ai", {
        method: "POST",
        body: JSON.stringify({
          mode: "program_import",
          prompt: "Extract onboarding inputs from this file and return JSON only.",
          fileContent,
          fileName: file.name,
          fileType: file.type,
        }),
      });
      const cleaned = response.message.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      Object.entries(parsed).forEach(([key, value]) => {
        const field = elements.planForm.elements.namedItem(key);
        if (field) {
          field.value = value;
        }
      });
      elements.programImportStatus.textContent = "Imported.";
      scheduleOnboardingDraft();
      showToast("Imported program details", "success");
    } catch (err) {
      console.error(err);
      elements.programImportStatus.textContent = "Import failed.";
      showToast("Failed to import file", "error");
    } finally {
      setButtonLoading(elements.programImport, false);
    }
  });
  addListener(elements.refreshProgram, "click", () => {
    if (!requireAuthOrLogin()) return;
    loadProgram().catch(console.error);
  });
  addListener(elements.finalizeProgram, "click", async () => {
    if (!requireAuthOrLogin()) return;
    setButtonLoading(elements.finalizeProgram, true, "Finalizing...");
    try {
      await apiFetch("/api/program-finalize", { method: "POST" });
      await apiFetch("/api/audit-log-event", {
        method: "POST",
        body: JSON.stringify({ type: "program_finalized", detail: "Program finalized" }),
      });
      await loadProgramRevisions().catch(console.error);
      showToast("Program finalized", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to finalize program", "error");
    } finally {
      setButtonLoading(elements.finalizeProgram, false);
    }
  });
  addListener(elements.programChatSend, "click", async (event) => {
    event.preventDefault();
    const prompt = elements.programChatInput.value.trim();
    if (!requireAuthOrLogin()) return;
    if (!prompt) {
      showToast("Add a prompt first", "error");
      return;
    }
    if (!state.program) {
      showToast("Generate a program first", "error");
      return;
    }
    setButtonLoading(elements.programChatSend, true, "Sending...");
    try {
      const response = await apiFetch("/api/ai", {
        method: "POST",
        body: JSON.stringify({ mode: "program_refine", prompt, program: state.program }),
      });
      elements.programChatResponse.textContent = response.message;
      showToast("Refine request sent", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to send refine request", "error");
    } finally {
      setButtonLoading(elements.programChatSend, false);
    }
  });
  addListener(elements.programChatClear, "click", () => {
    elements.programChatInput.value = "";
    elements.programChatResponse.textContent = "";
  });
  addListener(elements.todayWorkout, "click", async () => {
    if (!requireAuthOrLogin()) return;
    const date = formatDate();
    await loadWorkout(date);
  });
  addListener(elements.saveWorkout, "click", () => {
    if (!requireAuthOrLogin()) return;
    saveWorkoutLog().catch(console.error);
  });
  addListener(elements.todayChatSend, "click", async (event) => {
    event.preventDefault();
    const prompt = elements.todayChatInput.value.trim();
    if (!requireAuthOrLogin()) return;
    if (!prompt) {
      showToast("Add a prompt first", "error");
      return;
    }
    const date = formatDate();
    setButtonLoading(elements.todayChatSend, true, "Sending...");
    try {
      const workout = await apiFetch(`/api/workout-get?date=${date}`);
      const response = await apiFetch("/api/ai", {
        method: "POST",
        body: JSON.stringify({ mode: "today_adjust", prompt, workout }),
      });
      elements.todayChatResponse.textContent = response.message;
      showToast("Adjust request sent", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to send adjust request", "error");
    } finally {
      setButtonLoading(elements.todayChatSend, false);
    }
  });
  addListener(elements.todayChatClear, "click", () => {
    elements.todayChatInput.value = "";
    elements.todayChatResponse.textContent = "";
  });
  addListener(elements.addPr, "click", async () => {
    if (!requireAuthOrLogin()) return;
    setButtonLoading(elements.addPr, true, "Saving...");
    try {
      const formData = new FormData(elements.prForm);
      const pr = Object.fromEntries(formData.entries());
      pr.weight = Number(pr.weight);
      pr.reps = Number(pr.reps);
      pr.rpe = pr.rpe ? Number(pr.rpe) : null;
      await apiFetch("/api/pr-add", { method: "POST", body: JSON.stringify(pr) });
      await loadPrs();
      showToast("PR saved", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to save PR", "error");
    } finally {
      setButtonLoading(elements.addPr, false);
    }
  });
  addListener(elements.unitsToggle, "change", async (event) => {
    if (!requireAuthOrLogin()) return;
    try {
      await saveProfile({ units: event.target.value });
      await loadPrs();
      showToast("Units updated", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to update units", "error");
    }
  });
  addListener(elements.workoutDetail, "click", (event) => {
    const action = event.target?.dataset?.action;
    if (!action) return;
    const exerciseIndex = Number(event.target.dataset.exercise);
    const inputs = [...elements.workoutDetail.querySelectorAll(`input[data-set="${exerciseIndex}"]`)];
    if (!inputs.length) return;
    const valuesBySet = inputs.reduce((acc, input) => {
      const index = Number(input.dataset.index);
      acc[index] = acc[index] || {};
      acc[index][input.dataset.field] = input.value;
      return acc;
    }, {});
    const sets = Object.values(valuesBySet);
    if (!sets.length) return;
    const source = action === "copy-last" ? sets.reverse().find((set) => set.weight || set.reps) : sets[0];
    if (!source) return;
    inputs.forEach((input) => {
      if (action === "copy-last" || action === "fill-all") {
        input.value = source[input.dataset.field] || input.value;
      }
    });
  });
  window.addEventListener("beforeunload", (event) => {
    if (!state.planDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("hashchange", handleRoute);
  elements.resetPassword = document.getElementById("reset-password");
  addListener(elements.resetPassword, "click", () => {
    window.netlifyIdentity.open("login");
  });
};

setAuthReady(false);
registerServiceWorker();
initIdentity().then(() => {
  setupListeners();
  handleRoute();
});
