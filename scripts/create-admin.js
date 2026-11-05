/**
 * Create Admin User Script
 *
 * Creates a passwordless Cognito user (verified email, random unknown
 * password) and the matching admin item in the Users table. The admin signs
 * in with the emailed code through POST /auth/login and /auth/login/verify.
 *
 * Usage:
 *   node scripts/create-admin.js <email> "<full name>"
 *
 * Required environment (shell or .env): AWS_REGION, COGNITO_USER_POOL_ID,
 * USERS_TABLE. AWS credentials come from the default provider chain. The
 * pool id and table name are the UserPoolId and UsersTableName stack outputs.
 */

require('dotenv').config();
const { randomBytes } = require('crypto');

const {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const [email, name] = process.argv.slice(2);
const { AWS_REGION, COGNITO_USER_POOL_ID, USERS_TABLE } = process.env;

if (!email || !name) {
  console.error('Usage: node scripts/create-admin.js <email> "<full name>"');
  process.exit(1);
}

for (const [variable, value] of Object.entries({ AWS_REGION, COGNITO_USER_POOL_ID, USERS_TABLE })) {
  if (!value) {
    console.error(`Missing ${variable}`);
    process.exit(1);
  }
}

const cognito = new CognitoIdentityProviderClient({ region: AWS_REGION });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));

async function createAdminUser() {
  const username = email.toLowerCase();

  console.log(`Creating Cognito user for ${username}...`);
  const created = await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: username,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: username },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  const userId = created.User.Attributes.find((a) => a.Name === 'sub').Value;

  try {
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: username,
        Password: `${randomBytes(24).toString('base64url')}Aa1!`,
        Permanent: true,
      }),
    );

    console.log('Writing the user item...');
    const now = new Date().toISOString();
    await dynamo.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: {
          id: userId,
          email: username,
          name,
          role: 'admin',
          status: 'active',
          created_at: now,
          updated_at: now,
        },
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    );
  } catch (error) {
    await cognito
      .send(new AdminDeleteUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: username }))
      .catch(() => undefined);
    throw error;
  }

  console.log('');
  console.log('--- Admin user created ---');
  console.log(`ID:    ${userId}`);
  console.log(`Email: ${username}`);
  console.log('Role:  admin');
  console.log('Sign in with POST /auth/login, then POST /auth/login/verify with the emailed code.');
}

createAdminUser().catch((error) => {
  console.error('Failed to create the admin user:', error.message);
  process.exit(1);
});
