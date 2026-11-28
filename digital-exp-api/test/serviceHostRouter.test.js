const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const serviceHostRouter = require("../middleware/serviceHostRouter");

function createRequest({ method, path, originalUrl, body, authorization }) {
  const headers = {
    "content-type": "application/json",
    ...(authorization && { authorization }),
  };

  return {
    hostname: "digital-exp-api.arb-api.qa.bikkam.online",
    method,
    path,
    originalUrl,
    body,
    headers,
    get(name) {
      return headers[name.toLowerCase()] || "";
    },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

test("routes public Users signup by path and strips its service prefix", async (t) => {
  const originalRequest = axios.request;
  let upstreamRequest;
  t.after(() => {
    axios.request = originalRequest;
  });
  axios.request = async (config) => {
    upstreamRequest = config;
    return { status: 201, headers: {}, data: { message: "Signup successful" } };
  };

  const req = createRequest({
    method: "POST",
    path: "/api/users/auth/signup",
    originalUrl: "/api/users/auth/signup?source=web",
    body: { name: "Test User" },
  });
  const res = createResponse();
  await serviceHostRouter(req, res, () => assert.fail("Expected Users path to be handled"));

  assert.equal(upstreamRequest.url, "http://localhost:8082/auth/signup?source=web");
  assert.deepEqual(upstreamRequest.data, { name: "Test User" });
  assert.equal(res.statusCode, 201);
});

test("protects Cart paths and preserves their path and query", async (t) => {
  const originalFetch = global.fetch;
  const originalRequest = axios.request;
  let upstreamRequest;
  t.after(() => {
    global.fetch = originalFetch;
    axios.request = originalRequest;
  });
  global.fetch = async (url) => {
    assert.match(url, /\/auth\/verify$/);
    return new Response(JSON.stringify({ valid: true, user: { id: "user-1" } }), {
      status: 200,
    });
  };
  axios.request = async (config) => {
    upstreamRequest = config;
    return { status: 200, headers: {}, data: { items: [] } };
  };

  const req = createRequest({
    method: "GET",
    path: "/api/cart/123",
    originalUrl: "/api/cart/123?include=items",
    authorization: "Bearer valid-token",
  });
  const res = createResponse();
  await serviceHostRouter(req, res, () => assert.fail("Expected Cart path to be handled"));

  assert.equal(upstreamRequest.url, "http://localhost:8080/api/cart/123?include=items");
  assert.deepEqual(req.authenticatedUser, { id: "user-1" });
  assert.equal(res.statusCode, 200);
});

test("rejects protected paths without a password token", async (t) => {
  const originalRequest = axios.request;
  let proxied = false;
  t.after(() => {
    axios.request = originalRequest;
  });
  axios.request = async () => {
    proxied = true;
    return { status: 200, headers: {}, data: {} };
  };

  const req = createRequest({
    method: "GET",
    path: "/api/orders",
    originalUrl: "/api/orders",
  });
  const res = createResponse();
  await serviceHostRouter(req, res, () => assert.fail("Expected Orders path to be handled"));

  assert.equal(res.statusCode, 401);
  assert.equal(proxied, false);
});
