const env: Record<string, string> = {
  USERS_TABLE: 'users',
  AGENT_CODES_TABLE: 'agent-codes',
  GROUP_TRAINERS_TABLE: 'group-trainers',
  COGNITO_USER_POOL_ID: 'pool',
  COGNITO_CLIENT_ID: 'client',
  ETL_SERVICE_URL: 'http://etl.test',
  ETL_API_KEY: 'key',
};
for (const [name, value] of Object.entries(env)) {
  process.env[name] ??= value;
}

import {
  loginSchema,
  registerSchema,
  verifyLoginSchema,
} from '@src/routes/auth.routes';

const validRegister = {
  fullName: 'Jane Doe',
  agentCode: 'AGT-001',
  email: 'jane@example.com',
  groupId: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890',
  location: 'Kuala Lumpur',
};

describe('registerSchema', () => {
  it('accepts a body without a password', () => {
    expect(registerSchema.safeParse(validRegister).success).toBe(true);
  });

  it.each(['fullName', 'agentCode', 'email', 'groupId', 'location'])(
    'rejects a body missing %s',
    (field) => {
      const { [field]: _removed, ...rest } = validRegister as Record<string, string>;

      expect(registerSchema.safeParse(rest).success).toBe(false);
    },
  );

  it('rejects an invalid email and a non-uuid group id', () => {
    expect(registerSchema.safeParse({ ...validRegister, email: 'nope' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegister, groupId: 'g1' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('needs only an email', () => {
    expect(loginSchema.safeParse({ email: 'jane@example.com' }).success).toBe(true);
  });

  it('rejects a missing or malformed email', () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('verifyLoginSchema', () => {
  const valid = { email: 'jane@example.com', session: 'sess', code: '123456' };

  it('accepts email, session and code', () => {
    expect(verifyLoginSchema.safeParse(valid).success).toBe(true);
  });

  it.each(['email', 'session', 'code'])('rejects a body missing %s', (field) => {
    const { [field]: _removed, ...rest } = valid as Record<string, string>;

    expect(verifyLoginSchema.safeParse(rest).success).toBe(false);
  });
});
