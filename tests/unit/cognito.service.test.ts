import '../helpers/setEnv';

import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { mockClient } from 'aws-sdk-client-mock';

import {
  InvalidCredentialsError,
  UserAlreadyExistsError,
} from '@src/models/errors/auth.errors';
import {
  CognitoRateLimitedError,
  CognitoServiceError,
} from '@src/models/errors/cognito.error';
import cognitoService from '@src/services/cognito.service';

const cognito = mockClient(CognitoIdentityProviderClient);

const failure = (name: string) => Object.assign(new Error(name), { name });

beforeEach(() => cognito.reset());

describe('CognitoService.createUser', () => {
  it('creates a verified user without an email, then sets a random permanent password', async () => {
    cognito.on(AdminCreateUserCommand).resolves({
      User: { Attributes: [{ Name: 'sub', Value: 'sub-1' }] },
    });
    cognito.on(AdminSetUserPasswordCommand).resolves({});

    const result = await cognitoService.createUser('ann@example.com');

    expect(result).toEqual({ id: 'sub-1' });
    expect(cognito.commandCalls(AdminCreateUserCommand)[0].args[0].input).toMatchObject({
      UserPoolId: 'pool-id',
      Username: 'ann@example.com',
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: 'ann@example.com' },
        { Name: 'email_verified', Value: 'true' },
      ],
    });
    const password = cognito.commandCalls(AdminSetUserPasswordCommand)[0].args[0].input;
    expect(password.Permanent).toBe(true);
    expect(password.Password!.length).toBeGreaterThan(20);
  });

  it('uses a different password each time', async () => {
    cognito.on(AdminCreateUserCommand).resolves({
      User: { Attributes: [{ Name: 'sub', Value: 'sub-1' }] },
    });
    cognito.on(AdminSetUserPasswordCommand).resolves({});

    await cognitoService.createUser('a@b.co');
    await cognitoService.createUser('c@d.co');

    const [first, second] = cognito
      .commandCalls(AdminSetUserPasswordCommand)
      .map((call) => call.args[0].input.Password);
    expect(first).not.toBe(second);
  });

  it('deletes the user again when setting the password fails', async () => {
    cognito.on(AdminCreateUserCommand).resolves({
      User: { Attributes: [{ Name: 'sub', Value: 'sub-1' }] },
    });
    cognito.on(AdminSetUserPasswordCommand).rejects(new Error('policy'));
    cognito.on(AdminDeleteUserCommand).resolves({});

    await expect(cognitoService.createUser('ann@example.com')).rejects.toBeInstanceOf(
      CognitoServiceError,
    );
    expect(cognito.commandCalls(AdminDeleteUserCommand)[0].args[0].input.Username).toBe(
      'ann@example.com',
    );
  });

  it('throws UserAlreadyExistsError for a duplicate email', async () => {
    cognito.on(AdminCreateUserCommand).rejects(failure('UsernameExistsException'));

    await expect(cognitoService.createUser('ann@example.com')).rejects.toBeInstanceOf(
      UserAlreadyExistsError,
    );
  });
});

describe('CognitoService.startLogin', () => {
  it('starts the USER_AUTH flow asking for an emailed code and returns the session', async () => {
    cognito.on(InitiateAuthCommand).resolves({ ChallengeName: 'EMAIL_OTP', Session: 'sess' });

    expect(await cognitoService.startLogin('ann@example.com')).toEqual({ session: 'sess' });
    expect(cognito.commandCalls(InitiateAuthCommand)[0].args[0].input).toMatchObject({
      AuthFlow: 'USER_AUTH',
      ClientId: 'client-id',
      AuthParameters: { USERNAME: 'ann@example.com', PREFERRED_CHALLENGE: 'EMAIL_OTP' },
    });
  });

  it('answers a SELECT_CHALLENGE response by choosing the emailed code', async () => {
    cognito.on(InitiateAuthCommand).resolves({ ChallengeName: 'SELECT_CHALLENGE', Session: 's1' });
    cognito.on(RespondToAuthChallengeCommand).resolves({ ChallengeName: 'EMAIL_OTP', Session: 's2' });

    expect(await cognitoService.startLogin('ann@example.com')).toEqual({ session: 's2' });
    expect(cognito.commandCalls(RespondToAuthChallengeCommand)[0].args[0].input).toMatchObject({
      ChallengeName: 'SELECT_CHALLENGE',
      Session: 's1',
      ChallengeResponses: { USERNAME: 'ann@example.com', ANSWER: 'EMAIL_OTP' },
    });
  });

  it.each([
    'NotAuthorizedException',
    'UserNotFoundException',
    'PasswordResetRequiredException',
    'InvalidParameterException',
  ])('returns a decoy session on %s so an unknown email looks like a known one', async (name) => {
    cognito.on(InitiateAuthCommand).rejects(failure(name));

    const { session } = await cognitoService.startLogin('a@b.co');

    expect(session.length).toBeGreaterThanOrEqual(20);
  });

  it('returns a decoy session when the emailed code is not offered after SELECT_CHALLENGE', async () => {
    cognito.on(InitiateAuthCommand).resolves({ ChallengeName: 'SELECT_CHALLENGE', Session: 's1' });
    cognito.on(RespondToAuthChallengeCommand).rejects(failure('InvalidParameterException'));

    const { session } = await cognitoService.startLogin('a@b.co');

    expect(session).not.toBe('s1');
    expect(session.length).toBeGreaterThanOrEqual(20);
  });

  it.each(['TooManyRequestsException', 'LimitExceededException'])(
    'maps %s to CognitoRateLimitedError',
    async (name) => {
      cognito.on(InitiateAuthCommand).rejects(failure(name));

      await expect(cognitoService.startLogin('a@b.co')).rejects.toBeInstanceOf(
        CognitoRateLimitedError,
      );
    },
  );

  it('wraps an unexpected failure in CognitoServiceError', async () => {
    cognito.on(InitiateAuthCommand).rejects(failure('InternalErrorException'));

    await expect(cognitoService.startLogin('a@b.co')).rejects.toBeInstanceOf(CognitoServiceError);
  });
});

describe('CognitoService.verifyLogin', () => {
  it('sends the code with the session and returns the tokens', async () => {
    cognito.on(RespondToAuthChallengeCommand).resolves({
      AuthenticationResult: {
        AccessToken: 'access',
        RefreshToken: 'refresh',
        IdToken: 'id',
        ExpiresIn: 900,
      },
    });

    const tokens = await cognitoService.verifyLogin('ann@example.com', 'sess', '123456');

    expect(tokens).toEqual({ accessToken: 'access', refreshToken: 'refresh', idToken: 'id', expiresIn: 900 });
    expect(cognito.commandCalls(RespondToAuthChallengeCommand)[0].args[0].input).toMatchObject({
      ChallengeName: 'EMAIL_OTP',
      Session: 'sess',
      ChallengeResponses: { USERNAME: 'ann@example.com', EMAIL_OTP_CODE: '123456' },
    });
  });

  it.each(['CodeMismatchException', 'ExpiredCodeException', 'NotAuthorizedException'])(
    'maps %s to InvalidCredentialsError',
    async (name) => {
      cognito.on(RespondToAuthChallengeCommand).rejects(failure(name));

      await expect(cognitoService.verifyLogin('a@b.co', 's', '1')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );
    },
  );

  it('rejects a response that carries no tokens', async () => {
    cognito.on(RespondToAuthChallengeCommand).resolves({ Session: 'again' });

    await expect(cognitoService.verifyLogin('a@b.co', 's', '1')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });
});

describe('CognitoService admin and session calls', () => {
  it('signOut revokes the access token', async () => {
    cognito.on(GlobalSignOutCommand).resolves({});

    await cognitoService.signOut('tok');

    expect(cognito.commandCalls(GlobalSignOutCommand)[0].args[0].input.AccessToken).toBe('tok');
  });

  it('disableUser, enableUser and deleteUser target the user in the pool', async () => {
    cognito.on(AdminDisableUserCommand).resolves({});
    cognito.on(AdminEnableUserCommand).resolves({});
    cognito.on(AdminDeleteUserCommand).resolves({});

    await cognitoService.disableUser('a@b.co');
    await cognitoService.enableUser('a@b.co');
    await cognitoService.deleteUser('a@b.co');

    for (const command of [AdminDisableUserCommand, AdminEnableUserCommand, AdminDeleteUserCommand]) {
      expect(cognito.commandCalls(command)[0].args[0].input).toMatchObject({
        UserPoolId: 'pool-id',
        Username: 'a@b.co',
      });
    }
  });

  it('updateEmail changes the email and keeps it verified', async () => {
    cognito.on(AdminUpdateUserAttributesCommand).resolves({});

    await cognitoService.updateEmail('old@b.co', 'new@b.co');

    expect(cognito.commandCalls(AdminUpdateUserAttributesCommand)[0].args[0].input).toMatchObject({
      Username: 'old@b.co',
      UserAttributes: [
        { Name: 'email', Value: 'new@b.co' },
        { Name: 'email_verified', Value: 'true' },
      ],
    });
  });
});
