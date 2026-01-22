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

exports.handler = async (event) => {
  const authError = requireAdmin(event);
  if (authError) return authError;

  if (event.httpMethod !== "PATCH") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  const teamId = event.queryStringParameters?.teamId;
  const isoWeek = event.queryStringParameters?.isoWeek;
  if (!teamId || !isoWeek) {
    return jsonResponse(400, {
      ok: false,
      error: "teamId and isoWeek are required",
    });
  }

  const body = parseJsonBody(event) || {};
  const memberId = body.memberId;
  if (!memberId) {
    return jsonResponse(400, { ok: false, error: "memberId is required" });
  }

  const actor = getHeader(event.headers, "x-actor") || "Unknown";
  const state = normalizeState(body.state);
  const weekTasks = Array.isArray(body.weekTasks) ? body.weekTasks : null;
  const taskAttendance =
    body.taskAttendance && typeof body.taskAttendance === "object"
      ? body.taskAttendance
      : null;
  const roleplays = Array.isArray(body.roleplays) ? body.roleplays : null;

  try {
    const result = await withTransaction(async (client) => {
      const weekResult = await client.query(
        `INSERT INTO weeks (team_id, iso_week)
         VALUES ($1, $2)
         ON CONFLICT (team_id, iso_week)
         DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [teamId, isoWeek]
      );
      const weekId = weekResult.rows[0].id;

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
          memberId,
          state.weeklyFocusSet,
          state.roleplayDone,
          state.firstMeetings,
          state.signedRecruits,
          state.notes,
          state.goals,
        ]
      );

      if (weekTasks) {
        const taskIds = weekTasks.map((task) => task.id).filter(Boolean);
        if (taskIds.length > 0) {
          await client.query(
            `DELETE FROM weekly_tasks
             WHERE week_id = $1 AND id <> ALL($2::uuid[])`,
            [weekId, taskIds]
          );
        } else {
          await client.query(
            "DELETE FROM weekly_tasks WHERE week_id = $1",
            [weekId]
          );
        }

        for (const task of weekTasks) {
          if (!task.id || !task.label?.trim()) continue;
          await client.query(
            `INSERT INTO weekly_tasks (id, week_id, label, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (id)
             DO UPDATE SET label = EXCLUDED.label, updated_at = NOW()`,
            [task.id, weekId, task.label.trim()]
          );
        }

        if (taskAttendance) {
          for (const task of weekTasks) {
            if (!task.id) continue;
            const attendanceMap = taskAttendance[task.id] || {};
            await client.query(
              "DELETE FROM task_attendance WHERE task_id = $1",
              [task.id]
            );
            for (const [attendanceMemberId, attended] of Object.entries(
              attendanceMap
            )) {
              if (!attendanceMemberId) continue;
              await client.query(
                `INSERT INTO task_attendance (task_id, member_id, attended, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (task_id, member_id)
                 DO UPDATE SET attended = EXCLUDED.attended, updated_at = NOW()`,
                [task.id, attendanceMemberId, Boolean(attended)]
              );
            }
          }
        }
      }

      if (roleplays) {
        const roleplayIds = roleplays.map((entry) => entry.id).filter(Boolean);
        if (roleplayIds.length > 0) {
          await client.query(
            `DELETE FROM roleplays
             WHERE week_id = $1 AND member_id = $2 AND id <> ALL($3::uuid[])`,
            [weekId, memberId, roleplayIds]
          );
        } else {
          await client.query(
            "DELETE FROM roleplays WHERE week_id = $1 AND member_id = $2",
            [weekId, memberId]
          );
        }

        for (const entry of roleplays) {
          if (!entry.id || !entry.type?.trim()) continue;
          await client.query(
            `INSERT INTO roleplays (id, week_id, member_id, type, note, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id)
             DO UPDATE SET type = EXCLUDED.type, note = EXCLUDED.note, timestamp = EXCLUDED.timestamp`,
            [
              entry.id,
              weekId,
              memberId,
              entry.type.trim(),
              entry.note?.trim() || null,
              entry.timestamp ? new Date(entry.timestamp) : new Date(),
            ]
          );
        }
      }

      await client.query("UPDATE weeks SET updated_at = NOW() WHERE id = $1", [
        weekId,
      ]);

      await client.query(
        `INSERT INTO audit_events (team_id, iso_week, actor, action, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          teamId,
          isoWeek,
          actor,
          "week_patch",
          {
            memberId,
            state,
            weekTasksCount: weekTasks ? weekTasks.length : null,
            taskAttendanceEntries: taskAttendance
              ? Object.keys(taskAttendance).length
              : null,
            roleplaysCount: roleplays ? roleplays.length : null,
          },
        ]
      );

      return { ok: true };
    });

    return jsonResponse(200, result);
  } catch (error) {
    return jsonResponse(500, { ok: false, error: error.message });
  }
};
