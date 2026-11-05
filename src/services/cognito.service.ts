import { randomBytes } from 'crypto';

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

import {
  InvalidCredentialsError,
  UserAlreadyExistsError,
} from '@src/models/errors/auth.errors';
import {
  CognitoRateLimitedError,
  CognitoServiceError,
} from '@src/models/errors/cognito.error';
import EnvVars from '@src/utils/env';

/******************************************************************************
                              Types
******************************************************************************/

export interface ITokens {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresIn: number | null;
}

const client = new CognitoIdentityProviderClient({});

const CREDENTIAL_FAILURES = new Set([
  'NotAuthorizedException',
  'CodeMismatchException',
  'ExpiredCodeException',
  'UserNotFoundException',
]);

const RATE_LIMITS = new Set([
  'TooManyRequestsException',
  'LimitExceededException',
  'TooManyFailedAttemptsException',
]);

const HIDDEN_ACCOUNT_FAILURES = new Set([
  ...CREDENTIAL_FAILURES,
  'PasswordResetRequiredException',
]);

// Cognito's own session is ~900 chars; the decoy must pass its minimum length so verify fails like a wrong code.
function decoySession(): string {
  return randomBytes(675).toString('base64');
}

function errorName(error: unknown): string | undefined {
  return (error as { name?: string } | null)?.name;
}

function wrap(context: string, error: unknown): never {
  const name = errorName(error);
  if (name && RATE_LIMITS.has(name)) {
    throw new CognitoRateLimitedError();
  }
  throw new CognitoServiceError(`${context} failed`, error);
}

// Cognito requires a password on a created user; nobody is ever told this one.
function randomPassword(): string {
  return `${randomBytes(24).toString('base64url')}Aa1!`;
}

/******************************************************************************
                              CognitoService
******************************************************************************/

class CognitoService {
  /** Creates a confirmed user with a verified email and no usable password. */
  async createUser(email: string): Promise<{ id: string }> {
    try {
      const created = await client.send(
        new AdminCreateUserCommand({
          UserPoolId: EnvVars.CognitoUserPoolId,
          Username: email,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
        }),
      );
      const sub = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
      if (!sub) {
        throw new Error('Cognito did not return a user id');
      }

      try {
        await client.send(
          new AdminSetUserPasswordCommand({
            UserPoolId: EnvVars.CognitoUserPoolId,
            Username: email,
            Password: randomPassword(),
            Permanent: true,
          }),
        );
      } catch (error) {
        await this.deleteUser(email).catch(() => undefined);
        throw error;
      }
      return { id: sub };
    } catch (error) {
      if (errorName(error) === 'UsernameExistsException') {
        throw new UserAlreadyExistsError();
      }
      return wrap('CognitoService.createUser', error);
    }
  }

  async deleteUser(username: string): Promise<void> {
    try {
      await client.send(
        new AdminDeleteUserCommand({
          UserPoolId: EnvVars.CognitoUserPoolId,
          Username: username,
        }),
      );
    } catch (error) {
      return wrap('CognitoService.deleteUser', error);
    }
  }

  async disableUser(username: string): Promise<void> {
    try {
      await client.send(
        new AdminDisableUserCommand({
          UserPoolId: EnvVars.CognitoUserPoolId,
          Username: username,
        }),
      );
    } catch (error) {
      return wrap('CognitoService.disableUser', error);
    }
  }

  async enableUser(username: string): Promise<void> {
    try {
      await client.send(
        new AdminEnableUserCommand({
          UserPoolId: EnvVars.CognitoUserPoolId,
          Username: username,
        }),
      );
    } catch (error) {
      return wrap('CognitoService.enableUser', error);
    }
  }

  async updateEmail(username: string, email: string): Promise<void> {
    try {
      await client.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: EnvVars.CognitoUserPoolId,
          Username: username,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
        }),
      );
    } catch (error) {
      return wrap('CognitoService.updateEmail', error);
    }
  }

  /** Sends the sign-in code to the user's email and returns the session. */
  async startLogin(email: string): Promise<{ session: string }> {
    try {
      let result = await client.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_AUTH',
          ClientId: EnvVars.CognitoClientId,
          AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'EMAIL_OTP' },
        }),
      );

      if (result.ChallengeName === 'SELECT_CHALLENGE' && result.Session) {
        result = await client.send(
          new RespondToAuthChallengeCommand({
            ClientId: EnvVars.CognitoClientId,
            ChallengeName: 'SELECT_CHALLENGE',
            Session: result.Session,
            ChallengeResponses: { USERNAME: email, ANSWER: 'EMAIL_OTP' },
          }),
        );
      }

      if (!result.Session) {
        throw new Error('Cognito did not return a session');
      }
      return { session: result.Session };
    } catch (error) {
      const name = errorName(error);
      if (name && HIDDEN_ACCOUNT_FAILURES.has(name)) {
        return { session: decoySession() };
      }
      // For an unknown email Cognito randomly offers a challenge list without EMAIL_OTP, which fails here.
      if (name === 'InvalidParameterException') {
        return { session: decoySession() };
      }
      return wrap('CognitoService.startLogin', error);
    }
  }

  async verifyLogin(
    email: string,
    session: string,
    code: string,
  ): Promise<ITokens> {
    try {
      const result = await client.send(
        new RespondToAuthChallengeCommand({
          ClientId: EnvVars.CognitoClientId,
          ChallengeName: 'EMAIL_OTP',
          Session: session,
          ChallengeResponses: { USERNAME: email, EMAIL_OTP_CODE: code },
        }),
      );

      const auth = result.AuthenticationResult;
      if (!auth?.AccessToken) {
        throw new InvalidCredentialsError();
      }
      return {
        accessToken: auth.AccessToken,
        refreshToken: auth.RefreshToken ?? null,
        idToken: auth.IdToken ?? null,
        expiresIn: auth.ExpiresIn ?? null,
      };
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw error;
      }
      const name = errorName(error);
      if (name && CREDENTIAL_FAILURES.has(name)) {
        throw new InvalidCredentialsError();
      }
      return wrap('CognitoService.verifyLogin', error);
    }
  }

  async signOut(accessToken: string): Promise<void> {
    try {
      await client.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
    } catch (error) {
      return wrap('CognitoService.signOut', error);
    }
  }
}

export const cognitoService = new CognitoService();
export default cognitoService;
