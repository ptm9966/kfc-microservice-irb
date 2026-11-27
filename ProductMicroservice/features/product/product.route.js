const express = require("express");
const Product = require("./product.model");

const productRouter = express.Router();
const productStringLimits = { title: 300, categories: 128, serve: 128, type: 64 };

function isValidProductString(field, value) {
    const maxLength = productStringLimits[field];
    return typeof value === "string" &&
        value.trim().length > 0 &&
        (!maxLength || value.length <= maxLength);
}

/**
 * @swagger
 * /api/product:
 *   get:
 *     summary: Get all products or filter by category
 *     description: Retrieve all products or filter by category
 *     tags:
 *       - Products
 *     parameters:
 *       - in: query
 *         name: categories
 *         schema:
 *           type: string
 *         description: Filter products by category
 *     responses:
 *       200:
 *         description: List of products
 *       500:
 *         description: Error retrieving products
 */
productRouter.get("/product", async (req, res) => {
    const { categories } = req.query;
    if (categories !== undefined && typeof categories !== "string") {
        return res.status(400).send({ "error": "Category must be a string" });
    }

    try {
        const products = await Product.list(categories);
        res.status(200).send(products);
    } catch (error) {
        console.error(error);
        res.status(500).send({ "error": "Something went wrong while fetching products" });
    }
});

/**
 * @swagger
 * /api/product/search:
 *   get:
 *     summary: Search products by title
 *     description: Search products by title keyword
 *     tags:
 *       - Products
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         required: true
 *         description: Search query of up to 300 characters
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Missing or invalid search query
 *       500:
 *         description: Search error
 */
productRouter.get("/product/search", async (req, res) => {
    const { q } = req.query;
    if (typeof q !== "string" || !q.trim() || q.length > 300) {
        return res.status(400).send({
            "error": "Search query parameter 'q' is required and must be at most 300 characters",
        });
    }

    try {
        const products = await Product.searchByTitle(q);
        res.status(200).send(products);
    } catch (error) {
        console.error(error);
        res.status(500).send({ "error": "Something went wrong while searching products" });
    }
});

/**
 * @swagger
 * /api/product/{productId}:
 *   get:
 *     summary: Get product by ID
 *     description: Retrieve a single product by its ID
 *     tags:
 *       - Products
 *     parameters:
 *       - in: path
 *         name: productId
 *         schema:
 *           type: string
 *         required: true
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Product not found
 *       500:
 *         description: Error retrieving product
 */
productRouter.get("/product/:productId", async (req, res) => {
    const { productId } = req.params;
    try {
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).send({ "error": "Product not found" });
        }
        res.status(200).send(product);
    } catch (error) {
        console.error(error);
        res.status(500).send({ "error": "Something went wrong while fetching product" });
    }
});

/**
 * @swagger
 * /api/product:
 *   post:
 *     summary: Create a new product
 *     description: Add a new product to the catalog
 *     tags:
 *       - Products
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *               - title
 *               - desc
 *               - categories
 *               - price
 *               - serve
 *               - type
 *             properties:
 *               image:
 *                 type: string
 *                 example: "https://example.com/image.jpg"
 *               title:
 *                 type: string
 *                 example: "Chicken Bucket"
 *               desc:
 *                 type: string
 *                 example: "Delicious fried chicken bucket"
 *               categories:
 *                 type: string
 *                 example: "Chicken"
 *               price:
 *                 type: number
 *                 example: 15.99
 *               serve:
 *                 type: string
 *                 example: "4 pieces"
 *               type:
 *                 type: string
 *                 example: "Non-Veg"
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: Product already exists or invalid data
 *       500:
 *         description: Error creating product
 */
productRouter.post("/product", async (req, res) => {
    const payload = req.body;
    const requiredStringFields = ["image", "title", "desc", "categories", "serve", "type"];
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        requiredStringFields.some((field) =>
            !isValidProductString(field, payload[field])
        ) ||
        payload.price === undefined || payload.price === null || payload.price === "" ||
        !Number.isFinite(Number(payload.price))) {
        return res.status(400).send({ "error": "All product fields must be valid" });
    }

    try {
        const existing = await Product.findByTitle(payload.title);
        if (existing) {
            return res.status(400).send({ "error": "Product with this title already exists" });
        }

        await Product.create({ ...payload, price: Number(payload.price) });
        res.status(201).send({ "message": "Product created successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).send({ "error": "Something went wrong while creating product" });
    }
});

/**
 * @swagger
 * /api/product/{productId}:
 *   delete:
 *     summary: Delete a product
 *     description: Delete a product by ID
 *     tags:
 *       - Products
 *     parameters:
 *       - in: path
 *         name: productId
 *         schema:
 *           type: string
 *         required: true
 *         description: Product ID
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       404:
 *         description: Product not found
 *       500:
 *         description: Error deleting product
 */
productRouter.delete("/product/:productId", async (req, res) => {
    const { productId } = req.params;

    try {
        const deleted = await Product.deleteById(productId);
        if (!deleted) {
            return res.status(404).send({ "error": "Product not found" });
        }

        res.status(200).send({ "message": "Product deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).send({ "error": "Something went wrong while deleting product" });
    }
});

/**
 * @swagger
 * /api/product/{productId}:
 *   patch:
 *     summary: Update a product
 *     description: Update product details by ID
 *     tags:
 *       - Products
 *     parameters:
 *       - in: path
 *         name: productId
 *         schema:
 *           type: string
 *         required: true
 *         description: Product ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *               title:
 *                 type: string
 *               desc:
 *                 type: string
 *               categories:
 *                 type: string
 *               price:
 *                 type: number
 *               serve:
 *                 type: string
 *               type:
 *                 type: string
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       404:
 *         description: Product not found
 *       500:
 *         description: Error updating product
 */
productRouter.patch("/product/:productId", async (req, res) => {
    const { productId } = req.params;
    const payload = req.body;
    const allowedFields = ["image", "title", "desc", "categories", "price", "serve", "type"];
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return res.status(400).send({ "error": "Product updates must be a JSON object" });
    }

    const updates = Object.fromEntries(
        Object.entries(payload).filter(([field]) => allowedFields.includes(field))
    );
    if (Object.keys(updates).length === 0 ||
        Object.entries(updates).some(([field, value]) => {
            if (field === "price") {
                return value === null || value === "" || !Number.isFinite(Number(value));
            }
            return !isValidProductString(field, value);
        })) {
        return res.status(400).send({ "error": "Product updates contain invalid fields" });
    }
    if (Object.hasOwn(updates, "price")) updates.price = Number(updates.price);

    try {
        const updated = await Product.updateById(productId, updates);
        if (!updated) {
            return res.status(404).send({ "error": "Product not found" });
        }

        res.status(200).send({ "message": "Product updated successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).send({ "error": "Something went wrong while updating product" });
    }
});

module.exports = productRouter;