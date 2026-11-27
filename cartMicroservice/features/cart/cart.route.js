const { Router } = require("express");
const Cart = require("./cart.model");
const authenticateCartUser = require("../../middleware/cartAuth");

const normalizeCartItem = (item = {}) => {
  const values = item || {};
  return {
    productId: values.productId || values._id || values.id,
    title: values.title || values.name,
    image: values.image || values.img,
    desc: values.desc || values.description,
    price: Number.isFinite(Number(values.price)) ? Number(values.price) : 0,
    qty: Number(values.qty) || 1,
  };
};

const extractCartId = (rawId) => {
  if (!rawId) return null;
  return String(rawId);
};

function createCartRouter({ CartModel = Cart, authenticateUser = authenticateCartUser } = {}) {
  const cartRouter = Router();
  cartRouter.use(authenticateUser);

  /**
   * @swagger
   * /api/cart:
   *   get:
   *     tags: [Cart]
   *     summary: Get the authenticated user's cart
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Cart items, newest first
   */
  cartRouter.get("/cart", async (req, res) => {
    try {
      const cart = await CartModel.listByUserId(req.cartUserId);
      res.set("Cache-Control", "private, no-store");
      return res.status(200).send(cart);
    } catch (error) {
      console.error("Unable to retrieve cart:", error);
      return res.status(500).send({ err: "Something went wrong" });
    }
  });

  /**
   * @swagger
   * /api/cart:
   *   post:
   *     tags: [Cart]
   *     summary: Add an item to the authenticated user's cart
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CartItemInput'
   *     responses:
   *       200:
   *         description: Cart item added or quantity updated
   *       400:
   *         description: Product ID is required
   */
  cartRouter.post("/cart", async (req, res) => {
    try {
      const payload = normalizeCartItem(req.body);
      if (!payload.productId || !Number.isInteger(payload.qty) || payload.qty < 1) {
        return res.status(400).send({ message: "A product ID and positive whole-number quantity are required" });
      }

      const item = await CartModel.addItem(req.cartUserId, {
        ...payload,
        productId: String(payload.productId),
      });
      return res.status(200).send({ message: "Cart item added or quantity updated", item });
    } catch (error) {
      console.error("Unable to save cart item:", error);
      return res.status(500).send({ err: "Something went wrong" });
    }
  });

  /**
   * @swagger
   * /api/cart/{cartId}:
   *   delete:
   *     tags: [Cart]
   *     summary: Remove an owned cart item
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: cartId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Cart item deleted
   *       404:
   *         description: Cart item not found
   */
  cartRouter.delete("/cart/:cartId", async (req, res) => {
    try {
      const cartId = extractCartId(req.params.cartId);
      const deleted = await CartModel.deleteByIdForUser(cartId, req.cartUserId);
      if (!deleted) {
        return res.status(404).send({ message: "Cart item not found" });
      }
      return res.status(200).send({ message: "Cart item deleted successfully" });
    } catch (error) {
      console.error("Unable to delete cart item:", error);
      return res.status(500).send({ err: "Something went wrong" });
    }
  });

  /**
   * @swagger
   * /api/cart/{cartId}:
   *   patch:
   *     tags: [Cart]
   *     summary: Update an owned cart item
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: cartId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CartItemInput'
   *     responses:
   *       200:
   *         description: Cart item updated
   *       404:
   *         description: Cart item not found
   */
  cartRouter.patch("/cart/:cartId", async (req, res) => {
    try {
      const cartId = extractCartId(req.params.cartId);
      const existing = await CartModel.findByIdForUser(cartId, req.cartUserId);
      if (!existing) {
        return res.status(404).send({ message: "Cart item not found" });
      }

      const payload = req.body || {};
      const requestedProductId = payload.productId || payload._id || payload.id;
      if (requestedProductId && String(requestedProductId) !== existing.productId) {
        return res.status(400).send({ message: "Product ID cannot be changed" });
      }

      const updates = {};
      if (payload.title !== undefined || payload.name !== undefined) updates.title = payload.title || payload.name;
      if (payload.image !== undefined || payload.img !== undefined) updates.image = payload.image || payload.img;
      if (payload.desc !== undefined || payload.description !== undefined) updates.desc = payload.desc || payload.description;
      if (payload.price !== undefined) {
        const price = Number(payload.price);
        updates.price = Number.isFinite(price) ? price : 0;
      }
      if (payload.qty !== undefined) {
        const quantity = Number(payload.qty);
        if (!Number.isInteger(quantity) || quantity < 1) {
          return res.status(400).send({ message: "Quantity must be a positive whole number" });
        }
        updates.qty = quantity;
      }
      const updated = await CartModel.updateByIdForUser(cartId, req.cartUserId, updates);
      if (!updated) {
        return res.status(404).send({ message: "Cart item not found" });
      }
      return res.status(200).send({ message: "Cart item updated successfully", item: updated });
    } catch (error) {
      console.error("Unable to update cart item:", error);
      return res.status(500).send({ err: "Something went wrong" });
    }
  });

  /**
   * @swagger
   * /api/cart:
   *   delete:
   *     tags: [Cart]
   *     summary: Clear the authenticated user's cart
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Cart cleared
   */
  cartRouter.delete("/cart", async (req, res) => {
    try {
      await CartModel.clearByUserId(req.cartUserId);
      return res.status(200).send({ message: "Cart cleared successfully" });
    } catch (error) {
      console.error("Unable to clear cart:", error);
      return res.status(500).send({ err: "Something went wrong" });
    }
  });

  return cartRouter;
}

const cartRouter = createCartRouter();
cartRouter.createCartRouter = createCartRouter;

module.exports = cartRouter;