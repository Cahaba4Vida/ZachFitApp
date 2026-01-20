const buildStrengthProgram = (inputs, trainingMaxes) => {
  const days = [
    {
      name: "Day 1",
      theme: "Heavy Squat + Bench",
      exercises: [
        { name: "Back Squat", sets: 4, reps: "3-5", intensity: `75-85% TM (${trainingMaxes.squat})` },
        { name: "Bench Press", sets: 4, reps: "3-5", intensity: `75-85% TM (${trainingMaxes.bench})` },
        { name: "Romanian Deadlift", sets: 3, reps: "6-8", intensity: "RPE 7" },
        { name: "Chest Supported Row", sets: 3, reps: "8-10", intensity: "RPE 7" },
      ],
    },
    {
      name: "Day 2",
      theme: "Deadlift + Bench Volume",
      exercises: [
        { name: "Deadlift", sets: 4, reps: "3-5", intensity: `75-85% TM (${trainingMaxes.deadlift})` },
        { name: "Bench Press (Volume)", sets: 4, reps: "6-8", intensity: "70-75% TM" },
        { name: "Split Squat", sets: 3, reps: "8-10", intensity: "RPE 7" },
        { name: "Lat Pulldown", sets: 3, reps: "10-12", intensity: "RPE 7" },
      ],
    },
    {
      name: "Day 3",
      theme: "Squat Volume + Press",
      exercises: [
        { name: "Front Squat", sets: 4, reps: "6-8", intensity: "70-75% TM" },
        { name: "Overhead Press", sets: 4, reps: "5-7", intensity: "RPE 7" },
        { name: "Pause Bench", sets: 3, reps: "6-8", intensity: "70% TM" },
        { name: "Hamstring Curl", sets: 3, reps: "10-12", intensity: "RPE 8" },
      ],
    },
    {
      name: "Day 4",
      theme: "Deadlift Technique + Bench",
      exercises: [
        { name: "Deadlift (Technique)", sets: 3, reps: "5", intensity: "65-70% TM" },
        { name: "Bench Press (Heavy)", sets: 3, reps: "3", intensity: `80-85% TM (${trainingMaxes.bench})` },
        { name: "Leg Press", sets: 3, reps: "10", intensity: "RPE 7" },
        { name: "Face Pull", sets: 3, reps: "12-15", intensity: "RPE 7" },
      ],
    },
  ];
  return buildWeeks(days, "Strength progression with bench/squat/deadlift twice weekly.");
};

const buildPplProgram = (inputs, trainingMaxes) => {
  const days = [
    {
      name: "Day 1",
      theme: "Push (Bench focus)",
      exercises: [
        { name: "Bench Press", sets: 4, reps: "6-8", intensity: `70-75% TM (${trainingMaxes.bench})` },
        { name: "Incline DB Press", sets: 3, reps: "8-10", intensity: "RPE 8" },
        { name: "Overhead Press", sets: 3, reps: "6-8", intensity: "RPE 7" },
        { name: "Tricep Pushdown", sets: 3, reps: "12-15", intensity: "RPE 8" },
      ],
    },
    {
      name: "Day 2",
      theme: "Pull (Back focus)",
      exercises: [
        { name: "Weighted Pull-up", sets: 4, reps: "6-8", intensity: "RPE 8" },
        { name: "Barbell Row", sets: 4, reps: "8", intensity: "RPE 8" },
        { name: "Lat Pulldown", sets: 3, reps: "10-12", intensity: "RPE 8" },
        { name: "Hammer Curl", sets: 3, reps: "10-12", intensity: "RPE 8" },
      ],
    },
    {
      name: "Day 3",
      theme: "Legs (Squat + leg press)",
      exercises: [
        { name: "Back Squat", sets: 4, reps: "6-8", intensity: `70-75% TM (${trainingMaxes.squat})` },
        { name: "Leg Press", sets: 4, reps: "10", intensity: "RPE 8" },
        { name: "Romanian Deadlift", sets: 3, reps: "8-10", intensity: "RPE 7" },
        { name: "Calf Raise", sets: 3, reps: "12-15", intensity: "RPE 8" },
      ],
    },
    {
      name: "Day 4",
      theme: "Push/Pull Accessories",
      exercises: [
        { name: "Close-Grip Bench", sets: 3, reps: "8-10", intensity: "RPE 8" },
        { name: "Seated Row", sets: 3, reps: "10-12", intensity: "RPE 8" },
        { name: "Lateral Raise", sets: 3, reps: "12-15", intensity: "RPE 8" },
        { name: "Leg Curl", sets: 3, reps: "12-15", intensity: "RPE 8" },
      ],
    },
  ];
  return buildWeeks(days, "PPL-inspired hypertrophy split with emphasis on bench, squat, leg press.");
};

const buildGeneralProgram = (inputs, trainingMaxes) => {
  const days = [
    {
      name: "Day 1",
      theme: "Upper Strength",
      exercises: [
        { name: "Bench Press", sets: 4, reps: "5", intensity: `70-75% TM (${trainingMaxes.bench})` },
        { name: "Pull-up", sets: 3, reps: "6-8", intensity: "RPE 7" },
        { name: "Dumbbell Row", sets: 3, reps: "8-10", intensity: "RPE 7" },
        { name: "Shoulder Press", sets: 3, reps: "8", intensity: "RPE 7" },
      ],
    },
    {
      name: "Day 2",
      theme: "Lower Strength",
      exercises: [
        { name: "Back Squat", sets: 4, reps: "5", intensity: `70-75% TM (${trainingMaxes.squat})` },
        { name: "Leg Press", sets: 3, reps: "10", intensity: "RPE 7" },
        { name: "Deadlift", sets: 3, reps: "5", intensity: `70% TM (${trainingMaxes.deadlift})` },
        { name: "Hamstring Curl", sets: 3, reps: "10-12", intensity: "RPE 7" },
      ],
    },
    {
      name: "Day 3",
      theme: "Upper Hypertrophy",
      exercises: [
        { name: "Incline Bench", sets: 3, reps: "8-10", intensity: "RPE 8" },
        { name: "Lat Pulldown", sets: 3, reps: "10-12", intensity: "RPE 8" },
        { name: "Lateral Raise", sets: 3, reps: "12-15", intensity: "RPE 8" },
        { name: "Tricep Extension", sets: 3, reps: "12-15", intensity: "RPE 8" },
      ],
    },
    {
      name: "Day 4",
      theme: "Lower Hypertrophy",
      exercises: [
        { name: "Front Squat", sets: 3, reps: "8", intensity: "RPE 8" },
        { name: "Romanian Deadlift", sets: 3, reps: "8-10", intensity: "RPE 8" },
        { name: "Walking Lunge", sets: 3, reps: "10", intensity: "RPE 8" },
        { name: "Calf Raise", sets: 3, reps: "12-15", intensity: "RPE 8" },
      ],
    },
  ];
  return buildWeeks(days, "Upper/lower split tailored to general performance.");
};

const buildWeeks = (days, focus) => {
  return [1, 2, 3, 4].map((week) => ({
    title: `Week ${week}`,
    focus: week === 4 ? "Deload and re-test" : focus,
    days,
  }));
};

const estimateTrainingMaxes = (inputs) => {
  const parse = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const bench = parse(inputs.benchPr, 185);
  const squat = parse(inputs.squatPr, 225);
  const deadlift = parse(inputs.deadliftPr, 275);
  return {
    bench: Math.round(bench * 0.9),
    squat: Math.round(squat * 0.9),
    deadlift: Math.round(deadlift * 0.9),
  };
};

const generateProgram = (inputs) => {
  const trainingMaxes = estimateTrainingMaxes(inputs);
  if (inputs.goal === "powerlifting") {
    return buildStrengthProgram(inputs, trainingMaxes);
  }
  if (inputs.goal === "bodybuilding") {
    return buildPplProgram(inputs, trainingMaxes);
  }
  return buildGeneralProgram(inputs, trainingMaxes);
};

module.exports = { generateProgram };
