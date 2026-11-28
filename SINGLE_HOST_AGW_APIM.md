# Single-host API routing migration plan

> This plan describes an APIM-included target architecture. The current QA
> configuration described by the user routes Application Gateway directly to
> the private `digital-exp-api` DNS record and therefore bypasses APIM. For
> those steps, use
> [SINGLE_HOST_CLOUDFLARE_APP_GATEWAY.md](./SINGLE_HOST_CLOUDFLARE_APP_GATEWAY.md).

## Goal

Expose the backend to the frontend through one public hostname:

```text
https://arb-api.qa.bikkam.online
```

Replace the `users`, `cart`, and `orders` subdomains and wildcard DNS
dependency with one exact DNS hostname. Keep the existing frontend API paths
so this migration does not require redesigning the browser-facing API:

| Frontend path | Backend service | Path sent to service |
| --- | --- | --- |
| `/api/users/auth/*` | Users | Remove `/api/users`; forward the remaining path |
| `/api/users/api/*` | Users | Remove `/api/users`; forward the remaining path |
| `/api/cart/*` | Cart | Preserve the full path |
| `/api/orders/*` | Orders | Preserve the full path |

For example, `/api/users/auth/login` is forwarded to Users as
`/auth/login`, while `/api/cart` and `/api/orders` paths are forwarded
unchanged. Confirm the full set of frontend requests against the service route
definitions before implementing the path contract.

## Proposed request flow

```text
Browser
  → Cloudflare Pages frontend
  → Pages Function (/api/users, /api/cart, or /api/orders)
  → https://arb-api.qa.bikkam.online/<matching API path>
  → Cloudflare DNS
  → Application Gateway exact-host HTTPS listener
  → Application Gateway backend pool → Azure API Management (APIM)
  → APIM backend hostname (private DNS → Istio private IP)
  → Istio Gateway / VirtualService
  → Digital Experience API
  → Users, Cart, or Orders ClusterIP Service
```

Cloudflare has one public API record. The service-specific DNS names, if
created, belong only in Azure Private DNS and are not frontend endpoints. The
Digital Experience API selects the internal service from the request path.
Keep service-to-service calls on Kubernetes DNS.

## Step-by-step plan

1. **Confirm the path contract.** Keep the browser-facing URLs
   `/api/users`, `/api/cart`, and `/api/orders`. Confirm methods, query
   strings, and all route suffixes. The Users Pages Function must preserve the
   `/api/users` prefix so APIM and the Digital Experience API can identify the
   service.
2. **Create the private DNS zone.** In Azure Private DNS, use
   `arb-api.qa.bikkam.online` and link it to the APIM and AKS VNets (and any
   required client VNets). Create A records for `digital-exp-api`, `users`,
   `cart`, and `orders`, all pointing to the Istio private LoadBalancer IP.
   These are private-only records; do not create public Cloudflare records
   for each service. Keep Kubernetes workloads on Kubernetes Service DNS.
3. **Prepare Istio.** Keep the existing `users`, `cart`, and `orders`
   VirtualServices for their private aliases. Add the exact
   `digital-exp-api.arb-api.qa.bikkam.online` host to the Istio Gateway and a
   VirtualService (in `.k8s/digital-exp-api/virtual-service.yml`) routing it to
   the Digital Experience API. Verify that the
   APIM-to-Istio request preserves this backend host. Use a certificate and
   HTTPS for this hop if TLS is enabled; otherwise restrict it to the
   protected private network for QA. Use the `digital-exp-api` alias and
   Kubernetes Service name consistently.
4. **Configure API Management.** Create an APIM backend using
   `digital-exp-api.arb-api.qa.bikkam.online`; verify that DNS from APIM
   resolves it to the Istio private IP and that APIM can reach the Istio
   listener.
   Configure API/policy routes to preserve the `/api/users`, `/api/cart`, and
   `/api/orders` paths, methods, query strings, bodies, and authorization
   headers. Configure certificate validation/SNI for HTTPS; do not disable
   certificate validation as a shortcut.
5. **Add path dispatch to the Digital Experience API.** Route `/api/users`,
   `/api/cart`, and `/api/orders` prefixes to their internal Kubernetes
   Services. Strip `/api/users` before forwarding to Users; preserve the
   Cart and Orders paths. Preserve existing authentication and authorization
   behavior. Return an explicit not-found response for unknown API paths.
6. **Configure Application Gateway.** Add one HTTPS multi-site listener for
   the exact hostname `arb-api.qa.bikkam.online`. Set its backend pool to the
   APIM gateway endpoint, not directly to the Istio IP. Configure the backend
   HTTP setting, host/SNI behavior, probe, and routing rule to match APIM's
   configured hostname and certificate. Confirm Application Gateway can
   reach APIM.
7. **Configure public DNS and TLS.** In the Cloudflare `bikkam.online` zone,
   create one proxied A or CNAME record named `arb-api.qa` pointing to
   Application Gateway. Do not use a wildcard or point public DNS at Istio's
   private IP. Configure valid certificates and Cloudflare's TLS mode before
   sending real credentials.
8. **Update Cloudflare Pages.** Set all three
   `*_SERVICE_HTTP_URL` bindings to `https://arb-api.qa.bikkam.online`.
   Update the Users proxy to preserve its prefix and allow HTTPS origins in
   the shared proxy helper. Keep the public frontend paths unchanged, then
   rebuild and deploy Pages.
9. **Test and cut over.** Test each API path through Cloudflare, Application
   Gateway, APIM, Istio, and the Digital Experience API. Check DNS resolution
   from APIM, host preservation, certificates, auth failures, successful CRUD
   flows,
   and logs at each hop. Keep the old hostnames/routes available for rollback;
   remove them only after a stable observation period.

### DNS distinction

| DNS location | Name(s) | Resolves to | Used by |
| --- | --- | --- | --- |
| Cloudflare public zone | `arb-api.qa.bikkam.online` | Application Gateway public IP/name | Browser / Pages Functions |
| Azure Private DNS | `digital-exp-api.arb-api.qa.bikkam.online` | Istio private IP | APIM backend |
| Azure Private DNS | `users`, `cart`, `orders` under `arb-api.qa.bikkam.online` | Istio private IP | Private callers using service hostnames |

Only the Cloudflare record is the public frontend API hostname. Private
service aliases do not require individual public DNS records.

## Implementation plan

### 1. Confirm the route and security contract

- Inventory frontend calls and backend routes for signup, login, profile,
  cart, and orders, including query strings and path parameters.
- Adopt the path mapping above and document any exceptions before changing
  routing.
- Preserve current access rules: signup/login remain public; protected
  password-token routes remain authenticated; the Users Auth0 route retains
  its current validation; Cart and Orders keep their existing user-scoped
  authorization.
- Resolve existing production access-control concerns noted in
  [ROUTING_GUIDE.md](./ROUTING_GUIDE.md), especially the Orders status-update
  route, before exposing the consolidated hostname.

### 2. Update the Pages Functions

- Point `USERS_SERVICE_HTTP_URL`, `CART_SERVICE_HTTP_URL`, and
  `ORDERS_SERVICE_HTTP_URL` to the same origin:

  ```dotenv
  USERS_SERVICE_HTTP_URL=https://arb-api.qa.bikkam.online
  CART_SERVICE_HTTP_URL=https://arb-api.qa.bikkam.online
  ORDERS_SERVICE_HTTP_URL=https://arb-api.qa.bikkam.online
  ```

- Change the Users proxy so it preserves `/api/users` in the upstream request;
  APIM and the Digital Experience API need that prefix to identify the Users
  service.
  Keep the Cart and Orders paths intact.
- Extend the shared Pages proxy origin validation to accept HTTPS. Use HTTPS
  for the production origin and configure a valid certificate before sending
  credentials. Do not silently fall back to HTTP if the configured origin is
  invalid.
- Keep the browser-facing `NEXT_PUBLIC_*_API_URL` values at their current
  same-origin paths (`/api/users`, `/api/cart`, `/api/orders`). Rebuild and
  redeploy Pages after changing its runtime bindings.

### 3. Add path-based dispatch in the Digital Experience API

- Replace hostname selection in the service router with explicit, ordered
  path-prefix matches for `/api/users`, `/api/cart`, and `/api/orders`.
- Match the most specific service prefixes before the gateway's generic
  `/api` routes, and return a clear not-found response for unknown API paths.
- Strip `/api/users` before forwarding to Users. Preserve `/api/cart` and
  `/api/orders` when forwarding to Cart and Orders, respectively.
- Preserve query strings, HTTP methods, request bodies, relevant headers, and
  upstream error/status behavior.
- Keep authentication checks associated with the selected service and route;
  do not weaken existing authorization while removing hostname-based routing.
- Remove the three service-host environment settings after no remaining
  clients depend on hostname dispatch. Keep the Kubernetes internal service
  URL settings.

### 4. Configure APIM, Application Gateway, and DNS

- Configure Application Gateway with one exact-host HTTPS listener and a
  backend pool targeting APIM. Configure APIM's backend to the private
  `digital-exp-api` DNS name, which resolves to Istio's private IP.
- Ensure the Istio Gateway accepts the APIM backend hostname and routes it to
  the Digital Experience API. Keep the `users`, `cart`, and `orders` Istio hosts
  for the corresponding private DNS aliases.
- Create the Cloudflare exact-host record for `arb-api.qa.bikkam.online`
  pointing to Application Gateway. Do not point public DNS at Istio's private
  IP or create public service-subdomain records.
- Keep the private DNS aliases and public DNS records separate. Link Azure
  Private DNS to the VNets that need to resolve the backend names.
- Keep old host records and ingress routes during the migration window for
  rollback. Remove them only after logs confirm that no clients still use
  them.

### 5. Roll out in stages

1. Validate private DNS resolution and APIM-to-Istio connectivity before
   changing public DNS.
2. Deploy path-based gateway dispatch and the `digital-exp-api` Istio host while
   keeping existing hostname routes available.
3. Test the complete request chain and all route prefixes, HTTPS, auth,
   query parameters, request bodies, and error responses.
4. Update Pages bindings to the single HTTPS origin and redeploy the frontend.
5. Monitor gateway, ingress, APIM, Application Gateway, and Pages Function logs.
   Verify successful requests and absence of unexpected 404s, 401s, 5xx
   responses, or path rewrites.
6. After a stable observation period, remove obsolete public host routing and
   DNS records.

Keep a rollback path until verification is complete: restore the previous
Pages origins and retain the prior service-host routing/DNS records. Do not
delete shared Application Gateway or Istio resources as part of this change.

## Acceptance checks

- Public DNS has one intended API hostname; no wildcard or service subdomain
  is required for frontend API traffic.
- Application Gateway's exact-host listener routes to APIM, and APIM resolves
  the private `digital-exp-api` hostname to the Istio private IP.
- The Istio Gateway accepts the APIM backend hostname and routes it to the
  Digital Experience API.
- The Pages Function can reach the single HTTPS origin with a valid
  certificate, and invalid origins fail explicitly.
- `/api/users/auth/login`, protected Users endpoints, `/api/cart`, and
  `/api/orders` reach the correct internal service with expected paths,
  methods, query strings, and bodies.
- Missing/invalid credentials are rejected as before, and cross-user Cart
  and Orders access remains denied.
- Internal calls such as token verification continue using Kubernetes DNS.
- Existing routes remain available until the new path has passed the QA and
  rollback checks.

## Related documentation

- [ROUTING_GUIDE.md](./ROUTING_GUIDE.md) — current and planned cloud routing
- [AZURE_APPLICATION_GATEWAY.md](./AZURE_APPLICATION_GATEWAY.md) — existing
  guide currently describes wildcard DNS and direct Application Gateway to
  Istio routing; align it with this APIM design before implementation
- [Frontend/README.md](./Frontend/README.md) — Pages proxy configuration
- [LOCAL_SETUP.md](./LOCAL_SETUP.md) — local testing and current API behavior
