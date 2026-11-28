const test = require("node:test");
const assert = require("node:assert/strict");
const authenticatePasswordToken = require("../middleware/passwordAuth");

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

test("rejects requests without a bearer token", async () => {
  const res = createResponse();
  const authenticated = await authenticatePasswordToken({ get: () => "" }, res);

  assert.equal(authenticated, false);
  assert.equal(res.statusCode, 401);
});

test("accepts a valid password token verified by Users", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async (url, options) => {
    assert.match(url, /\/auth\/verify$/);
    assert.deepEqual(JSON.parse(options.body), { token: "valid-token" });
    return new Response(JSON.stringify({ valid: true, user: { id: "user-1" } }), { status: 200 });
  };

  const req = { get: () => "Bearer valid-token" };
  const res = createResponse();
  const authenticated = await authenticatePasswordToken(req, res);

  assert.equal(authenticated, true);
  assert.deepEqual(req.authenticatedUser, { id: "user-1" });
});

test("reports Users service failures as unavailable", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => new Response(null, { status: 503 });

  const res = createResponse();
  const authenticated = await authenticatePasswordToken({ get: () => "Bearer token" }, res);

  assert.equal(authenticated, false);
  assert.equal(res.statusCode, 503);
});
