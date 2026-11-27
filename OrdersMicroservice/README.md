# Orders Microservice

This is the Orders microservice for the KFC fullstack application. It handles order creation, retrieval, and status updates.

## Features

- Create orders from cart items
- Retrieve the authenticated user's orders
- Get specific order details
- Update order status
- SQL Server persistence with separate order and order-item tables
- Atomic order and item creation using SQL transactions

## API Endpoints

### GET /api/orders
Retrieve only the authenticated user's orders. Send the session token in the `Authorization: Bearer <token>` header. Any `userId` query parameter is ignored.

The service asks the Users Microservice to verify the password-login token. Order ownership is derived from the verified user record, never from a caller-supplied user ID. Auth0 tokens are not supported for order history yet.

### GET /api/orders/{orderId}
Retrieve a specific order by its SQL Server UUID. The authenticated user must own the order.

### POST /api/orders
Create a new order. Requires a valid bearer token; the service sets `userId` from the verified token and ignores any `userId` in the request body.

**Request Body:**
```json
{
  "userName": "string",
  "userMobile": "string",
  "items": [
    {
      "productId": "string",
      "title": "string",
      "image": "string",
      "desc": "string",
      "price": number,
      "qty": number
    }
  ],
  "totalPrice": number,
  "paymentMethod": "string"
}
```

### PATCH /api/orders/{orderId}/status
Update the status of an order by its SQL Server UUID.

**Request Body:**
```json
{
  "status": "string"
}
```

## SQL Server Configuration

- `PORT`: Port for the service (default: 8081)
- `SQL_SERVER`: SQL Server hostname
- `SQL_PORT`: SQL Server port (default: 1433)
- `SQL_DATABASE`: Orders database name (`orders-database`)
- `SQL_USER` and `SQL_PASSWORD`: SQL Server credentials
- `SQL_ENCRYPT`: Enable encrypted SQL connections
- `SQL_TRUST_SERVER_CERTIFICATE`: Trust the in-cluster SQL Server certificate
- `SQL_CREATE_DATABASE`: Create the database at startup when `true` (local only)
- `SQL_AUTO_CREATE_SCHEMA`: Apply `sql/schema.sql` at startup when `true`
- `USERS_SERVICE_URL`: Users Microservice base URL reachable from the Orders service (default: `http://localhost:8082`)

In Docker Compose, the service connects to the shared local SQL Server container
and uses `http://users-service:8082` for token verification. The order-history
endpoint currently supports password-login tokens only; Auth0 token support is
not enabled.

For AKS, replace the placeholders in the SQL Server and service Secret
manifests, then apply all manifests in `.k8s/sql-server/`. They provision the
persistent SQL Server and `orders-database`; the Orders deployment applies its
schema at startup. The SQL Server Developer edition in the manifest is for
development/testing, not production. Existing MongoDB order history is not
migrated; the new SQL database starts empty.

## Running the Service

```bash
npm ci
npm start
```

For local development with Docker Compose, configure the root `.env` using
`.env.example`, then run `docker compose up --build -d kfc-sql-server orders-service`.
The container creates `orders-database` and its tables on first startup. Rebuild
the image after changing source code or dependencies.

## Docker

The production image installs dependencies with `npm ci --omit=dev` and does
not mount host source code or `node_modules`.