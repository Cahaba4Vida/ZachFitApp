import type { Handler } from '@netlify/functions';
import { withTopLevelError, json, forbidden, getAuth } from './_shared/http';
import { upsertUser } from './_shared/user_upsert';
import { sql, one, many } from './_shared/db_helpers';
import { canUseAi } from './_shared/ai_gate';
import { handleOnboardingGenerate } from './_routes/onboarding_generate';

export const handler: Handler = withTopLevelError(async (event, context) => {
  const auth = await getAuth(event, context);
  if (!auth) return forbidden('Login required');
  const userRow = await upsertUser(auth);
  return await handleOnboardingGenerate({ event, userRow, sql, one, many, json, forbidden, canUseAi });
});
