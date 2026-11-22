# Cloudflare Pages and AKS Istio Routing

This guide describes routing the static Next.js frontend from Cloudflare Pages
to microservices on AKS through an Istio ingress gateway. The target design
uses Istio instead of Azure Application Gateway for external HTTP routing.

The service names, ports, and API paths below match the current project
configuration in [docker-compose.yml](./docker-compose.yml) and the service
routes linked in the route table. Docker Compose is a local development
reference; deploy the applications to AKS as Kubernetes `Deployment` and
internal `ClusterIP` `Service` resources.

## Target architecture

```text
Browser
  ├── https://www.example.com
  │     └── Cloudflare Pages (static frontend)
  └── https://api.example.com
        └── Cloudflare proxy, WAF, and rate limits
              └── Azure Load Balancer public IP
                    └── AKS Istio external ingress gateway (Envoy)
                          └── Istio Gateway and VirtualService routes
                                ├── cart-service
                                ├── orders-service
                                ├── users-service
                                └── products-service (if required)
```

In this design, Cloudflare points to the public IP of the Istio ingress
gateway's Azure Load Balancer Service. Azure Application Gateway,
Application Gateway for Containers, and AGIC are not in the target traffic
path. AKS still uses Azure Load Balancer to expose the Istio gateway Service;
that is not the same as retaining an Application Gateway.

This guide uses **self-managed upstream Istio installed with `istioctl`**, not
the AKS-managed Istio add-on. Pin an Istio release compatible with the AKS
Kubernetes version, and plan to manage Istio upgrades, scaling, and security
updates yourself.

- [Istio `istioctl` installation](https://istio.io/latest/docs/setup/install/istioctl/)
- [Istio installation profiles](https://istio.io/latest/docs/setup/additional-setup/config-profiles/)
- [Istio ingress gateway](https://istio.io/latest/docs/tasks/traffic-management/ingress/ingress-control/)

## API route map

Use the shared `api.example.com` host and preserve the existing paths. The
Istio routes below do not require URL rewrites.

| Host and path | AKS Service | Port | Routes |
| --- | --- | ---: | --- |
| `api.example.com/api/cart` and `/api/cart/{cartId}` | `cart-service` | 8080 | Read, add, update, and remove cart items |
| `api.example.com/api/orders` and `/api/orders/{orderId}` | `orders-service` | 8081 | List, create, and retrieve orders |
| `api.example.com/api/orders/{orderId}/status` | `orders-service` | 8081 | Update order status |
| `api.example.com/auth/*` | `users-service` | 8082 | Login, signup, profile, and token verification |
| `api.example.com/api/me` | `users-service` | 8082 | Auth0 token validation |
| `api.example.com/api/product*` | `products-service` | 8083 | Product APIs, if required by the frontend |

Route definitions live in [Cart](./cartMicroservice/features/cart/cart.route.js),
[Orders](./OrdersMicroservice/features/order/order.route.js),
[Users](./UserMicroservice/features/user/user.route.js), and
[Products](./ProductMicroservice/features/product/product.route.js).

Keep `/api-docs` private or protect it with Cloudflare Access. Each service uses
the same docs path; don't expose all docs through a shared path without
separate hosts or explicit path rewrites.

## AKS deployment steps

### 1. Prepare AKS and images

1. Select an AKS Kubernetes version supported by the pinned upstream Istio
   release. Check Istio's current support policy and AKS networking
   compatibility.
2. Build each service image, push it to Azure Container Registry, and deploy
   each service as a `Deployment` plus a private `ClusterIP` `Service`.
3. Keep databases private and persistent. Store database URLs, JWT signing
   keys, and Auth0 credentials in Azure Key Vault or Kubernetes Secrets, not
   committed manifests or `.env` files.
4. Add readiness and liveness endpoints to Cart, Users, and Products. Orders
   currently has `/health`; don't use Swagger UI or a business endpoint as a
   Kubernetes health probe.

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

Check that the ingress Service is ready and record its public IP:

```bash
kubectl get svc istio-ingressgateway -n istio-system
kubectl get svc istio-ingressgateway \
  -n istio-system \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Use a stable Azure Standard public IP for Cloudflare DNS. Configure the
Kubernetes Service with AKS-supported Azure Load Balancer annotations if a
static address or source-IP restriction is needed.

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

Create an Istio `Gateway` for `api.example.com`, then attach `VirtualService`
rules to route paths to the Kubernetes Services. The following is a starting
template; set the actual namespace, certificate secret, and service ports used
by the AKS deployment.

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: kfc-api-gateway
  namespace: kfc
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 80
        name: http
        protocol: HTTP
      tls:
        httpsRedirect: true
      hosts:
        - api.example.com
    - port:
        number: 443
        name: https
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: api-example-com-tls
      hosts:
        - api.example.com
---
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: kfc-api-routes
  namespace: kfc
spec:
  hosts:
    - api.example.com
  gateways:
    - kfc-api-gateway
  http:
    - match:
        - uri:
            prefix: /api/cart
      route:
        - destination:
            host: cart-service.kfc.svc.cluster.local
            port:
              number: 8080
    - match:
        - uri:
            prefix: /api/orders
      route:
        - destination:
            host: orders-service.kfc.svc.cluster.local
            port:
              number: 8081
    - match:
        - uri:
            exact: /api/me
        - uri:
            prefix: /auth
      route:
        - destination:
            host: users-service.kfc.svc.cluster.local
            port:
              number: 8082
    - match:
        - uri:
            prefix: /api/product
      route:
        - destination:
            host: products-service.kfc.svc.cluster.local
            port:
              number: 8083
```

The TLS secret referenced by `credentialName` must be available in the
`istio-system` namespace used by the ingress gateway. Set Cloudflare to
**Full (strict)** only after the gateway presents a valid certificate for
`api.example.com`.

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

1. Add a proxied DNS record for `api.example.com` pointing to the Istio
   ingress gateway's stable public IP.
2. Install a certificate for `api.example.com` at the Istio ingress gateway.
3. Set Cloudflare SSL/TLS mode to **Full (strict)**.
4. Consider Cloudflare WAF and rate limits. Restrict direct access to the
   gateway origin where compatible with the AKS Load Balancer configuration.

References: [Cloudflare proxied DNS](https://developers.cloudflare.com/dns/proxy-status/)
and [Full (strict) TLS](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).

### 5. Configure Cloudflare Pages

With the shared API host, set the frontend's Production and Preview build
variables to the same public origin:

```dotenv
NEXT_PUBLIC_CART_API_URL=https://api.example.com
NEXT_PUBLIC_ORDERS_API_URL=https://api.example.com
NEXT_PUBLIC_USERS_API_URL=https://api.example.com
```

Use the variable names from [Frontend/.env.example](./Frontend/.env.example).
`NEXT_PUBLIC_*` values are included in browser code and are not secrets. Set
them in the Pages project environment and rebuild/redeploy after changes.
Keep database URLs, signing keys, and other credentials in server-side secret
storage.

The Pages site and API host are cross-origin. Allow the exact deployed Pages
origin in backend CORS, including `Authorization` and `Content-Type` headers
and the required `GET`, `POST`, `PATCH`, and `DELETE` methods. Do not rely on
wildcard CORS as an access-control mechanism.

### 6. Keep service-to-service traffic inside AKS

Orders verifies password-login tokens by calling Users. Set `USERS_SERVICE_URL`
to the internal Kubernetes Service name, for example
`http://users-service:8082` when both services are in the same namespace, or
the fully qualified service DNS name if they are in different namespaces.
Don't send internal service traffic through Cloudflare or the public ingress.

## Safely remove the existing gateway

There are two different components that may be called a “gateway” in this
project. Identify which one is deployed before removing anything.

### Azure Application Gateway / Application Gateway for Containers

If the earlier Azure gateway design was only documented and never deployed,
there is nothing to delete. Otherwise, use a staged cutover:

1. Inventory its listeners, routes, WAF policies, certificates, public IP,
   subnet, identities, role assignments, DNS records, and any other workloads
   using it. Back up/export its configuration.
2. Deploy and validate the Istio ingress gateway while the old gateway remains
   available. Test `api.example.com` against the Istio IP using a temporary
   hosts override or `curl --resolve`, including HTTPS certificate validation,
   all API routes, and CORS.
3. Change the Cloudflare `api.example.com` origin to the Istio ingress IP.
   Keep the old gateway and its public IP available for rollback while
   monitoring errors and traffic.
4. After the new route is stable, remove the old Kubernetes `Ingress`,
   `HTTPRoute`, or Application Gateway for Containers resources and detach or
   disable the old controller only if no other application depends on it.
5. Delete the old Azure Application Gateway/Application Gateway for Containers
   resource and its dedicated public IP only after confirming they are no
   longer referenced. Delete a subnet, identity, or role assignment only if
   it is dedicated to that gateway and unused elsewhere.
6. If validation fails, restore the previous Cloudflare origin and investigate
   before deleting the old gateway.

Don't delete a shared gateway, subnet, public IP, or identity based only on its
name. Follow the teardown procedure for the specific AGIC or Application
Gateway for Containers deployment.

### The repository's Express `api-gateway` service

The Compose file also defines a separate Node.js service named `api-gateway`
on port 9000. It is not Azure Application Gateway or an Istio ingress
gateway. The Express service currently validates Auth0 JWTs for its `/api/*`
routes and proxies requests to the microservices. Istio `Gateway` and
`VirtualService` resources provide routing; they do not automatically replace
that JWT validation.

Before removing the Express service:

1. Verify that no frontend, client, or other service calls its port or
   `/api/*` proxy routes. The current Next.js environment template uses
   per-service API base URLs, but verify deployed clients and logs as well.
2. Decide where its Auth0 authorization will live. Migrate the required
   validation to Istio `RequestAuthentication`/`AuthorizationPolicy` or to the
   individual services, and test every supported token type. Orders currently
   verifies password-login tokens through Users; Auth0 order tokens are not
   supported.
3. Ensure direct routes to Cart, Orders, Users, and Products have the
   necessary service-level authorization before bypassing the proxy.
4. After a successful cutover and a no-traffic observation period, remove the
   Express gateway Deployment/Service from AKS and its service definition from
   Compose if it is no longer needed.

## Production access-control checks

Resolve these existing API limitations before exposing the services publicly:

- **Cart:** endpoints currently have no authentication or per-user ownership
  and operate on a shared collection. Add user-scoped storage and authorization.
- **Orders:** `PATCH /api/orders/{orderId}/status` currently has no
  authentication. Restrict it to an authorized staff/admin role.
- **Users:** `/auth/singleuser` accepts a user ID and returns profile fields
  without requiring authentication. Require authentication and self-access,
  or remove ID-based lookup.
- **Products:** product create, update, and delete routes should require an
  authorized admin role if routed publicly.
- **Profile updates:** the User service currently has no profile `PUT` or
  `PATCH` endpoint. Define allowed fields and validation before adding one.
- **Swagger:** keep `/api-docs` private or protect it with Cloudflare Access.

## Validation checklist

- `istio-ingressgateway` has a healthy external IP.
- The Istio `Gateway` accepts the expected host and presents the correct TLS
  certificate.
- Each route reaches the correct AKS `ClusterIP` Service without path rewrites.
- CORS preflight succeeds from the deployed Pages origin.
- Authentication works for the selected login/token flow.
- Orders reaches Users using Kubernetes DNS, not the public gateway.
- Cloudflare DNS is proxied and Full (strict) TLS succeeds.
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
