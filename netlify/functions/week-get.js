const { jsonResponse, requireAdmin } = require("./lib/auth");
const { withClient } = require("./lib/db");

const buildDefaultState = () => ({
  weeklyFocusSet: false,
  roleplayDone: false,
  firstMeetings: 0,
  signedRecruits: 0,
  notes: "",
  goals: "",
});

exports.handler = async (event) => {
  const authError = requireAdmin(event);
  if (authError) return authError;

  const teamId = event.queryStringParameters?.teamId;
  const isoWeek = event.queryStringParameters?.isoWeek;

  if (!teamId || !isoWeek) {
    return jsonResponse(400, {
      ok: false,
      error: "teamId and isoWeek are required",
    });
  }

  try {
    const payload = await withClient(async (client) => {
      // Ensure the week exists but DO NOT mutate updated_at on read.
      const insertResult = await client.query(
        `INSERT INTO weeks (team_id, iso_week)
         VALUES ($1, $2)
         ON CONFLICT (team_id, iso_week)
         DO NOTHING`,
        [teamId, isoWeek]
      );

      const weekRowResult = await client.query(
        `SELECT id, updated_at
         FROM weeks
         WHERE team_id = $1 AND iso_week = $2
         LIMIT 1`,
        [teamId, isoWeek]
      );

      const weekId = weekRowResult.rows[0].id;
      const weekUpdatedAt = weekRowResult.rows[0].updated_at;

      const membersResult = await client.query(
        `SELECT id, name, active, email, phone
         FROM members
         WHERE team_id = $1
         ORDER BY created_at ASC`,
        [teamId]
      );

      const stateResult = await client.query(
        `SELECT member_id, weekly_focus_set, roleplay_done, first_meetings, signed_recruits, notes, goals, updated_at
         FROM member_week_state
         WHERE week_id = $1`,
        [weekId]
      );

      const taskResult = await client.query(
        `SELECT id, label, category, notes, created_at, updated_at
         FROM weekly_tasks
         WHERE week_id = $1
         ORDER BY created_at ASC`,
        [weekId]
      );

      const attendanceResult = await client.query(
        `SELECT task_id, member_id, attended, updated_at
         FROM task_attendance
         WHERE task_id IN (SELECT id FROM weekly_tasks WHERE week_id = $1)`,
        [weekId]
      );

      const roleplayResult = await client.query(
        `SELECT id, member_id, type, note, timestamp, created_at
         FROM roleplays
         WHERE week_id = $1
         ORDER BY timestamp ASC`,
        [weekId]
      );

      const states = {};
      stateResult.rows.forEach((row) => {
        states[row.member_id] = {
          weeklyFocusSet: row.weekly_focus_set,
          roleplayDone: row.roleplay_done,
          firstMeetings: row.first_meetings,
          signedRecruits: row.signed_recruits,
          notes: row.notes || "",
          goals: row.goals || "",
          updatedAt: row.updated_at,
        };
      });

      const attendance = {};
      attendanceResult.rows.forEach((row) => {
        const taskId = row.task_id;
        if (!attendance[taskId]) attendance[taskId] = {};
        attendance[taskId][row.member_id] = {
          attended: row.attended,
          updatedAt: row.updated_at,
        };
      });

      const roleplaysByMember = {};
      roleplayResult.rows.forEach((row) => {
        if (!roleplaysByMember[row.member_id]) roleplaysByMember[row.member_id] = [];
        roleplaysByMember[row.member_id].push({
          id: row.id,
          type: row.type,
          note: row.note || "",
          timestamp: row.timestamp,
          createdAt: row.created_at,
        });
      });

      const members = membersResult.rows.map((member) => ({
        ...member,
        state: states[member.id] ? { ...states[member.id] } : buildDefaultState(),
        roleplays: roleplaysByMember[member.id] || [],
      }));

      return {
        ok: true,
        teamId,
        isoWeek,
        weekUpdatedAt,
        members,
        weekTasks: taskResult.rows,
        taskAttendance: attendance,
      };
    });

    return jsonResponse(200, payload);
  } catch (error) {
    return jsonResponse(500, { ok: false, error: error.message });
  }
};
