## About

This project was created with [express-generator-typescript](https://github.com/seanpmaxwell/express-generator-typescript).

## Getting Started

### Environment Variables

Create a `.env` file in the project root. Local runs read:

```env
PORT=3000
TABLE_PREFIX=dev_vistaq_
COGNITO_USER_POOL_ID=<UserPoolId stack output>
COGNITO_CLIENT_ID=<UserPoolClientId stack output>
```

A deploy needs nothing from `.env`. `ETL_SERVICE_URL` and `ETL_API_KEY` are optional: without them report jobs cannot reach the ETL and every internal route (key-authenticated) answers 401; set both, with a long random key, to connect a real ETL. Allowed frontend origins are the per-stage `allowedOrigins` param in `serverless.yml`, and `REPORTS_BUCKET` and `STATS_QUEUE_URL` are set on the deployed functions from the stack. The local server sends no CORS headers, so a frontend on another port should use its dev-server proxy.

## Available Scripts

### `npm run clean-install`

Remove the existing `node_modules/` folder, `package-lock.json`, and reinstall all library modules.

### `npm run dev` or `npm run dev:watch` (hot reloading)

Run the server in development mode.<br/>

**IMPORTANT** development mode uses `swc` for performance reasons which DOES NOT check for typescript errors. Run `npm run type-check` to check for type errors. NOTE: you should use your IDE to prevent most type errors.

### `npm test`

Run unit-tests with <a href="https://vitest.dev/guide/">vitest</a>.

### `npm run lint`

Check for linting errors.

### `npm run build`

Build the project for production.

### `npm start`

Run the production build (Must be built first).

### `npm run type-check`

Check for typescript errors.

## Deploying with Serverless Framework

Serverless Framework v4 is a project devDependency, not a global install. Run every command through `npx`:

```bash
npx sls --version
npx sls package --stage dev
npx sls deploy --stage dev
npx sls remove --stage dev
```

`npm run package`, `npm run deploy` and `npm run remove` wrap the same commands; pass the stage with `npm run deploy -- --stage dev`. Resources are declared in `serverless.yml`. The first run downloads the framework binary and needs a Serverless login or license key (`SERVERLESS_ACCESS_KEY` in CI).

Pushing to `staging` deploys the staging stage through `.github/workflows/staging.yml`. The workflow's `staging` environment needs the `AWS_DEPLOY_ROLE_ARN` variable (an IAM role that trusts GitHub's OIDC provider for this repository's `staging` environment) and the `SERVERLESS_ACCESS_KEY` secret.

## Additional Notes

- If `npm run dev` gives you issues with bcrypt on MacOS you may need to run: `npm rebuild bcrypt --build-from-source`.
