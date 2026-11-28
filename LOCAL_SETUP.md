# Local Development and Cloudflare Testing - KFC Application

This guide covers local development and testing. For the current Digital
Experience API and Cloudflare Pages flow, use the **Docker Compose and
Cloudflare Pages Testing** section.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [SQL Server Local Setup](#sql-server-local-setup)
3. [Backend Services Setup](#backend-services-setup)
4. [Frontend Setup](#frontend-setup)
5. [Docker Compose and Cloudflare Pages Testing](#docker-compose-and-cloudflare-pages-testing)
6. [Running All Services](#running-all-services)
7. [API Documentation](#api-documentation)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have the following installed on your system:

### Required Software:
- **Node.js** (v20.0.0 or higher) - [Download](https://nodejs.org/)
- **npm** (v10.0.0 or higher) - Comes with Node.js
- **Docker Desktop** (for the current Docker Compose flow) - [Download](https://www.docker.com/products/docker-desktop/)
- A Cloudflare account with the `bikkam.online` zone (for testing a deployed Pages site)

### Verification:
Open PowerShell and verify the installations:

```powershell
node --version      # Should show v20.x.x or higher
npm --version       # Should show 10.x.x or higher
```

---

## SQL Server Local Setup

Users, Orders, Cart, and Products share the local SQL Server container, but use
separate databases (`users-database`, `orders-database`, `cart-database`, and
`products-database`). From the repository root, copy `.env.example` to `.env`
and set `USERS_SQL_SA_PASSWORD` to the password for the shared SQL Server. If
reusing the existing `kfc_sql_data` volume, keep its current password; for a
new local database, use a strong local-only password. Then start the SQL
container and services:

```powershell
Copy-Item .env.example .env
docker compose up --build -d kfc-sql-server users-service orders-service cart-service products-service
```

Compose creates each database and its schema on startup. The services use
production-style images without source or `node_modules` bind mounts; rebuild
after code or dependency changes. Existing MongoDB carts, orders, and product
catalog data are not migrated. The new products database starts empty.

For running a service directly on the host, use `SQL_SERVER=localhost`,
`SQL_PORT=14330`, `SQL_USER=sa`, and the same password from the root `.env`.
Set `SQL_CREATE_DATABASE=true` and `SQL_AUTO_CREATE_SCHEMA=true` for local
development. Microsoft SQL Server Linux containers are supported on x86-64,
not ARM64 Macs; on ARM64, use an x86-64 host or a separate non-production Azure
SQL database. Do not remove the `kfc_sql_data` volume when restarting Compose;
the Product database is created empty and existing MongoDB catalog data is not
imported.

---

## Backend Services Setup

The application consists of 4 backend services + 1 frontend. Each needs to be set up independently.

### Service Ports:
- **Cart Microservice**: Port 8080
- **Orders Microservice**: Port 8081
- **Users Microservice**: Port 8082
- **Products Microservice**: Port 8083
- **Frontend**: Port 3000

### For Each Service (cartMicroservice, OrdersMicroservice, ProductMicroservice, UserMicroservice):

#### Step 1: Navigate to Service Directory

```powershell
cd d:\PTM\PTMProjects\fullstack_application\dramatic-road-5348\cartMicroservice
# or
cd d:\PTM\PTMProjects\fullstack_application\dramatic-road-5348\OrdersMicroservice
# or
cd d:\PTM\PTMProjects\fullstack_application\dramatic-road-5348\ProductMicroservice
# or
cd d:\PTM\PTMProjects\fullstack_application\dramatic-road-5348\UserMicroservice
```

#### Step 2: Install Dependencies

```powershell
npm install
```

#### Step 3: Create .env File

In each service directory, create a `.env` file with the appropriate configuration:

**cartMicroservice/.env**
```env
NODE_ENV=development
PORT=8080
SQL_SERVER=localhost
SQL_PORT=14330
SQL_DATABASE=cart-database
SQL_USER=sa
SQL_PASSWORD=REPLACE_WITH_THE_ROOT_ENV_SQL_PASSWORD
SQL_ENCRYPT=false
SQL_TRUST_SERVER_CERTIFICATE=true
SQL_CREATE_DATABASE=true
SQL_AUTO_CREATE_SCHEMA=true
USERS_SERVICE_URL=http://localhost:8082
```

**OrdersMicroservice/.env**
```env
NODE_ENV=development
PORT=8081
SQL_SERVER=localhost
SQL_PORT=14330
SQL_DATABASE=orders-database
SQL_USER=sa
SQL_PASSWORD=REPLACE_WITH_THE_ROOT_ENV_SQL_PASSWORD
SQL_ENCRYPT=false
SQL_TRUST_SERVER_CERTIFICATE=true
SQL_CREATE_DATABASE=true
SQL_AUTO_CREATE_SCHEMA=true
USERS_SERVICE_URL=http://localhost:8082
```

**ProductMicroservice/.env**
```env
NODE_ENV=development
PORT=8083
SQL_SERVER=localhost
SQL_PORT=14330
SQL_DATABASE=products-database
SQL_USER=sa
SQL_PASSWORD=REPLACE_WITH_THE_ROOT_ENV_SQL_PASSWORD
SQL_ENCRYPT=false
SQL_TRUST_SERVER_CERTIFICATE=true
SQL_CREATE_DATABASE=true
SQL_AUTO_CREATE_SCHEMA=true
```

**UserMicroservice/.env**
```env
NODE_ENV=development
PORT=8082
SQL_SERVER=localhost
SQL_PORT=14330
SQL_DATABASE=users-database
SQL_USER=sa
SQL_PASSWORD=REPLACE_WITH_A_STRONG_LOCAL_PASSWORD
SQL_ENCRYPT=false
SQL_TRUST_SERVER_CERTIFICATE=true
SQL_CREATE_DATABASE=true
SQL_AUTO_CREATE_SCHEMA=true
JWT_SECRET=your-super-secret-jwt-key-change-this-in-development
```

All active microservices use SQL Server.
For local Docker Compose, copy the root
`.env.example` to `.env`, replace the placeholder with a strong local-only
password, then run `docker compose up --build -d kfc-sql-server users-service orders-service cart-service products-service`
from the repository root. If starting any SQL-backed service directly, set
`SQL_PASSWORD` in its `.env` to the same local SQL password.
Compose creates a local development database and schema. For AKS, replace the
placeholders in the SQL Server and service Secret manifests, apply
service Secrets first, then apply the SQL Server resources in dependency order
and wait for the bootstrap Job before applying the service Deployments:

When upgrading a cluster that already has the SQL Server StatefulSet, stop and
remove it before creating the Deployment. Its PVC is retained and reused by the
Deployment:

```powershell
kubectl scale statefulset/kfc-sql-server --replicas=0 -n domain-services-v3
kubectl delete statefulset/kfc-sql-server -n domain-services-v3
kubectl delete service/kfc-sql-server-headless -n domain-services-v3 --ignore-not-found
```

```powershell
kubectl apply -f .k8s/order-service/namespace.yml
kubectl apply -f .k8s/user-service/secret.yml
kubectl apply -f .k8s/order-service/secret.yml
kubectl apply -f .k8s/cart-service/secret.yml
kubectl apply -f .k8s/sql-server/secret.yml
kubectl apply -f .k8s/sql-server/service.yml
kubectl apply -f .k8s/sql-server/storageclass.yml
# For a fresh install only; skip if this PVC already exists and is Bound.
kubectl apply -f .k8s/sql-server/persistent-volume-claim.yml
kubectl apply -f .k8s/sql-server/deployment.yml
kubectl apply -f .k8s/sql-server/configmap.yml
kubectl apply -f .k8s/sql-server/job.yml
kubectl wait --for=condition=complete job/kfc-sql-server-bootstrap -n domain-services-v3 --timeout=15m
```

Use distinct strong URL-safe passwords in the service Secrets. The manifest
creates four databases and dedicated logins for User, Orders, and Cart; those
services create their schemas on startup. The products database starts empty;
there is currently no Product AKS Deployment in this repository. SQL Server
Developer edition is for development/testing, not production. Existing
MongoDB users, orders, cart items, and product data are not migrated.

The SQL Server StorageClass uses the AKS Azure Disk CSI driver. Its `Retain`
reclaim policy keeps the disk if the claim is deleted. A PVC's StorageClass
cannot be changed after it is bound: when upgrading an existing SQL Server
installation, keep and reuse its existing PVC instead of applying the updated
PVC manifest. The StorageClass applies to newly provisioned claims.

Both services run from built images without source or dependency bind mounts.
Rebuild after changing code or dependencies:

```bash
docker compose up --build --force-recreate -d users-service orders-service cart-service products-service
docker compose logs -f users-service orders-service cart-service products-service
```

Microsoft SQL Server Linux containers are supported on x86-64, not ARM64
Macs. On an ARM64 development machine, use a separate non-production Azure
SQL database when running these services locally, or use an x86-64 host for
the local Compose database. Never use the production database for local tests.

---

## Frontend Setup

### Step 1: Navigate to Frontend Directory

```powershell
cd d:\PTM\PTMProjects\fullstack_application\dramatic-road-5348\Frontend
```

### Step 2: Install Dependencies

```powershell
npm install
```

### Step 3: Create/Update Environment Configuration

Check if `Frontend/src/config/api.js` exists. If not, create it:

**Frontend/src/config/api.js**
```javascript
// API endpoints for local development
export const API_BASE_URL = 'http://localhost:8080';
export const ORDERS_API_URL = 'http://localhost:8081';
export const USERS_API_URL = 'http://localhost:8082';
export const PRODUCTS_API_URL = 'http://localhost:8083';
```

------------ ********** --------------- *********** ---------- ***** --------------

## Docker Compose and Cloudflare Pages Testing

The current frontend is a static Next.js site with Cloudflare Pages Functions.
The Functions call three service hostnames, and Istio sends all three to the
Digital Experience API (the Express API gateway). Use the steps below to test
the full flow locally or with
a deployed Cloudflare Pages site.

### A. Start the Digital Experience API and services with Docker

Run these commands from the repository root. Starting `digital-exp-api` also
starts its dependent services and databases:

```powershell
docker compose up --build -d digital-exp-api
docker compose ps
curl.exe http://localhost:9000/health
```

The health request should return JSON with `"service":"digital-exp-api"`. To watch
startup logs:

```powershell
docker compose logs -f digital-exp-api users-service cart-service orders-service
```

Test that the Digital Experience API routes by hostname. For example, a password login request
can be sent directly to the Gateway with the Users host:

```powershell
curl.exe -i http://localhost:9000/auth/login `
  -H "Host: users.arb-api.qa.bikkam.online" `
  -H "Content-Type: application/json" `
  --data '{"mobile":"YOUR_TEST_MOBILE","password":"YOUR_TEST_PASSWORD"}'
```

Use the returned token to test the authenticated Cart host:

```powershell
curl.exe -i http://localhost:9000/api/cart `
  -H "Host: cart.arb-api.qa.bikkam.online" `
  -H "Authorization: Bearer YOUR_TEST_TOKEN"
```

### B. Run Cloudflare Pages Functions locally against Docker

The frontend API base paths in `Frontend/.env` should be:

```dotenv
NEXT_PUBLIC_USERS_API_URL=/api/users
NEXT_PUBLIC_CART_API_URL=/api/cart
NEXT_PUBLIC_ORDERS_API_URL=/api/orders
```

They are same-origin paths; don't replace them with the service hostnames.
Append the following bindings to `Frontend/.dev.vars`. If that file already
contains values, preserve them and add only these three lines:

```dotenv
USERS_SERVICE_HTTP_URL=http://users.arb-api.qa.bikkam.online:9000
CART_SERVICE_HTTP_URL=http://cart.arb-api.qa.bikkam.online:9000
ORDERS_SERVICE_HTTP_URL=http://orders.arb-api.qa.bikkam.online:9000
```

These `:9000` values are for local testing only. Add a local hostname override
so Wrangler resolves the three names to your computer:

**Windows**

1. Open Notepad using **Run as administrator**.
2. Open `%SystemRoot%\System32\drivers\etc\hosts` (choose **All files** if the
   file isn't shown).
3. Add this line and save:

   ```text
   127.0.0.1 users.arb-api.qa.bikkam.online cart.arb-api.qa.bikkam.online orders.arb-api.qa.bikkam.online
   ```

4. In PowerShell, refresh the DNS cache:

   ```powershell
   ipconfig /flushdns
   ```

**macOS or Linux**

1. Check that the hostnames aren't already listed, to avoid duplicate entries:

   ```bash
   grep -F 'users.arb-api.qa.bikkam.online' /etc/hosts
   ```

2. If the command prints no matching line, append the mapping with a quoted
   here-document:

   ```bash


sudo tee -a /etc/hosts <<EOF
127.0.0.1 users.arb-api.qa.bikkam.online cart.arb-api.qa.bikkam.online orders.arb-api.qa.bikkam.online
EOF

   ```

3. On macOS, refresh the DNS cache if the names don't resolve:

   ```bash
   sudo dscacheutil -flushcache
   ```

From `Frontend/`, build the static site and start the local Pages runtime:

```powershell
npm install --legacy-peer-deps
npm run build
npx wrangler pages dev ./out --port 8788
```

Open `http://localhost:8788`. Sign up or log in with a test account, then try
the Cart and Orders flows. Wrangler reads `Frontend/.dev.vars` for the
server-side Function bindings. If those names don't resolve to `127.0.0.1`,
the Functions may reach the public DNS records instead of your local Gateway.
Remove the hosts-file line after local testing.

> **Important:** `/etc/hosts` affects only the computer where you edit it. It
> does not create Cloudflare DNS records and cannot make a remote Cloudflare
> Pages deployment reach Docker running on your computer.

### C. Configure Cloudflare for a deployed Pages site

For remote Pages testing, the Digital Experience API must be reachable at the public
Istio ingress IP. Build and push the Gateway and Cart images with the
repository's manual image-build workflow, then apply the Kubernetes manifests
using the steps in [ROUTING_GUIDE.md](./ROUTING_GUIDE.md).

These public Istio ingress instructions describe the current QA setup. The
planned private-ingress and Application Gateway design is documented below;
do not switch Istio to a private IP until the Application Gateway path is
ready, or remote Cloudflare Pages requests will lose access to the APIs.

#### Add the API DNS records

In the Cloudflare dashboard:

1. Select the `bikkam.online` zone and open **DNS → Records**.
2. Add three **A** records. Set **IPv4 address** to the public IP of the
   Istio ingress gateway and turn **Proxy status** on (orange cloud):

   | Name | Type | IPv4 address |
   | --- | --- | --- |
   | `users.arb-api.qa` | A | `<ISTIO_INGRESS_PUBLIC_IP>` |
   | `cart.arb-api.qa` | A | `<ISTIO_INGRESS_PUBLIC_IP>` |
   | `orders.arb-api.qa` | A | `<ISTIO_INGRESS_PUBLIC_IP>` |

   Cloudflare appends `.bikkam.online`, producing the hostnames used by the
   Gateway. Use **Auto** TTL.

#### Add the Pages build and Function variables

In **Workers & Pages → your Pages project → Settings → Variables and Secrets**,
configure the Production environment (and Preview if you test Preview builds):

**Build-time variables**

```dotenv
NEXT_PUBLIC_USERS_API_URL=/api/users
NEXT_PUBLIC_CART_API_URL=/api/cart
NEXT_PUBLIC_ORDERS_API_URL=/api/orders
```

**Pages Function runtime variables**

```dotenv
USERS_SERVICE_HTTP_URL=http://users.arb-api.qa.bikkam.online
CART_SERVICE_HTTP_URL=http://cart.arb-api.qa.bikkam.online
ORDERS_SERVICE_HTTP_URL=http://orders.arb-api.qa.bikkam.online
```

Save the variables and redeploy Pages so the build-time values are included in
the static site. Keep the `NEXT_PUBLIC_*` values as paths; the Functions use
the runtime variables to select the service host.

The checked-in Istio Gateway currently accepts HTTP on port 80 only. The
runtime URLs above are therefore for QA testing, and the Cloudflare-to-origin
connection is unencrypted. Use test accounts and data only. Configure an HTTPS
listener and origin certificate before sending real credentials; the Pages
proxy currently accepts only HTTP origins.

To test the deployed setup, open the Pages URL and sign in, or request an API
through its same-origin Function path, such as
`https://<YOUR_PAGES_DOMAIN>/api/users/auth/login`. A timeout or Cloudflare
522 indicates that Cloudflare cannot reach the origin; verify the ingress IP,
DNS proxy status, and Azure inbound TCP/80 access.

### Planned target: private Istio ingress and Azure Private DNS

> **Plan only:** this target has not been applied. The current QA setup above
> still uses a publicly reachable Istio ingress IP.

The target keeps the existing host-based API routing while moving Istio behind
a private Azure Load Balancer. Cloudflare Pages remains outside the AKS VNet,
so its public requests must reach the future Application Gateway; it cannot
resolve or connect to Azure Private DNS or the Istio private IP directly.

1. **Inspect the AKS/Istio installation before changing it.** Determine whether
   the ingress gateway is managed by the AKS Istio add-on or installed with
   `istioctl`. Record its Service configuration, AKS VNet/subnet, current
   ingress IP, and any consumers. Select an available private IP from the
   correct subnet if a stable address is required.
2. **Make the Istio ingress gateway internal.** Configure the
   `istio-ingressgateway` LoadBalancer Service with the AKS internal-load-
   balancer annotation (and the selected private IP, if using a static one).
   Verify that Azure assigns a private IP and that the existing Istio Gateway
   and VirtualServices still route the `users`, `cart`, and `orders` hosts to
   the Digital Experience API. This change can interrupt ingress; keep a rollback
   plan and schedule a maintenance window.
3. **Create split-horizon private DNS.** Create an Azure Private DNS zone named
   `arb-api.qa.bikkam.online`, link it to the AKS VNet and any VNet where
   private clients need resolution, and add `users`, `cart`, and `orders` A
   records pointing to the Istio private IP. From linked VNets, each service
   hostname will resolve directly to Istio while retaining its Host header.
4. **Prepare the public Cloudflare-to-Application-Gateway path.** In the
   existing `bikkam.online` Cloudflare zone, use one wildcard record named
   `*.arb-api.qa` pointing to the Application Gateway's public IP or DNS name.
   This covers the three existing service hostnames; do not point this public
   record at the private Istio IP. Configure the Application Gateway to forward
   to Istio and preserve the original service hostname for Istio host routing.
   Complete this path before making the Istio ingress private.
5. **Validate and update operational docs.** Test private DNS and each service
   hostname from inside linked VNets, then test Cloudflare Pages through the
   Application Gateway. After the cutover succeeds, replace the current public
   Istio DNS instructions above with the final Application Gateway and TLS
   settings. Keep the old public route available until rollback is no longer
   needed.

---

## Running All Services

### Recommended: Use Multiple Terminal Windows/Tabs

Open **5 separate PowerShell terminals** in your project root directory:

**Terminal 1 - Start Backend:**
```powershell
cd Backend
npm start
# Output: Backend listening at http://localhost:8080
```

**Terminal 2 - Start Orders Microservice:**
```powershell
cd OrdersMicroservice
npm start
# Output: Orders Microservice listening at http://localhost:8081
```

**Terminal 3 - Start Products Microservice:**
```powershell
cd ProductMicroservice
npm start
# Output: Product Microservice listening at http://localhost:8083
```

**Terminal 4 - Start Users Microservice:**
```powershell
cd UserMicroservice
npm start
# Output: User Microservice listening at http://localhost:8082
```

**Terminal 5 - Start Frontend:**
```powershell
cd Frontend
npm start
# Browser will automatically open at http://localhost:3000
```

### Alternative: Using Development Mode (with auto-reload)

If you want auto-reload on file changes, use `npm run dev` (requires nodemon):

```powershell
# In Backend terminal
npm run dev

# In Microservice terminals
npm run dev
```

### Expected Output

When all services are running successfully:

```
✓ Backend listening at http://localhost:8080
✓ Orders Microservice listening at http://localhost:8081
✓ Product Microservice listening at http://localhost:8083
✓ User Microservice listening at http://localhost:8082
✓ Frontend running at http://localhost:3000
```

---

## API Documentation

Once services are running, access the Swagger documentation:

- **Backend API Docs**: http://localhost:8080/api-docs
- **Orders Microservice Docs**: http://localhost:8081/api-docs
- **Products Microservice Docs**: http://localhost:8083/api-docs
- **Users Microservice Docs**: http://localhost:8082/api-docs

---

## Stopping All Services

### To Stop:

1. Press `Ctrl + C` in each terminal window to stop the service
---

## Troubleshooting

### Issue: "Port already in use"

**Problem**: Error like "Address already in use :::8080"

**Solution**:
```powershell
# Find process using the port (example: 8080)
Get-NetTCPConnection -LocalPort 8080

# Kill the process
Stop-Process -Id <PID> -Force

# Or change the PORT in .env file
PORT=8085
```

### Issue: SQL Server connection failed

**Problem**: The service cannot connect to the configured SQL Server.

**Solution**:
```powershell
# Check that the SQL Server container is running and healthy
docker compose ps kfc-sql-server
docker compose logs kfc-sql-server
```

### Issue: "Cannot find module"

**Problem**: Error during npm start

**Solution**:
```powershell
# Delete node_modules and reinstall
rm -r node_modules
npm install
```

### Issue: "Unexpected token in JSON at position 0"

**Problem**: Database connection or API call issue

**Solution**:
1. Verify the service's SQL Server environment variables
2. Confirm the configured database name is correct
3. Check that the SQL Server container is healthy

### Issue: Frontend cannot connect to Backend

**Problem**: API requests fail with CORS error or connection refused

**Solution**:
1. Verify all backend services are running
2. Check API endpoints in `Frontend/src/config/api.js`
3. Ensure `FRONTEND_URL` in Backend/.env is set to `http://localhost:3000`
4. Ensure CORS is enabled in backend (check `app.use(cors())`)

### Issue: npm install fails

**Problem**: Installation hangs or fails

**Solution**:
```powershell
# Clear npm cache
npm cache clean --force

# Try installing again
npm install

# If still fails, try with legacy peer deps
npm install --legacy-peer-deps
```

---

## Quick Start Script (Optional)

Create a `start-local.bat` file in the root directory for easier startup:

```batch
@echo off
REM Start each service in a new window
echo Starting Backend...
start cmd /k "cd Backend && npm start"

echo Starting Orders Microservice...
start cmd /k "cd OrdersMicroservice && npm start"

echo Starting Products Microservice...
start cmd /k "cd ProductMicroservice && npm start"

echo Starting Users Microservice...
start cmd /k "cd UserMicroservice && npm start"

echo Starting Frontend...
start cmd /k "cd Frontend && npm start"

echo All services are starting...
```

Run this file from PowerShell:
```powershell
.\start-local.bat
```

---

## Development Notes

- **Backend** handles main product and cart routes
- **Orders Microservice** manages order operations
- **Users Microservice** handles authentication and user management
- **Products Microservice** manages product data separately
- **Frontend** is a React application consuming all backend APIs

---

## Monitoring & Debugging

### Check Service Health:

```powershell
# Test each endpoint
curl http://localhost:8080/api-docs
curl http://localhost:8081/api-docs
curl http://localhost:8082/api-docs
curl http://localhost:8083/api-docs
curl http://localhost:3000
```

### View SQL Server Data:

Connect using SQL Server Management Studio or Azure Data Studio to
`localhost,14330`, then select the database for the service you are inspecting.

### Debug with Node Inspector:

```powershell
# In any service directory
node --inspect index.js

# Then open: chrome://inspect in Chrome
```

---

## Support & Documentation

For issues or more information, refer to:
- [Node.js Documentation](https://nodejs.org/docs/)
- [Express.js Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)

---

**Last Updated**: 2026-07-22
