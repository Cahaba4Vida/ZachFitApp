const { jsonResponse, requireAdmin, getHeader } = require("./lib/auth");
const { parseJsonBody } = require("./lib/request");
const { withTransaction } = require("./lib/db");

const normalizeState = (state = {}) => ({
  weeklyFocusSet: Boolean(state.weeklyFocusSet),
  roleplayDone: Boolean(state.roleplayDone),
  firstMeetings: Number.isFinite(state.firstMeetings)
    ? state.firstMeetings
    : Number(state.firstMeetings) || 0,
  signedRecruits: Number.isFinite(state.signedRecruits)
    ? state.signedRecruits
    : Number(state.signedRecruits) || 0,
  notes: state.notes ? String(state.notes) : "",
  goals: state.goals ? String(state.goals) : "",
});

const normalizeTask = (task = {}) => ({
  id: task.id || null,
  label: task.label ? String(task.label).trim() : "",
  category: task.category ? String(task.category).trim() : "",
  notes: task.notes ? String(task.notes) : "",
});

const normalizeRoleplay = (rp = {}) => ({
  id: rp.id || null,
  memberId: rp.memberId || rp.member_id || null,
  type: rp.type ? String(rp.type).trim() : "",
  note: rp.note ? String(rp.note) : "",
  timestamp: rp.timestamp || null,
});

exports.handler = async (event) => {
  const authError = requireAdmin(event);
  if (authError) return authError;

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  const teamId = event.queryStringParameters?.teamId;
  const isoWeek = event.queryStringParameters?.isoWeek;
  if (!teamId || !isoWeek) {
    return jsonResponse(400, { ok: false, error: "teamId and isoWeek are required" });
  }

  const body = parseJsonBody(event) || {};
  const expectedWeekUpdatedAt = body.expectedWeekUpdatedAt || null;

  const actor = getHeader(event.headers, "x-actor") || "Unknown";
  const members = Array.isArray(body.members) ? body.members : [];
  const weekTasks = Array.isArray(body.weekTasks) ? body.weekTasks : [];
  const taskAttendance =
    body.taskAttendance && typeof body.taskAttendance === "object" ? body.taskAttendance : {};
  const roleplays = Array.isArray(body.roleplays) ? body.roleplays : [];

  try {
    const result = await withTransaction(async (client) => {
      // Ensure week exists
      await client.query(
        `INSERT INTO weeks (team_id, iso_week)
         VALUES ($1, $2)
         ON CONFLICT (team_id, iso_week) DO NOTHING`,
        [teamId, isoWeek]
      );

      // Read current updated_at for conflict detection
      const currentWeek = await client.query(
        `SELECT id, updated_at FROM weeks WHERE team_id = $1 AND iso_week = $2 LIMIT 1`,
        [teamId, isoWeek]
      );
      const weekId = currentWeek.rows[0].id;
      const currentUpdatedAt = currentWeek.rows[0].updated_at;

      if (expectedWeekUpdatedAt && String(expectedWeekUpdatedAt) !== String(currentUpdatedAt)) {
        return {
          conflict: true,
          weekId,
          currentUpdatedAt,
        };
      }

      // Update week updated_at to reflect save
      await client.query(`UPDATE weeks SET updated_at = NOW() WHERE id = $1`, [weekId]);

      // Upsert member week state
      for (const member of members) {
        if (!member || !member.memberId) continue;
        const s = normalizeState(member.state);
        await client.query(
          `INSERT INTO member_week_state
            (week_id, member_id, weekly_focus_set, roleplay_done, first_meetings, signed_recruits, notes, goals, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (week_id, member_id)
           DO UPDATE SET
             weekly_focus_set = EXCLUDED.weekly_focus_set,
             roleplay_done = EXCLUDED.roleplay_done,
             first_meetings = EXCLUDED.first_meetings,
             signed_recruits = EXCLUDED.signed_recruits,
             notes = EXCLUDED.notes,
             goals = EXCLUDED.goals,
             updated_at = NOW()`,
          [
            weekId,
            member.memberId,
            s.weeklyFocusSet,
            s.roleplayDone,
            s.firstMeetings,
            s.signedRecruits,
            s.notes,
            s.goals,
          ]
        );
      }

      // Sync weekly tasks (create/update/delete)
      const normalizedTasks = weekTasks.map(normalizeTask).filter((t) => t.label);
      const keptIds = normalizedTasks.map((t) => t.id).filter(Boolean);

      if (keptIds.length > 0) {
        await client.query(
          `DELETE FROM weekly_tasks WHERE week_id = $1 AND id <> ALL($2::uuid[])`,
          [weekId, keptIds]
        );
      } else {
        await client.query(`DELETE FROM weekly_tasks WHERE week_id = $1`, [weekId]);
      }

      const taskIdMap = {}; // tempKey->id not used, but return created tasks
      const resultingTasks = [];
      for (const t of normalizedTasks) {
        if (t.id) {
          const updated = await client.query(
            `UPDATE weekly_tasks SET label = $1, category = $2, notes = $3, updated_at = NOW()
             WHERE id = $4 AND week_id = $5
             RETURNING id, label, category, notes, created_at, updated_at`,
            [t.label, t.category, t.notes, t.id, weekId]
          );
          if (updated.rows[0]) resultingTasks.push(updated.rows[0]);
        } else {
          const created = await client.query(
            `INSERT INTO weekly_tasks (week_id, label, category, notes)
             VALUES ($1, $2, $3, $4)
             RETURNING id, label, category, notes, created_at, updated_at`,
            [weekId, t.label, t.category, t.notes]
          );
          resultingTasks.push(created.rows[0]);
        }
      }

      // Task attendance upsert
      // Expect taskAttendance: { [taskId]: { [memberId]: { attended: boolean } } }
      for (const [taskId, memberMap] of Object.entries(taskAttendance || {})) {
        if (!taskId || !memberMap || typeof memberMap !== "object") continue;
        for (const [memberId, entry] of Object.entries(memberMap)) {
          const attended = Boolean(entry?.attended);
          await client.query(
            `INSERT INTO task_attendance (task_id, member_id, attended, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (task_id, member_id)
             DO UPDATE SET attended = EXCLUDED.attended, updated_at = NOW()`,
            [taskId, memberId, attended]
          );
        }
      }

      // Replace roleplays for week (simple approach)
      // Delete existing then insert provided
      await client.query(`DELETE FROM roleplays WHERE week_id = $1`, [weekId]);
      const normalizedRoleplays = roleplays.map(normalizeRoleplay).filter((rp) => rp.memberId && rp.type);
      for (const rp of normalizedRoleplays) {
        await client.query(
          `INSERT INTO roleplays (week_id, member_id, type, note, timestamp)
           VALUES ($1, $2, $3, $4, $5)`,
          [weekId, rp.memberId, rp.type, rp.note, rp.timestamp]
        );
      }

      // Audit event
      await client.query(
        `INSERT INTO audit_events (team_id, iso_week, actor, action, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [teamId, isoWeek, actor, "week_save", JSON.stringify({ members: members.length, tasks: normalizedTasks.length, roleplays: normalizedRoleplays.length })]
      );

      const afterWeek = await client.query(`SELECT updated_at FROM weeks WHERE id = $1`, [weekId]);
      return { conflict: false, weekUpdatedAt: afterWeek.rows[0].updated_at, weekTasks: resultingTasks };
    });

    if (result.conflict) {
      return jsonResponse(409, {
        ok: false,
        error: "Week was updated by someone else. Reload and try again.",
        currentWeekUpdatedAt: result.currentUpdatedAt,
      });
    }

    return jsonResponse(200, { ok: true, weekUpdatedAt: result.weekUpdatedAt, weekTasks: result.weekTasks });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: error.message });
  }
};
