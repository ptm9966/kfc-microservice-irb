const axios = require("axios");
const authenticatePasswordToken = require("./passwordAuth");

const services = [
  {
    host: process.env.USERS_API_HOST || "users.arb-api.qa.bikkam.online",
    name: "Users",
    url: process.env.USERS_SERVICE_URL || "http://localhost:8082",
    isPublic: (req) => req.method === "POST" && ["/auth/signup", "/auth/login"].includes(req.path),
    validatesAuth0Token: (req) => req.method === "GET" && req.path === "/api/me",
  },
  {
    host: process.env.CART_API_HOST || "cart.arb-api.qa.bikkam.online",
    name: "Cart",
    url: process.env.CART_SERVICE_URL || "http://localhost:8080",
  },
  {
    host: process.env.ORDERS_API_HOST || "orders.arb-api.qa.bikkam.online",
    name: "Orders",
    url: process.env.ORDERS_SERVICE_URL || "http://localhost:8081",
  },
];

async function proxyServiceRequest(req, res, service) {
  try {
    const response = await axios.request({
      method: req.method,
      url: `${service.url.replace(/\/+$/, "")}${req.originalUrl}`,
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

async function serviceHostRouter(req, res, next) {
  const host = (req.hostname || "").toLowerCase();
  const service = services.find((candidate) => candidate.host.toLowerCase() === host);
  if (!service) return next();

  if (!service.isPublic?.(req) && !service.validatesAuth0Token?.(req)) {
    const authenticated = await authenticatePasswordToken(req, res);
    if (!authenticated) return;
  }

  return proxyServiceRequest(req, res, service);
}

module.exports = serviceHostRouter;
