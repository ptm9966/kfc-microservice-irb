# Orders Microservice

This is the Orders microservice for the KFC fullstack application. It handles order creation, retrieval, and status updates.

## Features

- Create orders from cart items
- Retrieve the authenticated user's orders
- Get specific order details
- Update order status
- Separate MongoDB database for orders

## API Endpoints

### GET /api/orders
Retrieve only the authenticated user's orders. Send the session token in the `Authorization: Bearer <token>` header. Any `userId` query parameter is ignored.

The service asks the Users Microservice to verify the password-login token. Order ownership is derived from the verified user record, never from a caller-supplied user ID. Auth0 tokens are not supported for order history yet.

### GET /api/orders/{orderId}
Retrieve a specific order by ID. The authenticated user must own the order.

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
Update the status of an order.

**Request Body:**
```json
{
  "status": "string"
}
```

## Environment Variables

- `PORT`: Port for the service (default: 8081)
- `DB_URL`: MongoDB connection URL for orders database
- `USERS_SERVICE_URL`: Users Microservice base URL reachable from the Orders service (default: `http://localhost:8082`)

In Docker Compose, use the internal URL `http://users-service:8082`. The order-history endpoint currently supports password-login tokens only; Auth0 token support is not enabled.

## Running the Service

```bash
npm install
npm start
```

## Docker

The service includes a Dockerfile for containerization and is configured in the main docker-compose.yml file.