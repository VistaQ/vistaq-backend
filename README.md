## About

This project was created with [express-generator-typescript](https://github.com/seanpmaxwell/express-generator-typescript).

**IMPORTANT** for demo purposes I had to disable `helmet` in production. In any real world app you should change these 3 lines of code in `src/server.ts`:

```ts
// eslint-disable-next-line n/no-process-env
if (!process.env.DISABLE_HELMET) {
  app.use(helmet());
}
```

To just this:

```ts
app.use(helmet());
```

## Getting Started

### Environment Variables

Create a `.env` file in the project root with the following required variables:

```env
NODE_ENV=development
PORT=3000
HOST=localhost
DISABLE_HELMET=true

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### Database Type Generation

After setting up your Supabase project, generate TypeScript types from your database schema:

```bash
supabase gen types typescript --project-id <your-project-id> > src/types/database.types.ts
```

Run this command whenever you make schema changes in Supabase to keep types in sync with the database.

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

## Additional Notes

- If `npm run dev` gives you issues with bcrypt on MacOS you may need to run: `npm rebuild bcrypt --build-from-source`.
