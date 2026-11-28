# Multi-host Application Gateway to Istio private IP

Brief QA setup for the multi-host alternative to
[single-host direct routing](./SINGLE_HOST_CLOUDFLARE_APP_GATEWAY.md).
This design uses separate API hostnames and sends Application Gateway directly
to the Istio ingress private IP; it does not use APIM.

## Request flow

```text
Cloudflare Pages
  → users/cart/orders.arb-api.qa.bikkam.online
  → Cloudflare DNS
  → Application Gateway wildcard listener (HTTP/80)
  → Istio ingress private IP (HTTP/80)
  → Istio VirtualService selected by the original Host
  → digital-exp-api Kubernetes Service
  → microservice Kubernetes Service
```

## Setup steps

1. **Find the Istio private IP.** Get the private LoadBalancer IP for the
   Istio ingress gateway. Confirm the Application Gateway subnet can route to
   it and that network rules allow TCP port 80.

2. **Create public Cloudflare DNS.** In the `bikkam.online` zone, create a
   proxied wildcard A record:

   | Name | Type | Target |
   | --- | --- | --- |
   | `*.arb-api.qa` | A | Application Gateway public IP |

   This covers `users`, `cart`, and `orders`. If using Cloudflare proxy with
   the HTTP listener, configure HTTP to the origin (Flexible mode). This is
   unencrypted and suitable only for QA.

3. **Create the Application Gateway listener.** Use a public frontend, HTTP
   port 80, and a multi-site wildcard hostname:
   `*.arb-api.qa.bikkam.online`.

4. **Create the Istio backend pool.** Set target type to **IP address** and
   enter the Istio private LoadBalancer IP. A private DNS record is not needed
   for this backend pool when it targets a literal IP.

5. **Configure backend HTTP settings.** Use HTTP port 80 and leave hostname
   override disabled. Application Gateway must preserve each incoming host:
   `users.arb-api.qa.bikkam.online`,
   `cart.arb-api.qa.bikkam.online`, or
   `orders.arb-api.qa.bikkam.online`.

6. **Add an Istio readiness probe.** The current Istio ingress LoadBalancer
   exposes status port `15021/TCP`. Configure a custom Application Gateway
   probe:

   | Setting | Value |
   | --- | --- |
   | Protocol | HTTP |
   | Port | 15021 |
   | Path | `/healthz/ready` |

   The status endpoint checks whether the Istio ingress proxy is ready and
   does not need a service-host header. Allow port 15021 from the Application
   Gateway subnet. This probe checks Istio readiness, not the host-specific
   API routes; validate those separately in step 9.

7. **Configure Istio routing.** The Istio Gateway must accept all three hosts.
   Create a VirtualService for each host and route each to
   `digital-exp-api.domain-services-v3.svc.cluster.local:9000`. The
   Digital Experience API uses the original host to dispatch to Users, Cart,
   or Orders.

8. **Set Cloudflare Pages bindings.** Point the service bindings to their
   matching hosts:

   ```text
   USERS_SERVICE_HTTP_URL=http://users.arb-api.qa.bikkam.online
   CART_SERVICE_HTTP_URL=http://cart.arb-api.qa.bikkam.online
   ORDERS_SERVICE_HTTP_URL=http://orders.arb-api.qa.bikkam.online
   ```

   Keep the browser-facing API paths unchanged. Ensure `/api/users` is
   stripped before the Users service receives the request; it expects paths
   such as `/auth/signup`. Cart and Orders paths should follow their service
   route definitions.

9. **Validate each host.** Check Cloudflare DNS and Application Gateway
   backend health, then test:

   ```sh
   curl -i --max-time 15 http://users.arb-api.qa.bikkam.online/health
   curl -i --max-time 15 http://cart.arb-api.qa.bikkam.online/health
   curl -i --max-time 15 http://orders.arb-api.qa.bikkam.online/health
   ```

   A 404 from `istio-envoy` usually means the Gateway or VirtualService did
   not match the incoming host. If the backend is unhealthy, check the private
   IP, network path, and probe.

## Security

HTTP does not encrypt signup passwords or tokens between Cloudflare and
Application Gateway, or between Application Gateway and Istio. Use this only
for isolated QA. Use HTTPS listeners and TLS backends before handling real
user credentials.
