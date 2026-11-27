const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const express = require("express");

const productModelPath = require.resolve("../features/product/product.model");
const productModel = {
    list: async () => [],
    searchByTitle: async () => [],
    findById: async () => null,
    findByTitle: async () => null,
    create: async () => undefined,
    updateById: async () => null,
    deleteById: async () => false,
};

require.cache[productModelPath] = {
    id: productModelPath,
    filename: productModelPath,
    loaded: true,
    exports: productModel,
    children: [],
    paths: [],
};

const productRouter = require("../features/product/product.route");

test("product routes", async (t) => {
    const app = express();
    app.use(express.json(), productRouter);
    const server = app.listen(0);
    await once(server, "listening");
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
        await t.test("lists products filtered by category", async () => {
            let requestedCategory;
            productModel.list = async (categories) => {
                requestedCategory = categories;
                return [{ _id: "product-id", title: "Chicken" }];
            };

            const response = await fetch(`${baseUrl}/product?categories=Chicken`);
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), [{ _id: "product-id", title: "Chicken" }]);
            assert.equal(requestedCategory, "Chicken");
        });

        await t.test("rejects incomplete product creation", async () => {
            let createCalled = false;
            productModel.create = async () => {
                createCalled = true;
            };

            const response = await fetch(`${baseUrl}/product`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ title: "Chicken" }),
            });
            assert.equal(response.status, 400);
            assert.equal(createCalled, false);
        });

        await t.test("rejects values exceeding the SQL title limit", async () => {
            const response = await fetch(`${baseUrl}/product`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    image: "image-url",
                    title: "x".repeat(301),
                    desc: "Chicken meal",
                    categories: "Chicken",
                    price: 12.5,
                    serve: "2 pieces",
                    type: "Non-Veg",
                }),
            });
            assert.equal(response.status, 400);
        });

        await t.test("creates valid products with a numeric price", async () => {
            let createdProduct;
            productModel.findByTitle = async () => null;
            productModel.create = async (product) => {
                createdProduct = product;
            };

            const response = await fetch(`${baseUrl}/product`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    image: "image-url",
                    title: "Chicken",
                    desc: "Chicken meal",
                    categories: "Chicken",
                    price: "12.5",
                    serve: "2 pieces",
                    type: "Non-Veg",
                }),
            });
            assert.equal(response.status, 201);
            assert.equal(createdProduct.price, 12.5);
        });

        await t.test("treats a non-existent product update as not found", async () => {
            productModel.updateById = async () => null;

            const response = await fetch(`${baseUrl}/product/00000000-0000-0000-0000-000000000000`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ title: "Updated" }),
            });
            assert.equal(response.status, 404);
        });
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
});
