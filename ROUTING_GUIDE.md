# Cloudflare Pages and AKS Istio Routing

This guide documents the target routing architecture: Cloudflare Pages reaches
AKS through Azure Application Gateway, which forwards to a private Istio
ingress. The existing per-service host routing remains in place. The target is
planned and has not yet been applied.

The service names, ports, and API paths below match the current project
configuration in [docker-compose.yml](./docker-compose.yml) and the service
routes linked in the route table. Docker Compose is a local development
reference; deploy the applications to AKS as Kubernetes `Deployment` and
internal `ClusterIP` `Service` resources.

## Target architecture: private Istio behind Application Gateway

> **Plan only:** do not make the Istio ingress private until the Application
> Gateway route is ready.

```text
Public:
Browser → Cloudflare Pages → Pages Function
        → users/cart/orders.arb-api.qa.bikkam.online
        → Cloudflare wildcard DNS → Application Gateway (public)
        → Istio ingress gateway (private IP)
        → Istio Gateway/VirtualService → Digital Experience API
        → Users / Cart / Orders ClusterIP Services

Private Azure VNet:
Client → Azure Private DNS service record
       → Istio ingress gateway (private IP)
       → Istio Gateway/VirtualService → Digital Experience API
       → Users / Cart / Orders ClusterIP Services
```

The public Pages Functions continue using the existing service hostnames. A
Cloudflare wildcard DNS record sends public requests to Application Gateway,
which forwards them to Istio's private IP while preserving the original host.
Private clients in linked VNets resolve the same service hostnames through
Azure Private DNS directly to the Istio private IP.

In the Cloudflare `bikkam.online` zone, the planned wildcard record name is
`*.arb-api.qa`; it should point to Application Gateway, not the private Istio
IP. In Azure Private DNS, the planned zone is `arb-api.qa.bikkam.online`, with
`users`, `cart`, and `orders` A records pointing to the Istio private IP.
Link the private zone to the Application Gateway VNet as well if its backend
pool uses those DNS names. Configure Application Gateway to preserve the
incoming service hostname so the existing Istio host routing continues to
work.

The Pages proxy currently accepts only HTTP origins. Enabling HTTPS from Pages
to Application Gateway requires adding HTTPS support to the proxy and setting
the Pages runtime origins to `https://...`; configure and validate the
Application Gateway certificate before using real credentials. See the
migration plan in [LOCAL_SETUP.md](./LOCAL_SETUP.md).

## Current interim architecture: public Istio ingress

Until the target above is deployed, Cloudflare points the three API hostnames
to the public IP of the Istio ingress gateway's Azure Load Balancer Service.
Application Gateway is not currently in the traffic path.

```text
Browser → Cloudflare Pages → same-origin Pages Functions
        → users/cart/orders.arb-api.qa.bikkam.online
        → Cloudflare DNS proxy → Azure Load Balancer public IP
        → Istio ingress gateway → Istio Gateway/VirtualServices
        → Digital Experience API → Users / Cart / Orders ClusterIP Services
```

This guide uses **self-managed upstream Istio installed with `istioctl`**, not
the AKS-managed Istio add-on. Pin an Istio release compatible with the AKS
Kubernetes version, and plan to manage Istio upgrades, scaling, and security
updates yourself.

- [Istio `istioctl` installation](https://istio.io/latest/docs/setup/install/istioctl/)
- [Istio installation profiles](https://istio.io/latest/docs/setup/additional-setup/config-profiles/)
- [Istio ingress gateway](https://istio.io/latest/docs/tasks/traffic-management/ingress/ingress-control/)

## API route map

Use a DNS hostname per service. Istio sends every hostname to the Digital
Experience API, which performs service dispatch without rewriting the path.

| Host and path | Istio destination | Express upstream | Routes |
| --- | --- | ---: | --- |
| `users.arb-api.qa.bikkam.online/auth/signup`, `/auth/login`, `/auth/profile` | `digital-exp-api:9000` | `users-service:8082` | Public signup/login; protected profile and user APIs |
| `users.arb-api.qa.bikkam.online/api/me` | `digital-exp-api:9000` | `users-service:8082` | Auth0 token validation by Users |
| `cart.arb-api.qa.bikkam.online/api/cart` and `/api/cart/{cartId}` | `digital-exp-api:9000` | `cart-service:8080` | Authenticated, user-scoped cart |
| `orders.arb-api.qa.bikkam.online/api/orders` and `/api/orders/{orderId}` | `digital-exp-api:9000` | `orders-service:8081` | Authenticated order creation and retrieval |
| `orders.arb-api.qa.bikkam.online/api/orders/{orderId}/status` | `digital-exp-api:9000` | `orders-service:8081` | Status update; still needs an admin-role check |

Route definitions live in [Cart](./cartMicroservice/features/cart/cart.route.js),
[Orders](./OrdersMicroservice/features/order/order.route.js),
[Users](./UserMicroservice/features/user/user.route.js).

Users Swagger UI is available at `/api-docs` only after password-token
authentication through the Digital Experience API.

## Current AKS deployment steps

> These steps describe the current public-Istio setup. The private-ingress
> target above requires a staged migration and is not configured by these
> commands.

### 1. Prepare AKS and images

1. Select an AKS Kubernetes version supported by the pinned upstream Istio
   release. Check Istio's current support policy and AKS networking
   compatibility.
2. Build and push the Digital Experience API and Cart service images using
   the repository workflow. Deploy them as a `Deployment` plus a private
   `ClusterIP` `Service`.
3. Keep databases private and persistent. Store database URLs, JWT signing
   keys, and Auth0 credentials in Azure Key Vault or Kubernetes Secrets, not
   committed manifests or `.env` files.
4. The Digital Experience API, Cart, and Orders services expose `/health`;
   Users uses a TCP probe in the current manifest.

### 2. Install upstream Istio with `istioctl`

Choose and pin an upstream Istio release compatible with the AKS Kubernetes
version. Install that release's `istioctl` binary from the official
instructions, add it to `PATH`, and verify its version:

```bash
istioctl version
```

Install the `default` profile. It includes Istio's ingress gateway; verify the
gateway Service is exposed as an Azure `LoadBalancer`:

```bash
istioctl install --set profile=default -y
```

Check that the ingress Service is ready and record its public IP for the
current setup:

```bash
kubectl get svc istio-ingressgateway -n istio-system
kubectl get svc istio-ingressgateway \
  -n istio-system \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Use a stable Azure Standard public IP for the current Cloudflare DNS records.
For the planned private target, configure the ingress Service as an internal
Azure Load Balancer instead; select an unused address from the AKS subnet and
create the Azure Private DNS records before cutting over.

If AKS already has the **managed Istio add-on**, do not install this
self-managed control plane alongside it. Plan a maintenance migration: record
the current revision and routing, keep the old public gateway available for
rollback, then disable the add-on and verify its controllers and webhooks are
removed before installing upstream Istio with `istioctl`. If only its external
ingress gateway needs to be removed while keeping the managed mesh, use:

```bash
az aks mesh disable-ingress-gateway \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CLUSTER" \
  --ingress-gateway-type External
```

To remove the entire managed mesh before replacing it with upstream Istio,
use:

```bash
az aks mesh disable \
  --resource-group "$RESOURCE_GROUP" \
  --name "$CLUSTER"
```

Wait for the operation to complete and verify the managed controllers and
webhooks are removed before installing upstream Istio. Re-label and restart
workloads for self-managed sidecar injection, then re-apply the routing
resources below. Do not perform this transition on a live production cluster
without a tested migration window.

### 3. Add application routing

Apply the project manifests in this order: Digital Experience API Deployment
and Service,
Istio Gateway, then the Users, Cart, and Orders VirtualServices. The Gateway
accepts all three service hosts, and each VirtualService routes the complete
host to `digital-exp-api.domain-service-v3.svc.cluster.local:9000`. For example:

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: app-gateway
  namespace: domain-service-v3
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 80
        name: http
        protocol: HTTP
      hosts:
        - users.arb-api.qa.bikkam.online
        - cart.arb-api.qa.bikkam.online
        - orders.arb-api.qa.bikkam.online
```

Run the repository's manual image-build workflow first so the Cart and Digital
Experience API `latest` images are published. Then apply the updated workloads
and routes:

```bash
kubectl apply -f .k8s/cart-service/deployment.yml
kubectl apply -f .k8s/digital-exp-api/service.yml
kubectl apply -f .k8s/digital-exp-api/deployment.yml
kubectl apply -f .k8s/app-gateway/app-gateway.yml
kubectl apply -f .k8s/digital-exp-api/virtual-service.yml
kubectl apply -f .k8s/user-service/virtual-service.yml
kubectl apply -f .k8s/cart-service/virtual-service.yml
kubectl apply -f .k8s/order-service/virtual-service.yml
kubectl rollout status deployment/cart-service -n domain-service-v3
kubectl rollout status deployment/digital-exp-api -n domain-service-v3
```

The renamed Deployment and Service are new Kubernetes resources. Deploy and
validate them before removing the old `api-gateway` Deployment and Service;
do not try to change an existing Deployment selector in place because
Kubernetes selectors are immutable.

The checked-in Gateway currently listens on HTTP port 80 only. Do not configure
Cloudflare **Full (strict)** until a valid origin certificate and HTTPS
listener have been installed. HTTP from Cloudflare to the origin is suitable
only for testing; use TLS at the ingress for production.

Enable sidecar injection for application workloads that need mesh policies or
telemetry. Routing through the ingress gateway can work without sidecars, but
sidecars are needed for workload-level mesh features:

```bash
kubectl label namespace kfc istio-injection=enabled --overwrite
kubectl rollout restart deployment -n kfc
```

Verify the installation and route configuration:

```bash
istioctl analyze -A
istioctl proxy-status
kubectl get pods,svc -n istio-system
```

### 4. Configure Cloudflare DNS and TLS

The following DNS records describe the current direct-to-Istio setup. In the
planned target, replace them only after Application Gateway is ready: use one
Cloudflare wildcard record `*.arb-api.qa` pointing to Application Gateway,
and keep the Azure Private DNS records pointing to Istio's private IP.

1. Add proxied DNS records for `users.arb-api.qa.bikkam.online`,
   `cart.arb-api.qa.bikkam.online`, and `orders.arb-api.qa.bikkam.online`, all pointing
   to the Istio ingress gateway's stable public IP.
2. The current ingress is HTTP-only. For production, install a certificate
   covering all three names, add an HTTPS listener, and set Cloudflare SSL/TLS
   mode to **Full (strict)**.
3. Consider Cloudflare WAF and rate limits. Restrict direct access to the
   gateway origin where compatible with the AKS Load Balancer configuration.
4. After the new hosts pass validation and Pages bindings are updated, remove
   the old shared `arb-api.qa.bikkam.online` record and routes if no other
   clients still depend on them.

References: [Cloudflare proxied DNS](https://developers.cloudflare.com/dns/proxy-status/)
and [Full (strict) TLS](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

### 5. Configure Cloudflare Pages

Keep the frontend API URLs same-origin so its Pages Functions proxy requests:

```dotenv
NEXT_PUBLIC_USERS_API_URL=/api/users
NEXT_PUBLIC_CART_API_URL=/api/cart
NEXT_PUBLIC_ORDERS_API_URL=/api/orders
```

Use the variable names from [Frontend/.env.example](./Frontend/.env.example).
`NEXT_PUBLIC_*` values are included in browser code and are not secrets. Set
them in the Pages project environment and rebuild/redeploy after changes.
Set the server-side Pages bindings to the matching HTTP origin:

```dotenv
USERS_SERVICE_HTTP_URL=http://users.arb-api.qa.bikkam.online
CART_SERVICE_HTTP_URL=http://cart.arb-api.qa.bikkam.online
ORDERS_SERVICE_HTTP_URL=http://orders.arb-api.qa.bikkam.online
```

The HTTP origin leg is unencrypted until ingress TLS is configured, so do not
use it for production credentials. Keep database URLs, signing keys, and other
credentials in server-side secret storage.

### 6. Keep service-to-service traffic inside AKS

The Digital Experience API and both the Cart and Orders services verify password-login
tokens by calling Users. Set `USERS_SERVICE_URL` to the internal Kubernetes
Service name; the included manifests use
`http://users-service.domain-service-v3.svc.cluster.local:8082`. Do not send
internal service traffic through Cloudflare or the public ingress.

## Gateway roles and migration safety

There are two different components that may be called a “gateway” in this
project. The Digital Experience API (the Express API gateway) is part of the
current routing path. Azure
Application Gateway is planned as the public entry point for the private-Istio
target.

### Azure Application Gateway / Application Gateway for Containers

Do not delete an Application Gateway that is part of the planned target. If
one already exists, inventory its listeners, routes, WAF policies,
certificates, public IP, subnet, identities, role assignments, DNS records,
and other workloads before changing it. Back up its configuration.

For the planned cutover, configure its backend to the private Istio ingress,
preserve the incoming `users`, `cart`, or `orders` hostname, and verify health
probes and all service routes from the Application Gateway subnet. Point the
Cloudflare wildcard record to Application Gateway only after this path works.
Keep a rollback route until the new path is stable. Do not delete shared
gateways, subnets, public IPs, identities, or controllers based only on their
names.

### The repository's `digital-exp-api` service

The Compose file also defines a separate Node.js service named `digital-exp-api`
on port 9000. It is not Azure Application Gateway or an Istio ingress
gateway. The new hostname routes all terminate at the Digital Experience API,
which dispatches by hostname and validates password-login tokens through Users.
Signup and login are public. The older path-based `/api/*` routes retain their
Auth0 JWT validation; they are not the route used by the three service
hostnames.

Before removing the Express service:

1. Verify that no frontend, client, or other service calls its port or
   hostname routes before changing the deployment. The Pages Functions call
   the three service hostnames; verify deployed clients and logs as well.
2. Decide where password-token verification will live and test every supported
   token type. The current Cart and Orders services verify password-login
   tokens through Users; Auth0 tokens are not supported for those operations.
3. Ensure direct routes to Cart, Orders, and Users have service-level
   authorization before bypassing the proxy.
4. After a successful cutover and a no-traffic observation period, remove the
   Express gateway Deployment/Service from AKS and its service definition from
   Compose if it is no longer needed.

## Production access-control checks

Resolve these existing API limitations before exposing the services publicly:

- **Cart:** the updated API requires password-token verification and stores
  items by user. Existing cart documents without a user owner are not visible
  in authenticated carts and should be handled separately if they must be
  migrated.
- **Orders:** `PATCH /api/orders/{orderId}/status` currently has no
  authentication. Restrict it to an authorized staff/admin role.
- **Users:** `/auth/singleuser` now returns only the authenticated user's
  profile; don't restore ID-based lookup without an explicit authorization
  policy.
- **Products:** product create, update, and delete routes should require an
  authorized admin role if routed publicly.
- **Profile updates:** the User service currently has no profile `PUT` or
  `PATCH` endpoint. Define allowed fields and validation before adding one.
- **Swagger:** keep `/api-docs` private or protect it with Cloudflare Access.

## Validation checklist

- In the current setup, `istio-ingressgateway` has a healthy public IP. In the
  planned target, it has a healthy private IP and is reachable from linked
  VNets.
- Azure Private DNS resolves each service hostname to Istio's private IP from
  linked VNets.
- The planned Cloudflare wildcard resolves publicly to Application Gateway,
  and Application Gateway can reach Istio while preserving the service host.
- The Istio `Gateway` accepts the expected host and presents the correct TLS
  certificate.
- Each hostname reaches the Digital Experience API, which dispatches to the
  correct AKS `ClusterIP` Service without path rewrites.
- Signup/login work without a token; protected routes reject missing or
  invalid password-login tokens.
- Authentication works for the selected login/token flow.
- Orders reaches Users using Kubernetes DNS, not the public gateway.
- The current three Cloudflare records, or the planned wildcard record, route
  to the intended public entry point. Full (strict) TLS succeeds after valid
  certificates and HTTPS listeners are configured.
- Swagger and administrative write APIs are not exposed without appropriate
  access control.

## References

- [Istio `istioctl` installation](https://istio.io/latest/docs/setup/install/istioctl/)
- [Istio installation profiles](https://istio.io/latest/docs/setup/additional-setup/config-profiles/)
- [Istio ingress gateway](https://istio.io/latest/docs/tasks/traffic-management/ingress/ingress-control/)
- [AKS networking](https://learn.microsoft.com/en-us/azure/aks/concepts-network)
- [AKS CLI reference for managed Istio removal](https://learn.microsoft.com/en-us/cli/azure/aks/mesh)
- [Cloudflare DNS proxy status](https://developers.cloudflare.com/dns/proxy-status/)
- [Cloudflare Full (strict) TLS](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
- [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
