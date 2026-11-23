const test = require("node:test");
const assert = require("node:assert/strict");
const authenticateCartUser = require("../middleware/cartAuth");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("rejects cart requests without a bearer token", async () => {
  const res = createResponse();
  await authenticateCartUser({ get: () => "" }, res, () => assert.fail("next should not be called"));

  assert.equal(res.statusCode, 401);
});

test("sets the cart owner from the verified Users response", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () =>
    new Response(JSON.stringify({ valid: true, user: { id: "user-1" } }), { status: 200 });

  const req = { get: () => "Bearer valid-token" };
  const res = createResponse();
  let nextCalled = false;
  await authenticateCartUser(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.cartUserId, "user-1");
});

test("reports Users service failures as unavailable", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => new Response(null, { status: 503 });

  const res = createResponse();
  await authenticateCartUser({ get: () => "Bearer token" }, res, () => assert.fail("next should not be called"));

  assert.equal(res.statusCode, 503);
});
