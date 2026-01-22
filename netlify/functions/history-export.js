const { jsonResponse, requireAdmin } = require("./lib/auth");
const { withClient } = require("./lib/db");

const buildMemberMap = (members) => {
  const map = new Map();
  members.forEach((member) => {
    map.set(member.id, {
      memberId: member.id,
      name: member.name,
      active: member.active,
      email: member.email,
      phone: member.phone,
      state: {
        weeklyFocusSet: false,
        roleplayDone: false,
        firstMeetings: 0,
        signedRecruits: 0,
        notes: "",
        goals: "",
      },
      roleplays: [],
    });
  });
  return map;
};

exports.handler = async (event) => {
  const authError = requireAdmin(event);
  if (authError) return authError;

  const teamId = event.queryStringParameters?.teamId;
  const allTeams = event.queryStringParameters?.allTeams === "1";

  if (!teamId && !allTeams) {
    return jsonResponse(400, {
      ok: false,
      error: "teamId or allTeams=1 is required",
    });
  }

  try {
    const payload = await withClient(async (client) => {
      const weekQuery = allTeams
        ? "SELECT id, team_id, iso_week FROM weeks ORDER BY team_id ASC, iso_week ASC"
        : "SELECT id, team_id, iso_week FROM weeks WHERE team_id = $1 ORDER BY iso_week ASC";

      const weekResult = await client.query(
        weekQuery,
        allTeams ? [] : [teamId]
      );

      const history = [];

      for (const week of weekResult.rows) {
        const membersResult = await client.query(
          `SELECT id, name, active, email, phone
           FROM members
           WHERE team_id = $1
           ORDER BY created_at ASC`,
          [week.team_id]
        );

        const memberMap = buildMemberMap(membersResult.rows);

        const stateResult = await client.query(
          `SELECT member_id, weekly_focus_set, roleplay_done, first_meetings, signed_recruits, notes, goals
           FROM member_week_state
           WHERE week_id = $1`,
          [week.id]
        );

        stateResult.rows.forEach((row) => {
          const entry = memberMap.get(row.member_id);
          if (!entry) return;
          entry.state = {
            weeklyFocusSet: row.weekly_focus_set,
            roleplayDone: row.roleplay_done,
            firstMeetings: row.first_meetings,
            signedRecruits: row.signed_recruits,
            notes: row.notes || "",
            goals: row.goals || "",
          };
        });

        const taskResult = await client.query(
          `SELECT id, label
           FROM weekly_tasks
           WHERE week_id = $1
           ORDER BY created_at ASC`,
          [week.id]
        );

        const attendanceResult = await client.query(
          `SELECT task_id, member_id, attended
           FROM task_attendance
           WHERE task_id IN (SELECT id FROM weekly_tasks WHERE week_id = $1)`,
          [week.id]
        );

        const taskAttendance = {};
        attendanceResult.rows.forEach((row) => {
          if (!taskAttendance[row.task_id]) {
            taskAttendance[row.task_id] = {};
          }
          taskAttendance[row.task_id][row.member_id] = row.attended;
        });

        const roleplayResult = await client.query(
          `SELECT id, member_id, type, note, timestamp
           FROM roleplays
           WHERE week_id = $1
           ORDER BY timestamp ASC`,
          [week.id]
        );

        roleplayResult.rows.forEach((row) => {
          const entry = memberMap.get(row.member_id);
          if (!entry) return;
          entry.roleplays.push({
            id: row.id,
            type: row.type,
            note: row.note,
            timestamp: row.timestamp,
          });
        });

        history.push({
          teamId: week.team_id,
          isoWeek: week.iso_week,
          weekTasks: taskResult.rows.map((row) => ({
            id: row.id,
            label: row.label,
            attendance: taskAttendance[row.id] || {},
          })),
          members: Array.from(memberMap.values()),
        });
      }

      return history;
    });

    return jsonResponse(200, payload);
  } catch (error) {
    return jsonResponse(500, { ok: false, error: error.message });
  }
};
