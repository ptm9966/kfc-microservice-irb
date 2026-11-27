# Cart Microservice

The Cart service provides user-scoped cart operations through Express and SQL
Server. Each cart item is stored in `cart-database`; adding a product already
in a user's cart increments its quantity. Ownership always comes from the
verified bearer token, not request data.

## API

All routes require `Authorization: Bearer <password-login-token>`.

- `GET /api/cart` — list the authenticated user's items
- `POST /api/cart` — add an item or increment its quantity
- `PATCH /api/cart/:cartId` — update an owned item's title, image, description, price, or quantity
- `DELETE /api/cart/:cartId` — remove an owned item
- `DELETE /api/cart` — clear the authenticated user's cart

The Cart service verifies tokens through `POST /auth/verify` on the Users
service. A cart item's `_id` is a SQL Server UUID.

## SQL Server configuration

- `SQL_SERVER` and `SQL_PORT`: SQL Server host and port
- `SQL_DATABASE`: Cart database name (`cart-database`)
- `SQL_USER` and `SQL_PASSWORD`: SQL Server credentials
- `SQL_ENCRYPT`: enable encrypted SQL connections
- `SQL_TRUST_SERVER_CERTIFICATE`: trust the in-cluster SQL Server certificate
- `SQL_CREATE_DATABASE`: create the database at startup when `true` (local only)
- `SQL_AUTO_CREATE_SCHEMA`: apply `sql/schema.sql` at startup when `true`
- `USERS_SERVICE_URL`: Users service base URL (default `http://localhost:8082`)

## Local development

From the repository root, copy `.env.example` to `.env` and set
`USERS_SQL_SA_PASSWORD` to the same local-only password configured for the
shared SQL Server. Then start the database and Cart service:

```bash
docker compose up --build -d kfc-sql-server cart-service
docker compose logs -f cart-service
```

Compose creates `cart-database` and its tables on startup. The Cart image runs
without source or `node_modules` bind mounts; rebuild after changing code or
dependencies.

For running the service directly on the host, use `SQL_SERVER=localhost`,
`SQL_PORT=14330`, `SQL_DATABASE=cart-database`, and the same SQL credentials.
Set `SQL_CREATE_DATABASE=true` and `SQL_AUTO_CREATE_SCHEMA=true` for local
development.

## AKS deployment

Replace the placeholders in the SQL Server and service Secret manifests, then
apply all manifests in `.k8s/sql-server/`. They provision the persistent SQL Server
and `cart-database`; the Cart deployment applies its schema at startup. The
SQL Server Developer edition in the manifest is for development/testing, not
production. Do not commit real credentials.

Existing MongoDB cart items are not migrated; the new SQL database starts
empty.

## Running tests

```bash
npm ci
npm test
```
