export const restoreTestDatabaseUrl = (environment) => {
  const message = 'Restore checks require HERBALAI_RESTORE_TEST_DATABASE_URL pointing only to a loopback herbalai_test database; production targets are forbidden.';
  if (environment.NODE_ENV === 'production') throw new Error(message);
  let target;
  try {
    target = new URL(environment.HERBALAI_RESTORE_TEST_DATABASE_URL);
  } catch {
    throw new Error(message);
  }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
    || target.pathname !== '/herbalai_test'
    || target.hash
    || [...target.searchParams].some(([key, value]) => key !== 'sslmode' || value !== 'disable')) {
    throw new Error(message);
  }
  return target.href;
};
