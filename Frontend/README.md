# KFC Frontend

This folder contains the Next.js storefront, built as static files for Cloudflare Pages. Cloudflare Pages Functions in `functions/` provide server-side Auth0 endpoints.

## Signup and Auth0 Flow

The email-first signup flow is:

1. The user opens `/login` and submits an email. `app/login/page.js` sends it to the Firestore Worker at `NEXT_PUBLIC_FIRESTORE_VALIDATION_URL/validate`.
2. The Worker in `../firestore-validation-worker/src/index.js` looks for that email in the Firestore `users` collection. If found, the frontend starts Auth0 login. If not found, it starts Auth0 signup by redirecting to `/authorize` with `screen_hint=signup`.
3. Auth0 displays its hosted signup screens. The custom screen source in `public/auth0-acul/` is intended for Auth0 Universal Login/ACUL configuration; these files are not Next.js routes and are not automatically used just because they are in `public/`.
4. The signup screen template is `public/auth0-acul/signup-id/index.html`, which loads `public/auth0-acul/assets/acul.js`. That script collects the signup profile and passes it to Auth0's ACUL signup manager. The password screen template is `public/auth0-acul/signup-password/index.html` and also loads `assets/acul.js`.
5. After Auth0 completes, it redirects to `/callback`. `app/callback/page.js` posts the authorization code to `/api/auth0/token`.
6. `functions/api/auth0/token.js` exchanges the code with Auth0, then sends the identity and available profile fields to the Worker's `/sync-user` endpoint. The Worker upserts the record in Firestore using the Auth0 subject as its document ID.

**Auth0 custom screen setup:** configure the Auth0 Universal Login/ACUL screens to use the templates and scripts in `public/auth0-acul/`. For deployment, ensure those static assets are available at the URLs referenced by the configured Auth0 screens. The `public/auth0-acul/signup-id.js` file is an alternate signup script; the checked-in `signup-id/index.html` currently loads `assets/acul.js`, not `signup-id.js`.

**Email prefill check:** `app/login/page.js` sends a new email in the `ext-email` parameter, while the currently referenced `assets/acul.js` reads `login_hint` when pre-filling its profile form. Check this parameter mapping in the Auth0 custom screen configuration/script if the email is blank on Auth0's signup screen.

The local `app/auth0-signup/page.js` is a separate profile form and is not the page reached by the `/login` email-first redirect. The regular `app/signup/page.js` is another separate flow: it posts credentials to the users microservice and does not use this Auth0-to-Firestore signup path.

If `NEXT_PUBLIC_AUTH0_DOMAIN`, `NEXT_PUBLIC_AUTH0_CLIENT_ID`, or `NEXT_PUBLIC_FIRESTORE_VALIDATION_URL` is missing, `/login` skips the email validation step and shows the regular mobile/password login form. `/signup` continues to use the users-service registration form; its Auth0 signup option is shown only when the Auth0 domain and client ID are configured.

===================== ******************** ======================= *********==================


## Requirements

- Node.js 20 or newer
- npm 10 or newer

Run all commands in this guide from `KFC_Micro_service/Frontend`.

## Local Setup

In PowerShell, from the repository root:

```powershell
Set-Location .\Frontend
npm install --legacy-peer-deps
Copy-Item .env.example .env
```

Edit `.env` and set the variables described below. Keep `.env` private; do not commit credentials.

### Next.js Development Server

```powershell
npm run dev
```

Open `http://localhost:3000`. This is useful for developing Next.js pages, but it does not run Cloudflare Pages Functions. The Auth0 callback endpoint at `/api/auth0/token` therefore will not be available in this mode.

### Cloudflare Pages Local Runtime

Use this to test the static export together with Pages Functions:

```powershell
npm run build
npx wrangler pages dev ./out --port 8788
```

Open `http://localhost:8788`. Wrangler serves the generated `out/` site and discovers the `functions/` directory. Stop the server with `Ctrl+C`.

## Deploy to Cloudflare Pages

The Next.js app is statically exported to `out/`; Cloudflare Pages serves those files and runs the endpoints in `functions/` as Pages Functions.

### Git-integrated deployment

1. Push the repository to GitHub or GitLab, then create a **Pages** project in the Cloudflare dashboard and connect the repository.
2. Set the project **Root directory** to `Frontend`.
3. Configure the build:

   | Setting | Value |
   | --- | --- |
   | Build command | `npm install --legacy-peer-deps && npm run build` |
   | Build output directory | `out` |
   | Node.js version | `20` (set `NODE_VERSION` to `20` if needed) |

4. Add the build-time variables below in **Settings → Environment variables** for both Production and Preview as appropriate. These values are used during the build; changing them requires a new deployment.

   - `CONTENTFUL_SPACE_ID`
   - `CONTENTFUL_ACCESS_TOKEN` (Content Delivery API read token)
   - `CONTENTFUL_ENVIRONMENT` (optional; defaults to `master`)
   - `CONTENTFUL_MENU_CONTENT_TYPE` (optional; defaults to `menuItem`)
   - `NEXT_PUBLIC_AUTH0_DOMAIN`
   - `NEXT_PUBLIC_AUTH0_CLIENT_ID`
   - `NEXT_PUBLIC_AUTH0_CALLBACK_URL` (optional; normally leave unset so the site origin is used)
   - `NEXT_PUBLIC_AUTH0_CONNECTION` (optional)
   - `NEXT_PUBLIC_FIRESTORE_VALIDATION_URL`
   - `NEXT_PUBLIC_USERS_API_URL` (set to `/api/users` when using the Pages proxy)
   - `NEXT_PUBLIC_CART_API_URL` (set to `/api/cart` when using the Pages proxy)
   - `NEXT_PUBLIC_ORDERS_API_URL` (set to `/api/orders` when using the Pages proxy)

   When using the Pages proxies, the frontend calls `/api/users`, `/api/cart`, and `/api/orders` on its own origin. The Pages Functions forward these paths to the corresponding Digital Experience API host: `users.arb-api.qa.bikkam.online`, `cart.arb-api.qa.bikkam.online`, and `orders.arb-api.qa.bikkam.online`. Istio sends all three hosts to the Digital Experience API, which dispatches internally to each service. Signup and login remain public; protected requests require a valid password-login token verified by Users. Cart records are scoped to that user, and the Cart service also verifies tokens itself. Orders continue to verify tokens through Users and return only that user's orders. Auth0 tokens are not supported for cart or order operations. Card and UPI payment processing is not integrated; the current payment page records a demo order and payment method. Do not use the local `localhost` values from `.env.example` in production.

5. Add these server-side bindings in the Pages project environment settings. Mark credentials as secrets; never use the `NEXT_PUBLIC_` prefix for them.

   - `AUTH0_DOMAIN`
   - `AUTH0_CLIENT_ID`
   - `AUTH0_CLIENT_SECRET`
   - `AUTH0_MGMT_CLIENT_ID`
   - `AUTH0_MGMT_CLIENT_SECRET`
   - `FIRESTORE_SYNC_URL`
   - `FIRESTORE_SYNC_SECRET`

6. Deploy. In the Auth0 application settings, add the deployed site's `https://<your-domain>/callback` to **Allowed Callback URLs**, and the site origin to **Allowed Web Origins**. Also configure any custom Auth0 screens to load their assets from the deployed site's `/auth0-acul/` paths. Confirm the Firestore Worker is deployed and has the matching sync secret.

### Direct upload from your local machine (no GitHub)

Use Wrangler to build and upload from your computer. Run these commands from `Frontend`:

```sh
npm install --legacy-peer-deps
npx wrangler login
npx wrangler pages project list
```

If `kfc-frontend-pages` does not exist yet, create a **Direct Upload** Pages project:

```sh
npx wrangler pages project create
```

When prompted, use `kfc-frontend-pages` as the project name. Before each deployment, set the build-time values in `.env` (including the `NEXT_PUBLIC_*` API URLs and Contentful values), then build and upload:

```sh
npm run build
npx wrangler pages deploy ./out --project-name kfc-frontend-pages
npx wrangler pages deploy ./out --project-name kfc-frontend-pages --branch main

```

The project name matches `name` in `wrangler.toml`. Run the deploy command from `Frontend`, where Wrangler can discover the `functions/` directory; this uploads the Pages Functions together with the static `out/` files. For a preview deployment, add `--branch preview`.

Configure production Pages Function bindings and secrets in the Cloudflare dashboard under the project's **Settings → Variables and Secrets**. `.dev.vars` is for local Wrangler testing only; it is not uploaded as production secrets. Do not use dashboard drag-and-drop for this project because it does not compile and deploy the `functions/` directory. See Cloudflare's [Direct Upload guide](https://developers.cloudflare.com/pages/get-started/direct-upload/) for more details.



################## ************* ################# ************** #######################

## Environment Variables

### Next.js and Contentful

These values are read during the Next.js build. Set them in `.env` before running `npm run build`.

| Variable | Purpose |
| --- | --- |
| `CONTENTFUL_SPACE_ID` | Contentful space containing the menu |
| `CONTENTFUL_ACCESS_TOKEN` | Token used to fetch menu content during build |
| `CONTENTFUL_ENVIRONMENT` | Contentful environment; defaults to `master` |
| `CONTENTFUL_MENU_CONTENT_TYPE` | Menu content type ID; defaults to `menuItem` |
| `NEXT_PUBLIC_AUTH0_DOMAIN` | Auth0 tenant or custom-domain hostname, without `https://` |
| `NEXT_PUBLIC_AUTH0_CLIENT_ID` | Auth0 application client ID; safe to include in browser code |
| `NEXT_PUBLIC_AUTH0_CALLBACK_URL` | Optional callback URL; otherwise the current site origin plus `/callback` is used |
| `NEXT_PUBLIC_AUTH0_CONNECTION` | Optional Auth0 connection name |
| `NEXT_PUBLIC_FIRESTORE_VALIDATION_URL` | Worker base URL used by the login email check |
| `NEXT_PUBLIC_USERS_API_URL` | Users service base URL for password-based login/signup; set to `/api/users` when using the Pages proxy |
| `NEXT_PUBLIC_CART_API_URL` | Cart service base URL; set to `/api/cart` when using the Pages proxy |
| `NEXT_PUBLIC_ORDERS_API_URL` | Orders service base URL; set to `/api/orders` when using the Pages proxy |

Use a **Content Delivery API (CDA) read token** for published content. The menu is fetched during the build, so changes in Contentful require a new build and deployment. Do not put Contentful management or preview tokens in `NEXT_PUBLIC_*` variables.

### Cloudflare Pages Function Bindings

Auth0 function secrets are server-side bindings, not `NEXT_PUBLIC_*` variables. For local Wrangler use, create `Frontend/.dev.vars` with the following keys and your own values:

```dotenv
AUTH0_DOMAIN=your-auth0-domain
AUTH0_CLIENT_ID=your-auth0-application-client-id
AUTH0_CLIENT_SECRET=your-auth0-application-client-secret
AUTH0_MGMT_CLIENT_ID=your-auth0-management-client-id
AUTH0_MGMT_CLIENT_SECRET=your-auth0-management-client-secret
FIRESTORE_SYNC_URL=https://your-worker.example.workers.dev
FIRESTORE_SYNC_SECRET=your-shared-sync-secret
USERS_SERVICE_HTTP_URL=http://users.arb-api.qa.bikkam.online
CART_SERVICE_HTTP_URL=http://cart.arb-api.qa.bikkam.online
ORDERS_SERVICE_HTTP_URL=http://orders.arb-api.qa.bikkam.online
```

Do not commit `.dev.vars`. In Cloudflare Pages project settings, set the build variables `NEXT_PUBLIC_USERS_API_URL=/api/users`, `NEXT_PUBLIC_CART_API_URL=/api/cart`, and `NEXT_PUBLIC_ORDERS_API_URL=/api/orders`. Add the three `*_SERVICE_HTTP_URL` values for the appropriate deployment environments. The Pages Functions proxy requests to the matching Digital Experience API host over HTTP, avoiding browser mixed-content blocking. The Cloudflare-to-origin leg is unencrypted until TLS is configured on the Istio ingress gateway; use this only for testing and configure HTTPS before handling real credentials. These URLs in `wrangler.toml` are non-secret defaults; set them in Cloudflare if they differ. Create proxied Cloudflare DNS records for all three API hosts pointing to the Istio ingress public IP, then apply the [Digital Experience API manifests](../.k8s/digital-exp-api/) and [Istio host configuration](../.k8s/app-gateway/app-gateway.yml) with the Users, Cart, and Orders VirtualServices. The Digital Experience API and Cart service need network access to the Users service for password-token verification.

The token endpoint exchanges the authorization code and syncs the profile to the Firestore Worker. The email check in the login page calls the configured validation Worker directly. The Worker must be running and configured with the matching sync secret for those flows to work.

### Auth0 Dashboard Setup

Configure the Auth0 application used by this frontend:

- Set the application domain and client ID in `.env` using `NEXT_PUBLIC_AUTH0_DOMAIN` and `NEXT_PUBLIC_AUTH0_CLIENT_ID`.
- Add `http://localhost:3000/callback` and `http://localhost:8788/callback` to **Allowed Callback URLs** for the local server modes you use.
- Add the matching local origins to **Allowed Web Origins**. Add the deployed site origin and callback URL for production.
- The `/api/auth0/token` Pages Function requires the Auth0 application client secret. Store it in `.dev.vars` locally and in Cloudflare Pages secrets for deployment.
- The `/api/auth0/check-email` Pages Function requires a separate Machine-to-Machine application authorized for the Auth0 Management API with permission to read users (for example, `read:users`). Keep its client ID and secret server-side.
- If using Auth0's `firebase-database` connection, set `NEXT_PUBLIC_AUTH0_CONNECTION` to that connection name and ensure the connection is enabled for the Auth0 application.

After changing any `NEXT_PUBLIC_*` setting, rebuild the app because these values are embedded into the generated frontend bundle.

## Useful Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start Next.js development server on port 3000 |
| `npm run build` | Build and statically export the site |
| `npm run start` | Serve the built export and Cloudflare Pages Functions locally (run `npm run build` first) |
| `npx wrangler pages dev ./out --port 8788` | Serve the export and Cloudflare Pages Functions locally on port 8788 |
| `npm test` | Run the configured test placeholder (no frontend unit suite is currently set up) |

## Folder Guide

| Path | Purpose |
| --- | --- |
| `app/` | Next.js routes and page UI: home, menu, login, signup, callback, cart, and checkout |
| `components/` | Shared frontend components such as the site shell |
| `functions/api/auth0/` | Cloudflare Pages Function endpoints for Auth0 code exchange and email lookup |
| `functions/api/users/` | Same-origin proxy from the frontend to the Users service |
| `functions/api/cart/` | Same-origin proxy from the frontend to the Cart service |
| `functions/api/orders/` | Same-origin proxy from the frontend to the Orders service |
| `lib/contentful.js` | Contentful menu/category fetching and data normalization during build |
| `lib/orders.js` | Authenticated order creation and retrieval from the Orders microservice |
| `public/` | Static images, icons, and other assets copied to the site |
| `wrangler.toml` | Cloudflare Pages project name, build output directory, compatibility date, and local variables |
| `.env.example` | Template for frontend/build-time configuration; copy to `.env` |
| `.dev.vars` | Local-only Cloudflare Function secrets; create locally and never commit |
| `.next/`, `out/`, `node_modules/` | Generated build output and installed dependencies; do not edit or commit |

The old Create React App source and Docker/Nginx packaging files have been removed. The active frontend is the Next.js application in `app/`.