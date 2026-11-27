# Product Microservice

A dedicated microservice for managing KFC product catalog and inventory.

## Features

- Product CRUD operations (Create, Read, Update, Delete)
- Product search by title
- Product filtering by category
- Swagger API documentation
- SQL Server integration
- Docker containerization

The service uses a separate `products-database` SQL Server database. It starts
with an empty catalog; existing MongoDB products are not imported or seeded.

## API Endpoints

### Products
- `GET /api/product` - Get all products or filter by category
- `GET /api/product/search?q={query}` - Search products by title
- `GET /api/product/{productId}` - Get product by ID
- `POST /api/product` - Create new product
- `PATCH /api/product/{productId}` - Update product
- `DELETE /api/product/{productId}` - Delete product

### Documentation
- `GET /api-docs` - Swagger API documentation

## Environment Variables

- `PORT` - Server port (default: 8083)
- `SQL_SERVER` - SQL Server hostname
- `SQL_PORT` - SQL Server port (default: 1433)
- `SQL_DATABASE` - Database name (use `products-database`)
- `SQL_USER` - SQL Server login
- `SQL_PASSWORD` - SQL Server password
- `SQL_ENCRYPT` - Enable encrypted SQL connections (default: true)
- `SQL_TRUST_SERVER_CERTIFICATE` - Trust the server certificate (default: false)
- `SQL_CREATE_DATABASE` - Create the database if missing (local development only)
- `SQL_AUTO_CREATE_SCHEMA` - Create the product table/indexes if missing (local development only)

## Running the Service

### Development
```bash
npm install
npm run dev
```

`npm start` waits for a successful SQL Server connection before listening.
`GET /health` checks the database connection.

### Production
```bash
npm install --production
npm start
```

### Docker
Use the repository's Docker Compose configuration to start the shared SQL
Server and the service with the correct network settings:

```bash
docker compose up --build -d kfc-sql-server products-service
```

The service does not include MongoDB seed data; add catalog items through
`POST /api/product`.