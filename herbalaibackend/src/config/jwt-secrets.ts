import { randomBytes } from 'node:crypto';

type JwtEnvironment = {
  NODE_ENV?: string | undefined;
  JWT_SECRET?: string | undefined;
  JWT_REFRESH_SECRET?: string | undefined;
};

export const resolveJwtSecrets = (environment: JwtEnvironment) => {
  const production = environment.NODE_ENV === 'production';
  const secrets = {
    JWT_SECRET: environment.JWT_SECRET || (production ? '' : randomBytes(32).toString('hex')),
    JWT_REFRESH_SECRET: environment.JWT_REFRESH_SECRET || (production ? '' : randomBytes(32).toString('hex')),
  };
  if (production) {
    const invalidNames = Object.entries(secrets)
      .filter(([, value]) => value.length < 32 || /(?:change[_-]?in[_-]?prod|replace[_-]?with|your[_-]|example|synthetic|test[_-])/i.test(value))
      .map(([name]) => name);
    if (secrets.JWT_SECRET === secrets.JWT_REFRESH_SECRET) {
      invalidNames.push('JWT_SECRET', 'JWT_REFRESH_SECRET');
    }
    if (invalidNames.length > 0) {
      throw new Error(`Production requires unique JWT secrets of at least 32 characters: ${[...new Set(invalidNames)].join(', ')}`);
    }
  }
  return secrets;
};
