(function () {
  function $(id) { return document.getElementById(id); }

  const DEVICE_KEY = "caloriTrackerDeviceIdV1";
  function genId() {
    return "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 14);
  }
  function getOrCreateDeviceId() {
    try {
      const existing = localStorage.getItem(DEVICE_KEY);
      if (existing) return existing;
      const id = genId();
      localStorage.setItem(DEVICE_KEY, id);
      return id;
    } catch {
      return genId();
    }
  }

  async function authHeaders() {
    const headers = { "Content-Type": "application/json" };

    // IMPORTANT: this app supports anonymous device auth. Many functions expect X-Device-Id.
    headers["X-Device-Id"] = getOrCreateDeviceId();

    try {
      // If user is signed in with Netlify Identity, include bearer token too.
      if (window.netlifyIdentity && typeof window.netlifyIdentity.currentUser === "function") {
        const u = window.netlifyIdentity.currentUser();
        const token = u && u.token ? (u.token.access_token || u.token.id_token) : null;
        if (token) headers.Authorization = "Bearer " + token;
      }
    } catch {}
    return headers;
  }

  function getWorkoutInputs() {
    const goal = $("wkGoalInput") ? $("wkGoalInput").value : null;
    const experience = $("wkExperienceInput") ? $("wkExperienceInput").value : null;
    const daysPerWeek = $("wkDaysInput") ? Number($("wkDaysInput").value) : null;
    const equipment = $("wkEquipmentInput") ? $("wkEquipmentInput").value : null;
    return { goal, experience, days_per_week: daysPerWeek, equipment };
  }

  function ensureCardInjected() {
    const scr = $("onboardingSuggestScreen");
    if (!scr) return;

    // app.bundle.js may rewrite onboardingSuggestScreen innerHTML; re-inject if missing.
    if ($("aiTrainingPlanCard")) return;

    const card = document.createElement("div");
    card.className = "computed";
    card.id = "aiTrainingPlanCard";
    card.style.marginTop = "12px";
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <div><strong>4-week training program:</strong></div>
        <button id="aiTrainingCopyBtn" type="button" class="linkMiniBtn" style="padding:0 6px;">Copy</button>
      </div>
      <div class="muted" id="aiTrainingLoading" style="display:none;margin-top:8px;">Generating your 4-week program…</div>
      <div class="muted" id="aiTrainingError" style="color:#b00020;margin-top:8px;"></div>
      <pre id="aiTrainingPlanText" style="white-space:pre-wrap;margin-top:8px;max-height:280px;overflow:auto;">—</pre>
    `;

    // Put it at the very top of Step 3, above nutrition results.
    scr.insertBefore(card, scr.firstChild);

    wireCopy(); // re-bind
  }

  function showTrainingLoading(on) {
    const el = $("aiTrainingLoading");
    if (!el) return;
    el.style.display = on ? "block" : "none";
  }

  async function generateTrainingPlan() {
    ensureCardInjected();

    const out = $("aiTrainingPlanText");
    const err = $("aiTrainingError");
    if (!out || !err) return;

    err.textContent = "";
    showTrainingLoading(true);
    out.textContent = "—";

    try {
      const payload = getWorkoutInputs();
      const r = await fetch("/api/ai-training-plan-generate", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(payload)
      });

      const txt = await r.text();
      let body = null;
      try { body = txt ? JSON.parse(txt) : null; } catch { body = { raw: txt }; }
      if (!r.ok) throw new Error(body && (body.error || body.message) ? (body.error || body.message) : ("Request failed: " + r.status));

      out.textContent = (body && (body.plan_text || body.text)) ? (body.plan_text || body.text) : "No plan returned.";
    } catch (e) {
      err.textContent = e && e.message ? e.message : String(e);
      out.textContent = "—";
    } finally {
      showTrainingLoading(false);
    }
  }

  
  async function loadExistingTrainingPlan() {
    ensureCardInjected();
    const out = $("aiTrainingPlanText");
    const err = $("aiTrainingError");
    if (!out || !err) return;

    try {
      const r = await fetch("/api/training-program-get", {
        method: "GET",
        headers: await authHeaders()
      });
      const txt = await r.text();
      let body = null;
      try { body = txt ? JSON.parse(txt) : null; } catch { body = null; }
      if (!r.ok) return;

      if (body && body.has_program && body.program_text) {
        out.textContent = body.program_text;
      }
    } catch {}
  }

function wireCopy() {
    const btn = $("aiTrainingCopyBtn");
    const out = $("aiTrainingPlanText");
    if (!btn || !out) return;

    // Avoid double-binding if card gets re-injected
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(out.textContent || "");
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy"), 900);
      } catch {
        btn.textContent = "Copy failed";
        setTimeout(() => (btn.textContent = "Copy"), 900);
      }
    });
  }

  function wireGenerateHook() {
    const getPlanBtn = $("aiGetPlanBtn");
    if (!getPlanBtn) return;

    // Run AFTER existing handler (which generates nutrition). We wait for Step 3 to show.
    getPlanBtn.addEventListener("click", () => {
      // Try a couple times because the app may flip screens async.
      let tries = 0;
      const tick = () => {
        tries++;
        const scr = $("onboardingSuggestScreen");
        if (scr && !scr.classList.contains("hidden")) {
          loadExistingTrainingPlan();
          // If no saved program yet, generate a fresh one.
          const out = $("aiTrainingPlanText");
          if (out && (out.textContent === "—" || !out.textContent || out.textContent.trim() === "—")) {
            generateTrainingPlan();
          }
          return;
        }
        if (tries < 10) setTimeout(tick, 120);
      };
      setTimeout(tick, 60);
    }, false);
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireCopy();
    wireGenerateHook();
    // Preload saved program (won't show until Step 3 is injected/visible).
    loadExistingTrainingPlan();
  });
})();
