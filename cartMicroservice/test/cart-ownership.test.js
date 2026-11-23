const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const cartRouter = require("../features/cart/cart.route");

const records = [];
let nextId = 0;

function matches(record, query) {
  return Object.entries(query).every(([key, value]) => String(record[key]) === String(value));
}

class FakeCart {
  constructor(data) {
    Object.assign(this, data);
    this._id = `cart-${++nextId}`;
  }

  async save() {
    const index = records.findIndex((record) => record._id === this._id);
    if (index === -1) records.push(this);
    else records[index] = this;
    return this;
  }

  static find(query) {
    return {
      sort: async () => records.filter((record) => matches(record, query)),
    };
  }

  static async findOne(query) {
    return records.find((record) => matches(record, query)) || null;
  }

  static async findOneAndUpdate(query, update) {
    let record = records.find((item) => matches(item, query));
    if (!record) {
      record = new FakeCart(query);
      records.push(record);
    }

    Object.assign(record, update.$set);
    record.qty = Number(record.qty || 0) + update.$inc.qty;
    return record;
  }

  static async findOneAndDelete(query) {
    const index = records.findIndex((record) => matches(record, query));
    if (index === -1) return null;
    return records.splice(index, 1)[0];
  }

  static async deleteMany(query) {
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (matches(records[index], query)) records.splice(index, 1);
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
