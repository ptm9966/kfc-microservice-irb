# Local Development and Cloudflare Testing - KFC Application

This guide covers local development and testing. For the current API Gateway and
Cloudflare Pages flow, use the **Docker Compose and Cloudflare Pages Testing**
section; the older manual service instructions below are retained for reference.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [MongoDB Local Setup](#mongodb-local-setup)
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
- **MongoDB Community Edition** (v7.0 or higher) - [Download](https://www.mongodb.com/try/download/community)
- **MongoDB Compass** (optional but recommended) - [Download](https://www.mongodb.com/products/tools/compass)
- **Docker Desktop** (for the current Docker Compose flow) - [Download](https://www.docker.com/products/docker-desktop/)
- A Cloudflare account with the `bikkam.online` zone (for testing a deployed Pages site)

### Verification:
Open PowerShell and verify the installations:

```powershell
node --version      # Should show v20.x.x or higher
npm --version       # Should show 10.x.x or higher
mongod --version    # Should show v7.0 or higher
```

---

## MongoDB Local Setup

### Step 1: Start MongoDB Service

MongoDB needs to be running before starting any backend service.

#### On Windows (Recommended):

1. **If MongoDB is installed as a Windows Service:**
   ```powershell
   # Start MongoDB service
   net start MongoDB
   
   # Stop MongoDB service (when needed)
   net stop MongoDB
   ```

2. **If running MongoDB manually:**
   ```powershell
   # Navigate to MongoDB installation bin directory and run
   mongod
   
   # Default: C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe
   ```

### Step 2: Create Databases

Open a new PowerShell window and connect to MongoDB:

```powershell
mongosh
```

In the MongoDB shell, run these commands to create the required databases:

```javascript
// Create main application database
use kfc-database
db.createCollection("products")
db.createCollection("carts")
db.createCollection("orders")
db.createCollection("users")

// Create orders microservice database
use orders-database
db.createCollection("orders")

// Create users microservice database
use users-database
db.createCollection("users")

// Create products microservice database
use products-database
db.createCollection("products")

// Exit MongoDB shell
exit
```

### Step 3: Verify MongoDB Connection

```powershell
mongosh
db.adminCommand({ ping: 1 })
# Should return { ok: 1 }
exit
```

---

## Backend Services Setup

The application consists of 4 backend services + 1 frontend. Each needs to be set up independently.

### Service Ports:
- **Backend (Main)**: Port 8080
- **Orders Microservice**: Port 8081
- **Users Microservice**: Port 8082
- **Products Microservice**: Port 8083
- **Frontend**: Port 3000

### For Each Service (Backend, OrdersMicroservice, ProductMicroservice, UserMicroservice):

#### Step 1: Navigate to Service Directory

```powershell
cd d:\PTM\PTMProjects\fullstack_application\dramatic-road-5348\Backend
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

**Backend/.env**
```env
NODE_ENV=development
PORT=8080
DB_URL=mongodb://localhost:27017/kfc-database
FRONTEND_URL=http://localhost:3000
```

**OrdersMicroservice/.env**
```env
NODE_ENV=development
PORT=8081
DB_URL=mongodb://localhost:27017/orders-database
```

**ProductMicroservice/.env**
```env
NODE_ENV=development
PORT=8083
DB_URL=mongodb://localhost:27017/products-database
```

**UserMicroservice/.env**
```env
NODE_ENV=development
PORT=8082
DB_URL=mongodb://localhost:27017/users-database
JWT_SECRET=your-super-secret-jwt-key-change-this-in-development
```

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
Express API Gateway. Use the steps below to test the full flow locally or with
a deployed Cloudflare Pages site.

### A. Start the API Gateway and services with Docker

Run these commands from the repository root. Starting `api-gateway` also
starts its dependent services and databases:

```powershell
docker compose up --build -d api-gateway
docker compose ps
curl.exe http://localhost:9000/health
```

The health request should return JSON with `"service":"api-gateway"`. To watch
startup logs:

```powershell
docker compose logs -f api-gateway users-service cart-service orders-service
```

Test that the Gateway routes by hostname. For example, a password login request
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

The API base paths in `Frontend/.env` should be:

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

For remote Pages testing, the API Gateway must be reachable at the public
Istio ingress IP. Build and push the Gateway and Cart images with the
repository's manual image-build workflow, then apply the Kubernetes manifests
using the steps in [ROUTING_GUIDE.md](./ROUTING_GUIDE.md).

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
✓ MongoDB connected
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
2. MongoDB service can be stopped with:
   ```powershell
   net stop MongoDB
   ```

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

### Issue: "MongoDB connection failed"

**Problem**: "Connection Error: connect ECONNREFUSED 127.0.0.1:27017"

**Solution**:
```powershell
# Start MongoDB service
net start MongoDB

# Or start MongoDB manually
mongod

# Verify MongoDB is running
mongosh
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
1. Ensure MongoDB is running
2. Verify .env file is correctly placed in each service directory
3. Check database names match between .env and MongoDB setup

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
REM Start MongoDB
echo Starting MongoDB...
net start MongoDB

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

### View MongoDB Data:

Using MongoDB Compass:
1. Open MongoDB Compass
2. Connect to `mongodb://localhost:27017`
3. Browse databases: `kfc-database`, `orders-database`, `users-database`, `products-database`

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
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Express.js Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)

---

**Last Updated**: 2026-07-22
