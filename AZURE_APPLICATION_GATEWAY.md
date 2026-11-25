# Azure Application Gateway for KFC Microservices

## Overview

This guide describes the planned KFC architecture: Cloudflare Pages sends API
requests through Azure Application Gateway v2 to a private Istio ingress
gateway in AKS. The existing per-service hostnames remain in use.

> **Plan only:** do not switch the public API DNS records or make Istio ingress
> private until the Application Gateway route is configured and validated.
> The current interim setup sends traffic directly to the public Istio
> ingress.

## Target architecture

```text
Public:
Browser → Cloudflare Pages → Pages Function
        → users/cart/orders.arb-api.qa.bikkam.online
        → Cloudflare wildcard DNS → Application Gateway public IP
        → Application Gateway wildcard listener and rule
        → Istio internal LoadBalancer (private IP)
        → Istio Gateway / service VirtualServices
        → Express API Gateway → Users / Cart / Orders ClusterIP Services

Private Azure VNet:
Client → Azure Private DNS service hostname
       → Istio internal LoadBalancer (private IP)
       → Istio Gateway / service VirtualServices
       → Express API Gateway → Users / Cart / Orders ClusterIP Services
```

The listener accepts the three service hostnames. Application Gateway forwards
the request to Istio without overriding its original `Host` header. Istio
matches that hostname to its VirtualService; the Express API Gateway then
dispatches to the appropriate Kubernetes Service.

## Listener and multi-site explained

A **listener** is the Application Gateway frontend entry point. It binds a
frontend IP address to a protocol and port and can match one or more
hostnames. Here, it listens on the public frontend IP over HTTP port 80 and
matches API hostnames under `arb-api.qa.bikkam.online`.

A **multi-site listener** distinguishes requests that share the same frontend
IP, protocol, and port by examining the HTTP `Host` header. It does not need
separate public IPs or gateways for Users, Cart, and Orders.

The wildcard hostname `*.arb-api.qa.bikkam.online` matches
`users.arb-api.qa.bikkam.online`, `cart.arb-api.qa.bikkam.online`, and
`orders.arb-api.qa.bikkam.online`. A **Basic listener** does not select a site
by hostname. This is separate from the routing rule type: the listener is
multi-site, and it can be associated with a **Basic routing rule** that sends
all matching paths to one backend.

If other, more-specific listeners share the same frontend, give their rules a
higher priority (a lower numeric value) than the wildcard rule. Application
Gateway v2 rule priorities must be unique.

## Wildcard multi-site listener

Create one listener with these settings:

| Setting | Value |
| --- | --- |
| Listener name | `arb-api-wildcard-listener` |
| SKU | Standard_v2 or WAF_v2 |
| Frontend IP | Public |
| Protocol and port | HTTP, 80 (QA only; use HTTPS in production) |
| Listener type | Multi-site |
| Hostname mode | Wildcard / multiple hostnames |
| Hostname | `*.arb-api.qa.bikkam.online` |

Use the wildcard only for these APIs if no unrelated services need other
hostnames under that DNS suffix.

## Backend pool and HTTP settings

Create the backend pool:

| Setting | Value |
| --- | --- |
| Name | `istio-backend-pool` |
| Target type | IP address |
| Target | Istio internal LoadBalancer private IP |

`10.0.10.50` is an example private IP only. Replace it with the actual address
assigned to the Istio ingress LoadBalancer and confirm it is available in the
correct AKS subnet. Do not use the example unless it is actually assigned.

Configure the backend HTTP setting:

| Setting | Value |
| --- | --- |
| Name | `istio-http-settings` |
| Protocol and port | HTTP, 80 |
| Hostname override | No |

Do not replace the incoming host with the backend IP; Istio needs the original
service hostname to select its VirtualService. Verify host preservation using
requests through Application Gateway.

Configure a custom health probe if the default probe reports the backend
unhealthy. For example, use HTTP port 80, path `/health`, and a Host value
accepted by the Istio Gateway, such as `users.arb-api.qa.bikkam.online`.
Confirm the probe receives a successful response through the ingress route.

## Routing rule

Create one **Basic routing rule**:

| Setting | Value |
| --- | --- |
| Rule name | `arb-api-wildcard-rule` |
| Rule type | Basic |
| Listener | `arb-api-wildcard-listener` |
| Backend pool | `istio-backend-pool` |
| Backend setting | `istio-http-settings` |
| Priority | Unique; more-specific hostname rules take precedence |

The Basic rule sends all paths accepted by this listener to the same Istio
backend. That is sufficient because Istio and the Express API Gateway handle
the per-service routing after Application Gateway.

## Public and private DNS

The Cloudflare DNS **zone** is `bikkam.online`. A zone ID identifies that DNS
zone; it is not a DNS record or a hostname. Add the wildcard record inside the
existing zone.

For public access, create one wildcard **A** record in Cloudflare:

| Setting | Value |
| --- | --- |
| Name | `*.arb-api.qa` |
| Type | A |
| Address | Application Gateway public IP |
| Example address | `74.235.49.137` (example only; use the assigned IP) |

Cloudflare appends `.bikkam.online`, so this record resolves service names
such as `users.arb-api.qa.bikkam.online` to Application Gateway. Set the
Cloudflare proxy status according to the intended Cloudflare proxy/WAF
configuration. The public record must point to Application Gateway, never to
Istio's private IP.

Create an Azure Private DNS zone named `arb-api.qa.bikkam.online`, link it to
the AKS VNet and any client VNets that need private access, and add these A
records:

| Record name | Type | Address |
| --- | --- | --- |
| `users` | A | Istio internal LoadBalancer private IP |
| `cart` | A | Istio internal LoadBalancer private IP |
| `orders` | A | Istio internal LoadBalancer private IP |

For example, if the Istio private IP is `10.0.10.50`, all three records point
to that address. Private DNS resolves only for clients using the linked VNet
DNS path (or connected networks configured to use that path); it does not
make the private IP reachable from the public Internet.

If the Application Gateway backend pool targets a literal IP, it does not
need Private DNS to resolve that target. Link the zone to the Application
Gateway VNet only if the gateway or its backend configuration needs to resolve
the private service names.

## Istio routing

Keep the separate Istio VirtualServices and their exact hostnames. Each should
route to the internal Express API Gateway Service. For example:

```yaml
spec:
  hosts:
    - users.arb-api.qa.bikkam.online
  gateways:
    - app-gateway
```

```yaml
spec:
  hosts:
    - orders.arb-api.qa.bikkam.online
  gateways:
    - app-gateway
```

The Cart VirtualService uses `cart.arb-api.qa.bikkam.online`. The Istio
Gateway must accept all three hosts. Application Gateway is the public entry
point; it does not replace the Istio Gateway or VirtualServices.

## Cutover and validation

1. Inspect the AKS VNet/subnet and determine whether Istio is managed by the
   AKS add-on or installed with `istioctl`. Reserve an available private IP
   and confirm the Application Gateway subnet can route to it.
2. Plan how to provision the private Istio LoadBalancer while preserving the
   current public endpoint. If supported by the cluster setup, create a
   separate internal gateway Service and validate it alongside the public
   Service. Otherwise, schedule a controlled replacement with an explicit
   outage and rollback plan; do not assume one Service can retain both public
   and private frontend IPs.
3. Configure and validate the Application Gateway backend pool, HTTP setting,
   health probe, wildcard listener, and Basic rule against the private Istio
   endpoint.
4. Test each hostname against the Application Gateway public IP while
   explicitly supplying the service Host header. Confirm each request reaches
   the expected API route and preserves the hostname through Istio.
5. Create/link Azure Private DNS and verify all three names resolve to Istio's
   private IP from AKS and client VNets.
6. Add the Cloudflare wildcard record pointing to the Application Gateway
   public IP. Validate public DNS and the Pages Function flow.
7. Switch public traffic only after these checks pass. Keep the existing
   public route available for rollback until the cutover is stable.

The sample listener uses HTTP port 80 to match the currently documented QA
Istio configuration. HTTP is unencrypted and must not be used for real user
credentials. For production, configure HTTPS listeners and certificates,
HTTPS backend settings if Istio is configured for TLS, and the matching
Cloudflare TLS mode before cutover.

## References

- [Azure Application Gateway documentation](https://learn.microsoft.com/en-us/azure/application-gateway/)
- [Multi-site and wildcard listener behavior](https://learn.microsoft.com/en-us/azure/application-gateway/multiple-site-overview)
- [Backend HTTP settings](https://learn.microsoft.com/en-us/azure/application-gateway/configuration-http-settings)
- [Azure Private DNS overview](https://learn.microsoft.com/en-us/azure/dns/private-dns-overview)
- [Azure Application Gateway WAF](https://learn.microsoft.com/en-us/azure/web-application-firewall/)
