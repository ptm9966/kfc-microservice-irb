const axios = require("axios");
const authenticatePasswordToken = require("./passwordAuth");

const digitalExpApiHost = (
  process.env.DIGITAL_EXP_API_HOST || "digital-exp-api.arb-api.qa.bikkam.online"
).toLowerCase();

const services = [
  {
    host: process.env.USERS_API_HOST || "users.arb-api.qa.bikkam.online",
    pathPrefix: "/api/users",
    stripPrefix: true,
    name: "Users",
    url: process.env.USERS_SERVICE_URL || "http://localhost:8082",
    isPublic: (req, path) =>
      req.method === "POST" && ["/auth/signup", "/auth/login"].includes(path),
    validatesAuth0Token: (req, path) => req.method === "GET" && path === "/api/me",
  },
  {
    host: process.env.CART_API_HOST || "cart.arb-api.qa.bikkam.online",
    pathPrefix: "/api/cart",
    name: "Cart",
    url: process.env.CART_SERVICE_URL || "http://localhost:8080",
  },
  {
    host: process.env.ORDERS_API_HOST || "orders.arb-api.qa.bikkam.online",
    pathPrefix: "/api/orders",
    name: "Orders",
    url: process.env.ORDERS_SERVICE_URL || "http://localhost:8081",
  },
];

function matchesPathPrefix(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function stripPathPrefix(path, prefix) {
  const queryIndex = path.indexOf("?");
  const pathname = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const suffix = pathname.slice(prefix.length) || "/";
  const query = queryIndex === -1 ? "" : path.slice(queryIndex);
  return `${suffix}${query}`;
}

async function proxyServiceRequest(req, res, service, upstreamPath = req.originalUrl) {
  try {
    const response = await axios.request({
      method: req.method,
      url: `${service.url.replace(/\/+$/, "")}${upstreamPath}`,
      headers: {
        ...(req.headers.authorization && { Authorization: req.headers.authorization }),
        ...(req.headers["content-type"] && { "Content-Type": req.headers["content-type"] }),
      },
      data: req.body,
      timeout: 10000,
      validateStatus: () => true,
    });

    if (response.headers["content-type"]) {
      res.set("Content-Type", response.headers["content-type"]);
    }
    res.set("Cache-Control", "no-store");
    return res.status(response.status).send(response.data);
  } catch (error) {
    console.error(`${service.name} service proxy request failed:`, error.message);
    const status = error.code === "ECONNABORTED" ? 504 : 502;
    return res.status(status).json({
      message: `${service.name} service is ${status === 504 ? "taking too long to respond" : "unavailable"}`,
    });
  }
}

async function authenticateAndProxy(req, res, service, servicePath, upstreamPath) {
  if (!service.isPublic?.(req, servicePath) && !service.validatesAuth0Token?.(req, servicePath)) {
    const authenticated = await authenticatePasswordToken(req, res);
    if (!authenticated) return;
  }

  return proxyServiceRequest(req, res, service, upstreamPath);
}

async function serviceHostRouter(req, res, next) {
  const host = (req.hostname || "").toLowerCase();
  const legacyService = services.find((candidate) => candidate.host.toLowerCase() === host);
  if (legacyService) {
    return authenticateAndProxy(
      req,
      res,
      legacyService,
      req.path,
      req.originalUrl,
    );
  }

  if (host !== digitalExpApiHost) return next();

  const service = services.find((candidate) => matchesPathPrefix(req.path, candidate.pathPrefix));
  if (!service) return next();

  const servicePath = service.stripPrefix
    ? stripPathPrefix(req.path, service.pathPrefix)
    : req.path;
  const upstreamPath = service.stripPrefix
    ? stripPathPrefix(req.originalUrl, service.pathPrefix)
    : req.originalUrl;

  return authenticateAndProxy(req, res, service, servicePath, upstreamPath);
}

module.exports = serviceHostRouter;
