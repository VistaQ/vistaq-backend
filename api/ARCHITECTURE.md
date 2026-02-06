# Layered Architecture

This project follows a clean **layered architecture** pattern to ensure separation of concerns, maintainability, and testability.

## Architecture Layers

```
┌─────────────────────────────────────┐
│         1. Routes Layer             │  ← Define endpoints & HTTP methods
│         (routes/apiRouter.ts)       │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      2. Controller Layer            │  ← Handle HTTP requests/responses
│      (controllers/)                 │     Status codes, req/res parsing
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│       3. Service Layer              │  ← Business logic & validation
│       (services/)                   │     Business rules, orchestration
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│     4. Repository Layer             │  ← Data access operations
│     (repos/)                        │     CRUD, queries, transactions
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│      5. Database/ORM                │  ← Firestore, MongoDB, etc.
│      (MockOrm.ts → Firestore)       │
└─────────────────────────────────────┘
```

## Layer Responsibilities

### 1. **Routes Layer** (`routes/`)
- Define API endpoints and HTTP methods
- Mount routers and organize route structure
- **No business logic or HTTP handling**

**Example:**
```typescript
// routes/apiRouter.ts
userRouter.get('/all', UserController.getAll);
userRouter.post('/add', UserController.add);
apiRouter.use('/users', userRouter);
```

### 2. **Controller Layer** (`controllers/`)
- Handle HTTP request/response objects
- Extract data from req.body, req.params, req.query
- Set HTTP status codes
- Call service layer methods
- **No business logic**

**Example:**
```typescript
// controllers/UserController.ts
async function add(req: Request, res: Response): Promise<void> {
  const user = req.body.user as IUser;
  await UserService.addOne(user);
  res.status(HttpStatusCodes.CREATED).end();
}
```

### 3. **Service Layer** (`services/`)
- Implement business logic
- Validate business rules
- Orchestrate multiple repository calls
- Throw domain-specific errors
- **Independent of HTTP concerns**

**Example:**
```typescript
// services/UserService.ts
async function updateOne(user: IUser): Promise<void> {
  const persists = await UserRepo.persists(user.id);
  if (!persists) {
    throw new RouteError(HttpStatusCodes.NOT_FOUND, 'User not found');
  }
  return UserRepo.update(user);
}
```

### 4. **Repository Layer** (`repos/`)
- Handle all data access operations
- Abstract database/ORM implementation
- Provide clean data access interface
- **No business logic**

**Example:**
```typescript
// repos/UserRepo.ts
async function getAll(): Promise<IUser[]> {
  const db = await orm.openDb();
  return db.users;
}

async function add(user: IUser): Promise<void> {
  const db = await orm.openDb();
  user.id = getRandomInt();
  db.users.push(user);
  return orm.saveDb(db);
}
```

### 5. **Models** (`models/`)
- Define data structures and types
- Entity interfaces
- DTOs (Data Transfer Objects)

**Example:**
```typescript
// models/User.model.ts
export interface IUser extends Entity {
  name: string;
  email: string;
}
```

## Dependency Rules

**Key Principle:** Dependencies only flow downward. Upper layers can depend on lower layers, but not vice versa.

✅ **Allowed:**
- Controllers → Services
- Services → Repositories
- Repositories → Models

❌ **Not Allowed:**
- Services → Controllers
- Repositories → Services
- Models → anything

## Benefits

1. **Separation of Concerns**: Each layer has a single, well-defined responsibility
2. **Testability**: Easy to unit test each layer in isolation
3. **Maintainability**: Changes in one layer don't affect others
4. **Scalability**: Easy to add new features without breaking existing code
5. **Flexibility**: Easy to swap implementations (e.g., MockOrm → Firestore)

## Example Flow: Create User

```
1. POST /api/users/add
   ↓
2. Routes: userRouter.post('/add', UserController.add)
   ↓
3. Controller: Extract user from req.body
   ↓
4. Service: UserService.addOne(user)
   - Validate business rules
   - Check if user exists
   ↓
5. Repository: UserRepo.add(user)
   - Save to database
   ↓
6. Controller: Send 201 Created response
```

## Adding New Features

To add a new resource (e.g., Posts):

1. **Model**: Create `models/Post.model.ts`
2. **Repository**: Create `repos/PostRepo.ts`
3. **Service**: Create `services/PostService.ts`
4. **Controller**: Create `controllers/PostController.ts`
5. **Routes**: Add routes in `routes/apiRouter.ts`

Each layer builds on top of the previous one, maintaining clean separation of concerns.
