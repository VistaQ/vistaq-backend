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

* Database model interfaces are derived from Supabase-generated types, not manually defined.
* The raw generated type (e.g. `UserRow`) is used only within the Repository layer.
* A derived interface (e.g. `IUser`) is created using TypeScript utility types like `Pick` or `Omit` for use across Service and Controller layers.
* Derived interfaces follow the naming pattern: `IUser`, `IOrder`, `IPayment` etc.