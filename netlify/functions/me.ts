import type { Handler } from '@netlify/functions';
import { withTopLevelError, json, forbidden, getAuth } from './_shared/http';
import { one } from './_shared/db_helpers';
import { handleMe } from './_routes/me';

export const handler: Handler = withTopLevelError(async (event, context) => {
  const auth = await getAuth(event, context);
  return await handleMe({ auth, json, forbidden, one });
});
