# Architecture
* This repo adheres to the layered architecture (Controller -> Service -> Repository)
* Controller handles the request with validation and returns the response
* Service handles business logic
* Repository handles database models interactions for reading, creating, updating and deletion operations
* Controllers should NEVER interact directly with Repositories
* Services should NEVER return raw database objects — always map to the appropriate interface before returning
* Other service classes can be referenced in other service classes via singleton
* There can be NO circular dependencies. If detected, attempt to resolve by refactoring. If the fix is non-trivial or introduces breaking changes, stop and consult the user before proceeding