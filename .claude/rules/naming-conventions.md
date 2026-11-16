# Naming Conventions

* Variable names must follow camelCase convention.
* Class naming conventions: `XXXController`, `XXXService`, `XXXRepository`.
* Service classes are exported as singletons into their dependents.
* Repository classes are exported as singletons into their corresponding Service class.

## File Naming Conventions

* Controllers: `user.controller.ts`
* Services: `user.service.ts`
* Repositories: `user.repository.ts`
* External API service classes: `sendgrid.service.ts`

## Interface Naming Conventions

* All interfaces are prefixed with `I`.
* Controller request interfaces: `CreateUserReq extends IBaseReq`
* Controller response interfaces: `CreateUserRes extends IBaseRes`
* External API request interfaces: `ISendEmailReq`
* External API response interfaces: `ISendEmailRes`
* When an API response follows a fixed format, use generics: `IApiResponse<T>`

## Database Model Interfaces

* Item interfaces describe the stored DynamoDB item and are named `<Entity>Item` (`IUserItem`, `IProspectItem`). They are written by hand in the repository file and used only in the Repository layer.
* Domain interfaces in `src/types/` are what Service and Controller layers use: `IUser`, `IGroup`, `IProspect` etc. Repositories map items to them before returning.
