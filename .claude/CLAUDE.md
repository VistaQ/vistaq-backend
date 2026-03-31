# Project Overview
This repository serves as a backend API for a React/Vite frontend app. It interacts
with Supabase to leverage the provisioned Postgres database, Authentication, and Edge Functions.

# Subagents & Orchestration

## Available Subagents
- **implementor** — makes code changes based on requirements or fixes
- **code-review** — reviews code once implementor is done
- **tester** — creates and runs unit/feature tests
- **documenter** — handles OpenAPI/Swagger documentation
- **commit-organiser** — organises changes into logical commits

## Flow
1. Invoke **implementor** based on requirements
2. Once done, automatically invoke **code-review**
   - If issues found, send back to **implementor** to fix
   - Re-review after fix
   - Maximum 2 retries
3. Once review passes, automatically invoke **tester**
   - If tests fail, send back to **implementor** to fix
   - Re-run tests after fix
   - Maximum 3 retries
4. Once tests pass, automatically invoke **documenter**
5. **`/commit-organiser`** (skill) is ONLY invoked by the user. Never invoke automatically.