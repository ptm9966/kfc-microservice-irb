const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const express = require("express");

test("Swagger spec exposes the Orders API endpoints", () => {
  const { paths } = require("../config/swagger");

  assert.ok(paths["/api/orders"]?.get);
  assert.ok(paths["/api/orders"]?.post);
  assert.ok(paths["/api/orders/{orderId}"]?.get);
  assert.ok(paths["/api/orders/{orderId}/status"]?.patch);
});

async function startServer(t, app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test("order history uses the verified user and rejects unverified tokens", async (t) => {
  const previousUsersServiceUrl = process.env.USERS_SERVICE_URL;
  t.after(() => {
    if (previousUsersServiceUrl === undefined) delete process.env.USERS_SERVICE_URL;
    else process.env.USERS_SERVICE_URL = previousUsersServiceUrl;
  });

  const usersApp = express();
  usersApp.use(express.json());
  usersApp.post("/auth/verify", (req, res) => {
    if (req.body.token !== "valid-password-token") {
      return res.status(401).json({ valid: false });
    }
    return res.json({ valid: true, user: { id: "user-123" } });
  });
  process.env.USERS_SERVICE_URL = await startServer(t, usersApp);

  let listUserId;
  let detailQuery;
  let statusUpdate;
  let createdOrder;
  const OrderModel = {
    async listByUserId(userId) {
      listUserId = userId;
      return [];
    },
    async findByIdForUser(orderId, userId) {
      detailQuery = { orderId, userId };
      return null;
    },
    async updateStatus(orderId, status) {
      statusUpdate = { orderId, status };
      return { _id: orderId, status };
    },
    async create(order) {
      createdOrder = order;
      return order;
    },
  };
  const orderApp = express();
  orderApp.use(express.json());
  orderApp.use(require("../features/order/order.route").createOrderRouter(OrderModel));
  const baseUrl = await startServer(t, orderApp);

  const missingTokenResponse = await fetch(`${baseUrl}/orders`);
  assert.equal(missingTokenResponse.status, 401);

  const invalidTokenResponse = await fetch(`${baseUrl}/orders`, {
    headers: { Authorization: "Bearer invalid-token" },
  });
  assert.equal(invalidTokenResponse.status, 401);

  const response = await fetch(`${baseUrl}/orders?userId=somebody-else`, {
    headers: { Authorization: "Bearer valid-password-token" },
  });
  assert.equal(response.status, 200);
  assert.equal(listUserId, "user-123");
  assert.deepEqual(await response.json(), []);

  const detailResponse = await fetch(`${baseUrl}/orders/order-456?userId=somebody-else`, {
    headers: { Authorization: "Bearer valid-password-token" },
  });
  assert.equal(detailResponse.status, 404);
  assert.deepEqual(detailQuery, { orderId: "order-456", userId: "user-123" });

  const statusResponse = await fetch(`${baseUrl}/orders/order-789/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "Preparing" }),
  });
  assert.equal(statusResponse.status, 200);
  assert.deepEqual(statusUpdate, { orderId: "order-789", status: "Preparing" });

  const createResponse = await fetch(`${baseUrl}/orders`, {
    method: "POST",
    headers: {
      Authorization: "Bearer valid-password-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: "somebody-else",
      items: [{ title: "Test item", price: 4, qty: 1 }],
    }),
  });
  assert.equal(createResponse.status, 201);
  assert.equal(createdOrder.userId, "user-123");
});
