const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const cartRouter = require("../features/cart/cart.route");

const records = [];
let nextId = 0;

class FakeCart {
  constructor(data) {
    Object.assign(this, data);
    this._id = `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`;
  }

  static async listByUserId(userId) {
    return records.filter((record) => record.userId === userId);
  }

  static async addItem(userId, incoming) {
    let record = records.find((item) =>
      item.userId === userId && item.productId === incoming.productId
    );
    if (!record) {
      record = new FakeCart({ ...incoming, userId });
      records.push(record);
      return record;
    }

    Object.assign(record, incoming, { userId, qty: record.qty + incoming.qty });
    return record;
  }

  static async findByIdForUser(cartId, userId) {
    return records.find((record) => record._id === cartId && record.userId === userId) || null;
  }

  static async updateByIdForUser(cartId, userId, updates) {
    const record = await this.findByIdForUser(cartId, userId);
    if (!record) return null;
    Object.assign(record, updates);
    return record;
  }

  static async deleteByIdForUser(cartId, userId) {
    const index = records.findIndex((record) => record._id === cartId && record.userId === userId);
    if (index === -1) return false;
    records.splice(index, 1);
    return true;
  }

  static async clearByUserId(userId) {
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (records[index].userId === userId) records.splice(index, 1);
    }
  }
}

test("cart items are private to each authenticated user", async (t) => {
  records.length = 0;
  nextId = 0;

  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    cartRouter.createCartRouter({
      CartModel: FakeCart,
      authenticateUser: (req, res, next) => {
        req.cartUserId = req.get("x-test-user");
        return next();
      },
    })
  );
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));

  const origin = `http://127.0.0.1:${server.address().port}`;
  const addItem = async (userId) => {
    const response = await fetch(`${origin}/api/cart`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": userId },
      body: JSON.stringify({
        _id: "product-1",
        productId: "product-1",
        userId: "attacker-controlled",
        title: "Chicken",
        price: 4.5,
      }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };

  const firstAliceItem = (await addItem("alice")).item;
  const aliceItem = (await addItem("alice")).item;
  const bobItem = (await addItem("bob")).item;
  assert.equal(firstAliceItem._id, aliceItem._id);
  assert.equal(aliceItem.qty, 2);
  assert.notEqual(aliceItem._id, bobItem._id);
  assert.equal(aliceItem.userId, "alice");
  assert.equal(bobItem.userId, "bob");

  const crossUserUpdate = await fetch(`${origin}/api/cart/${encodeURIComponent(aliceItem._id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-test-user": "bob" },
    body: JSON.stringify({ qty: 9 }),
  });
  assert.equal(crossUserUpdate.status, 404);

  const updatedAliceItem = await fetch(`${origin}/api/cart/${encodeURIComponent(aliceItem._id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-test-user": "alice" },
    body: JSON.stringify({ qty: 3 }),
  }).then((res) => res.json());
  assert.equal(updatedAliceItem.item.qty, 3);

  const aliceItems = await fetch(`${origin}/api/cart`, { headers: { "x-test-user": "alice" } }).then((res) => res.json());
  const bobItems = await fetch(`${origin}/api/cart`, { headers: { "x-test-user": "bob" } }).then((res) => res.json());
  assert.deepEqual(aliceItems.map((item) => item._id), [aliceItem._id]);
  assert.deepEqual(bobItems.map((item) => item._id), [bobItem._id]);

  const crossUserDelete = await fetch(`${origin}/api/cart/${encodeURIComponent(aliceItem._id)}`, {
    method: "DELETE",
    headers: { "x-test-user": "bob" },
  });
  assert.equal(crossUserDelete.status, 404);

  await fetch(`${origin}/api/cart`, { method: "DELETE", headers: { "x-test-user": "alice" } });
  const remainingBobItems = await fetch(`${origin}/api/cart`, { headers: { "x-test-user": "bob" } }).then((res) => res.json());
  assert.deepEqual(remainingBobItems.map((item) => item._id), [bobItem._id]);
});
