export const adminRehearsalDatabaseUrl = (environment) => {
  const message = 'Admin CRUD rehearsal requires an explicit HERBALAI_ADMIN_REHEARSAL_DATABASE_URL pointing to a loopback herbalai_test database; hosted targets are forbidden.';
  let target;
  try {
    target = new URL(environment.HERBALAI_ADMIN_REHEARSAL_DATABASE_URL);
  } catch {
    throw new Error(message);
  }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
    || target.pathname !== '/herbalai_test'
    || target.hash
    || [...target.searchParams].some(([key, value]) => key !== 'sslmode' || value !== 'disable')) {
    throw new Error(message);
  }
  return target.href;
};
