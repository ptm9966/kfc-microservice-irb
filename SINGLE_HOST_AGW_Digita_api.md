# Single-host Cloudflare and Application Gateway setup

This guide covers the QA route using one public API hostname and a direct
Application Gateway backend to Istio. This design bypasses APIM.

## Request flow

```text
Browser
  → Cloudflare Pages frontend
  → Pages Function (/api/users, /api/cart, or /api/orders)
  → http://arb-api.qa.bikkam.online/<API path>
  → Cloudflare DNS/proxy
  → Application Gateway HTTP listener
  → private digital-exp-api DNS record
  → Istio ingress
  → digital-exp-api Kubernetes Service
  → Users, Cart, or Orders Kubernetes Service
```

The Pages Function preserves the `/api/users` prefix. Application Gateway
overrides the backend `Host` header to the private Digital Experience API
hostname; the Digital Experience API then routes by path. Keep service-to-
service traffic on Kubernetes Service DNS.

## DNS records

### Public Cloudflare DNS

In the `bikkam.online` zone, create one API record:

| Setting | Value |
| --- | --- |
| Name | `arb-api.qa` |
| Type | A or CNAME |
| Target | Application Gateway public IP or DNS name |

Do not point this public record at Istio's private IP. If the record is
proxied, configure Cloudflare to connect to the HTTP origin on port 80
(Flexible mode). This setting can affect other proxied hostnames in the zone.
Alternatively, make the record DNS-only and allow direct HTTP access to
Application Gateway.

### Azure Private DNS

In the private DNS zone `arb-api.qa.bikkam.online`, create:

| Record | Type | Address |
| --- | --- | --- |
| `digital-exp-api` | A | Istio ingress private LoadBalancer IP |

Link this private zone to the Application Gateway VNet so the gateway can
resolve `digital-exp-api.arb-api.qa.bikkam.online`. Confirm the private IP is
reachable from the Application Gateway subnet.

Do not create public `users`, `cart`, or `orders` records for this path.
Inside AKS, continue using Kubernetes Service DNS names.

## Application Gateway

### Listener and rule

Create an HTTP multi-site listener:

| Setting | Value |
| --- | --- |
| Frontend | Public IP |
| Protocol and port | HTTP, 80 |
| Listener host | `arb-api.qa.bikkam.online` |

Associate a routing rule that forwards all paths to the Digital Experience API
backend pool. The listener host is public-facing; it is different from the
private hostname used for the backend request.

### Backend pool and HTTP settings

Create a backend pool with target type **IP address or FQDN** and target:

```text
digital-exp-api.arb-api.qa.bikkam.online
```

Configure its HTTP setting:

| Setting | Value |
| --- | --- |
| Protocol and port | HTTP, 80 |
| Override with new host name | Yes |
| Host name | `digital-exp-api.arb-api.qa.bikkam.online` |
| Override backend path | Leave blank |

The host override is required: the Istio VirtualService accepts
`digital-exp-api.arb-api.qa.bikkam.online`, not the public
`arb-api.qa.bikkam.online` host.

### Health probe

Use a custom probe with:

| Setting | Value |
| --- | --- |
| Protocol and port | HTTP, 80 |
| Host | `digital-exp-api.arb-api.qa.bikkam.online` |
| Path | `/health` |
| Success status | HTTP 200 |

The probe host must match the backend host so Istio routes the probe to the
Digital Experience API.

## Cloudflare Pages

Set these Pages Function bindings to the same HTTP origin:

```text
USERS_SERVICE_HTTP_URL=http://arb-api.qa.bikkam.online
CART_SERVICE_HTTP_URL=http://arb-api.qa.bikkam.online
ORDERS_SERVICE_HTTP_URL=http://arb-api.qa.bikkam.online
```

The values are in `Frontend/wrangler.toml`. Also set matching Production
variables in the Pages project if dashboard variables are configured. Keep the
browser-facing URLs as `/api/users`, `/api/cart`, and `/api/orders`.

Build and deploy from `Frontend` so Wrangler includes the `functions/`
directory:

```sh
npm run build
npx wrangler pages deploy ./out --project-name kfc-frontend-pages --branch main
```

## Validation

From a client that can reach the public API hostname:

```sh
curl -i --max-time 15 http://arb-api.qa.bikkam.online/health
```

Expect HTTP 200 with the Digital Experience API health response. Then verify
the signup route without creating an account:

```sh
curl -i --max-time 15 \
  -H 'Content-Type: application/json' \
  --data '{}' \
  http://arb-api.qa.bikkam.online/api/users/auth/signup
```

Expect HTTP 400 JSON describing the missing signup fields. An empty 404 from
`istio-envoy` indicates the backend host override or Istio host routing is
incorrect. If Application Gateway reports an unhealthy backend, check private
DNS resolution, reachability to the Istio IP, and the custom probe settings.

## HTTP limitation

HTTP is unencrypted. Signup passwords and returned tokens are exposed on the
Cloudflare-to-Application-Gateway and Application-Gateway-to-Istio hops. Use
this only for isolated QA/testing; configure HTTPS before handling real user
credentials.
