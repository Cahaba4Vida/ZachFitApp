const Ajv = require("ajv");

const ajv = new Ajv({ allErrors: true, useDefaults: true });

const onboardingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["goal", "days", "experience", "equipment"],
  properties: {
    goal: { type: "string", enum: ["bodybuilding", "powerlifting", "general"] },
    days: { type: "number", minimum: 1, maximum: 7 },
    experience: { type: "string" },
    equipment: { type: "string" },
    constraints: { type: "string", nullable: true },
    benchPr: { type: ["number", "string", "null"] },
    squatPr: { type: ["number", "string", "null"] },
    deadliftPr: { type: ["number", "string", "null"] },
    units: { type: "string", enum: ["lb", "kg"], default: "lb" },
  },
};

const userProfileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["units"],
  properties: {
    units: { type: "string", enum: ["lb", "kg"], default: "lb" },
    email: { type: "string" },
    onboarding: onboardingSchema,
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
};

const exerciseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "sets", "reps", "intensity"],
  properties: {
    name: { type: "string" },
    sets: { type: "number" },
    reps: { type: "string" },
    intensity: { type: "string" },
    logs: { type: "array", items: { type: "object" } },
  },
};

const workoutDaySchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "theme", "exercises"],
  properties: {
    name: { type: "string" },
    theme: { type: "string" },
    exercises: { type: "array", items: exerciseSchema },
  },
};

const programSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "weeks", "createdAt", "updatedAt", "status"],
  properties: {
    id: { type: "string" },
    status: { type: "string", enum: ["draft", "finalized"] },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    weeks: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "focus", "days"],
        properties: {
          title: { type: "string" },
          focus: { type: "string" },
          days: { type: "array", items: workoutDaySchema },
        },
      },
    },
  },
};

const prEntrySchema = {
  type: "object",
  additionalProperties: false,
  required: ["lift", "weight", "reps", "date", "estimated1Rm"],
  properties: {
    lift: { type: "string" },
    weight: { type: "number" },
    reps: { type: "number" },
    rpe: { type: ["number", "null"] },
    date: { type: "string" },
    estimated1Rm: { type: "number" },
  },
};

const auditEventSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "detail", "createdAt", "userId", "email"],
  properties: {
    type: { type: "string" },
    detail: { type: "string" },
    createdAt: { type: "string" },
    userId: { type: "string" },
    email: { type: "string" },
  },
};

const schemas = {
  onboarding: onboardingSchema,
  userProfile: userProfileSchema,
  program: programSchema,
  workoutDay: workoutDaySchema,
  prEntry: prEntrySchema,
  auditEvent: auditEventSchema,
};

const validators = Object.fromEntries(
  Object.entries(schemas).map(([name, schema]) => [name, ajv.compile(schema)])
);

const validateSchema = (name, data) => {
  const validator = validators[name];
  if (!validator) throw new Error(`Unknown schema: ${name}`);
  const valid = validator(data);
  return { valid, errors: validator.errors };
};

module.exports = { validateSchema, schemas };
