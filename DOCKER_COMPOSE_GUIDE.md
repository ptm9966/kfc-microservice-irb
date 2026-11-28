# Docker Compose Setup Guide

The root Compose file starts the microservices, Digital Experience API, and
shared local SQL Server. The Frontend is started separately.

## Prerequisites

- Docker Desktop or Docker Engine with Docker Compose v2
- An x86-64 host for the local SQL Server container

Check that Compose is available:

```bash
docker compose version
```

## Start the services

From the repository root:

```bash
docker compose up --build -d
docker compose ps
```

Compose starts the shared SQL Server and the Cart, Orders, Users, Products, and
Digital Experience API service. The services use separate databases on the SQL Server:
`cart-database`, `orders-database`, `users-database`, and `products-database`.
The Product database starts empty.

## Service endpoints

- Cart API and docs: http://localhost:8080
- Orders API and docs: http://localhost:8081
- Users API and docs: http://localhost:8082
- Products API and docs: http://localhost:8083
- Digital Experience API: http://localhost:9000
- SQL Server: `localhost,14330`

## Logs and shutdown

```bash
docker compose logs -f
docker compose logs -f products-service
docker compose down
```

The SQL Server data is stored in the `kfc_sql_data` volume and is preserved by
`docker compose down`. Avoid `docker compose down -v` unless you intend to
delete the local databases.

## Database notes

The Product service creates its schema on startup in the local Compose
configuration. Existing catalog data is not imported.
