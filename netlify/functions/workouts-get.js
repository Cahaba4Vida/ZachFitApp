const { requireAuth } = require("./_lib/auth");
const { getUserStore } = require("./_lib/store");
const { json } = require("./_lib/response");

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatDate = (date) => date.toISOString().split("T")[0];

const buildWorkoutsFromProgram = (program) => {
  if (!program?.weeks?.length) return {};
  const start = new Date();
  const workouts = {};
  let dayIndex = 0;
  program.weeks.forEach((week) => {
    week.days.forEach((day) => {
      const date = formatDate(addDays(start, dayIndex));
      workouts[date] = { ...day, name: day.theme, date };
      dayIndex += 1;
    });
  });
  return workouts;
};

exports.handler = async (event) => {
  const { user, error } = requireAuth(event);
  if (error) return error;
  const store = getUserStore(user.userId);
  let workouts = (await store.get("workouts")) || {};
  if (Object.keys(workouts).length === 0) {
    const program = await store.get("program");
    if (program) {
      workouts = buildWorkoutsFromProgram(program);
      await store.set("workouts", workouts);
    }
  }
  return json(200, workouts);
};
