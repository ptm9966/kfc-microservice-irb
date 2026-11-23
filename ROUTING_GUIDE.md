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
  └── https://bikkam.online
        └── Cloudflare Pages (static frontend)
              └── same-origin Pages Functions (/api/users, /api/cart, /api/orders)
                    ├── http://users.arb-api.qa.bikkam.online
                    ├── http://cart.arb-api.qa.bikkam.online
                    └── http://orders.arb-api.qa.bikkam.online
                          └── Cloudflare DNS proxy and WAF
                                └── Azure Load Balancer public IP
                                      └── AKS Istio ingress gateway (Envoy)
                                            └── Istio Gateway and VirtualServices
                                                  └── Express api-gateway:9000
                                                        ├── users-service:8082
                                                        ├── cart-service:8080
                                                        └── orders-service:8081
```

Each DNS hostname reaches the same API Gateway; Express selects the upstream
using the preserved `Host` header. The Pages Functions keep browser requests
same-origin and forward each path to its matching hostname. Cloudflare points
the three API hostnames to the public IP of the Istio ingress gateway's Azure
Load Balancer Service. Azure Application Gateway,
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

Use a DNS hostname per service. Istio sends every hostname to the Express API
Gateway; Express performs the service dispatch without rewriting the path.

| Host and path | Istio destination | Express upstream | Routes |
| --- | --- | ---: | --- |
| `users.arb-api.qa.bikkam.online/auth/signup`, `/auth/login`, `/auth/profile` | `api-gateway:9000` | `users-service:8082` | Public signup/login; protected profile and user APIs |
| `users.arb-api.qa.bikkam.online/api/me` | `api-gateway:9000` | `users-service:8082` | Auth0 token validation by Users |
| `cart.arb-api.qa.bikkam.online/api/cart` and `/api/cart/{cartId}` | `api-gateway:9000` | `cart-service:8080` | Authenticated, user-scoped cart |
| `orders.arb-api.qa.bikkam.online/api/orders` and `/api/orders/{orderId}` | `api-gateway:9000` | `orders-service:8081` | Authenticated order creation and retrieval |
| `orders.arb-api.qa.bikkam.online/api/orders/{orderId}/status` | `api-gateway:9000` | `orders-service:8081` | Status update; still needs an admin-role check |

Route definitions live in [Cart](./cartMicroservice/features/cart/cart.route.js),
[Orders](./OrdersMicroservice/features/order/order.route.js),
[Users](./UserMicroservice/features/user/user.route.js).

Users Swagger UI is available at `/api-docs` only after password-token
authentication through the API Gateway.

## AKS deployment steps

### 1. Prepare AKS and images

1. Select an AKS Kubernetes version supported by the pinned upstream Istio
   release. Check Istio's current support policy and AKS networking
   compatibility.
2. Build and push the API Gateway and Cart service images using the repository
   workflow. Deploy them as a `Deployment` plus a private `ClusterIP` `Service`.
3. Keep databases private and persistent. Store database URLs, JWT signing
   keys, and Auth0 credentials in Azure Key Vault or Kubernetes Secrets, not
   committed manifests or `.env` files.
4. The API Gateway, Cart, and Orders services expose `/health`; Users uses a
   TCP probe in the current manifest.

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

Apply the project manifests in this order: API Gateway Deployment and Service,
Istio Gateway, then the Users, Cart, and Orders VirtualServices. The Gateway
accepts all three service hosts, and each VirtualService routes the complete
host to `api-gateway.domain-service-v3.svc.cluster.local:9000`. For example:

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

Run the repository's manual image-build workflow first so the Cart and API
Gateway `latest` images are published. Then apply the updated workloads and
routes:

```bash
kubectl apply -f .k8s/cart-service/deployment.yml
kubectl apply -f .k8s/api-gateway/service.yml
kubectl apply -f .k8s/api-gateway/deployment.yml
kubectl apply -f .k8s/app-gateway/app-gateway.yml
kubectl apply -f .k8s/user-service/virtual-service.yml
kubectl apply -f .k8s/cart-service/virtual-service.yml
kubectl apply -f .k8s/order-service/virtual-service.yml
kubectl rollout status deployment/cart-service -n domain-service-v3
kubectl rollout status deployment/api-gateway -n domain-service-v3
```

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

The API Gateway and both the Cart and Orders services verify password-login
tokens by calling Users. Set `USERS_SERVICE_URL` to the internal Kubernetes
Service name; the included manifests use
`http://users-service.domain-service-v3.svc.cluster.local:8082`. Do not send
internal service traffic through Cloudflare or the public ingress.

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
   available. Test each service hostname against the Istio IP using
   `curl --resolve`, including the expected host header and all API routes.
3. Point the three Cloudflare API hostnames at the Istio ingress IP.
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
gateway. The new hostname routes all terminate at this Express service, which
dispatches by hostname and validates password-login tokens through Users.
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

- `istio-ingressgateway` has a healthy external IP.
- The Istio `Gateway` accepts the expected host and presents the correct TLS
  certificate.
- Each hostname reaches the Express API Gateway, which dispatches to the
  correct AKS `ClusterIP` Service without path rewrites.
- Signup/login work without a token; protected routes reject missing or
  invalid password-login tokens.
- Authentication works for the selected login/token flow.
- Orders reaches Users using Kubernetes DNS, not the public gateway.
- All three Cloudflare DNS records are proxied; Full (strict) TLS succeeds
  after an HTTPS ingress listener and certificate are configured.
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
