# User Microservice

This is the User/Auth microservice for the KFC/KGF fullstack application. It handles user authentication, registration, and profile management.

## Features

- User registration with password hashing
- User login with JWT token generation
- User profile retrieval
- Token verification
- Secure password storage with salt

## Swagger UI

- Local: `http://localhost:8082/api-docs/`
- Public: `https://arb-api.qa.bikkam.online/users/api-docs/` (after applying the user-service VirtualService and configuring HTTPS on the gateway)

## Auth0 email check

`POST /auth/auth0/check-email` checks Auth0 before the frontend opens hosted login or signup.
Configure these server-only variables on the user service:

```env
AUTH0_DOMAIN=dev-6l85tc0ex15xt2oe.us.auth0.com
AUTH0_MGMT_CLIENT_ID=your-management-api-client-id
AUTH0_MGMT_CLIENT_SECRET=your-management-api-client-secret
```

The Auth0 application must have a Machine to Machine application authorized for the Auth0 Management API with `read:users` and `read:users_app_metadata` scopes.

## API Endpoints

### POST /auth/signup
Register a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "mobile": "9876543210",
  "password": "secret123"
}
```

**Response:**
```json
{
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "name": "John Doe",
    "email": "john@example.com",
    "mobile": "9876543210"
  },
  "message": "Signup successful"
}
```

### POST /auth/login
Authenticate user and get JWT token.

**Request Body:**
```json
{
  "mobile": "9876543210",
  "password": "secret123"
}
```

**Response:**
```json
{
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "name": "John Doe",
    "email": "john@example.com",
    "mobile": "9876543210"
  },
  "message": "Login successful"
}
```

### GET /auth/profile
Get current user profile (requires Bearer token).

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "id": "user-id",
  "name": "John Doe",
  "email": "john@example.com",
  "mobile": "9876543210",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### POST /auth/verify
Verify JWT token and get user info.

**Request Body:**
```json
{
  "token": "jwt-token-here"
}
```

**Response:**
```json
{
  "valid": true,
  "user": {
    "id": "user-id",
    "name": "John Doe",
    "email": "john@example.com",
    "mobile": "9876543210"
  }
}
```

## Environment Variables

- `PORT`: Port for the service (default: 8082)
- `SQL_SERVER`: SQL Server hostname
- `SQL_PORT`: SQL Server port (default: 1433)
- `SQL_DATABASE`: Existing database name
- `SQL_USER` / `SQL_PASSWORD`: SQL Server credentials
- `SQL_ENCRYPT`: Enable encrypted connections (default: true)
- `SQL_TRUST_SERVER_CERTIFICATE`: Trust the server certificate (default: false)
- `SQL_CREATE_DATABASE`: Create the database when missing; local development only
- `SQL_AUTO_CREATE_SCHEMA`: Apply the Users table schema at startup; enabled for local and in-cluster SQL Server
- `JWT_SECRET`: Secret key for JWT token signing

## Security Features

- Password hashing with scrypt algorithm
- Unique salt for each password
- JWT token-based authentication
- Password validation with timing-safe comparison
- Input validation and sanitization

## Running the Service

```bash
npm install
npm start
```

## Docker

The service includes a Dockerfile for containerization and is configured in the main docker-compose.yml file.

## Database

Uses Microsoft SQL Server. The table definition is in
[sql/schema.sql](./sql/schema.sql) and includes a GUID user ID, unique email
and mobile constraints, password hash/salt, and UTC creation/update times.

For local Docker Compose development, copy the root `.env.example` to `.env`
and replace its placeholder with a strong local-only password. From the
repository root, start the shared database server and service with
`docker compose up --build -d kfc-sql-server users-service`. Compose runs an
SQL Server Developer container shared with Orders, with a separate database
for each service. It creates the Users database and table on startup. This
local SQL Server is shared with the other microservices, each of which uses a
separate database.

Microsoft supports its SQL Server Linux container images on x86-64 hosts only;
they are not supported on ARM64 Macs. On an ARM64 development machine, run the
Users process against a separate non-production Azure SQL database instead,
or use an x86-64 development host for the local Compose database. Do not point
local development at the production database.

For AKS, replace the placeholders in the SQL Server and service Secret
manifests, then apply all manifests in `.k8s/sql-server/`. They provision a
persistent in-cluster SQL Server and creates the service databases and
database-scoped logins. The User deployment applies its table schema at startup.
The SQL Server Developer edition in the manifest is for development/testing,
not production.

This is a fresh-database migration: existing MongoDB Users are not copied.
Users must register again after the SQL-backed service is deployed; previously
issued tokens reference MongoDB IDs and won't resolve against the new database.