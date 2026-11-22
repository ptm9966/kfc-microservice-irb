const { Router } = require("express");
const Order = require("./order.model");
const authenticateOrderUser = require("../../middleware/orderAuth");

function createOrderRouter(OrderModel = Order) {
  const orderRouter = Router();

  const normalizeOrderItems = (items = []) =>
    items.map((item) => ({
      productId: item.productId || item._id || item.id,
      title: item.title || item.name,
      image: item.image || item.img,
      desc: item.desc || item.description,
      price: Number(item.price) || 0,
      qty: Number(item.qty) || 1,
    }));

  /**
   * @swagger
   * /api/orders:
   *   get:
   *     tags: [Orders]
   *     summary: List the authenticated user's orders
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Orders sorted from newest to oldest
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Order'
   *       401:
   *         description: Missing or invalid password-login token
   *       503:
   *         description: User authentication service unavailable
   */
  orderRouter.get("/orders", authenticateOrderUser, async (req, res) => {
    try {
      const orders = await OrderModel.find({ userId: req.orderUserId }).sort({ createdAt: -1 });
      res.set("Cache-Control", "private, no-store");
      return res.status(200).send(orders);
    } catch (error) {
      console.log(error);
      return res.status(500).send({ err: "Something went wrong" });
    }
  });

  /**
   * @swagger
   * /api/orders/{orderId}:
   *   get:
   *     tags: [Orders]
   *     summary: Get an order owned by the authenticated user
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *         description: MongoDB order ID
   *     responses:
   *       200:
   *         description: Order details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Order'
   *       401:
   *         description: Missing or invalid password-login token
   *       404:
   *         description: Order not found for this user
   *       503:
   *         description: User authentication service unavailable
   */
  orderRouter.get("/orders/:orderId", authenticateOrderUser, async (req, res) => {
    try {
      const order = await OrderModel.findOne({
        _id: req.params.orderId,
        userId: req.orderUserId,
      });
      if (!order) {
        return res.status(404).send({ message: "Order not found" });
      }
      res.set("Cache-Control", "private, no-store");
      return res.status(200).send(order);
    } catch (error) {
      console.log(error);
      return res.status(500).send({ err: "Something went wrong" });
    }
  });

  /**
   * @swagger
   * /api/orders/{orderId}/status:
   *   patch:
   *     tags: [Orders]
   *     summary: Update an order's status
   *     parameters:
   *       - in: path
   *         name: orderId
   *         required: true
   *         schema:
   *           type: string
   *         description: MongoDB order ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [status]
   *             properties:
   *               status:
   *                 type: string
   *                 example: Preparing
   *     responses:
   *       200:
   *         description: Order status updated
   *       400:
   *         description: Status is required
   *       404:
   *         description: Order not found
   */
  orderRouter.patch("/orders/:orderId/status", async (req, res) => {
    try {
      const { status } = req.body;

      if (!status) {
        return res.status(400).send({ message: "Status is required" });
      }

      const order = await OrderModel.findByIdAndUpdate(
        req.params.orderId,
        { status },
        { new: true }
      );

      if (!order) {
        return res.status(404).send({ message: "Order not found" });
      }

      return res.status(200).send({ message: "Order status updated successfully", order });
    } catch (error) {
      console.log(error);
      return res.status(500).send({ err: "Something went wrong" });
    }
  });

  /**
   * @swagger
   * /api/orders:
   *   post:
   *     tags: [Orders]
   *     summary: Create an order for the authenticated user
   *     description: The service derives order ownership from the verified bearer token.
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [items]
   *             properties:
   *               userName:
   *                 type: string
   *               userMobile:
   *                 type: string
   *               items:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   $ref: '#/components/schemas/OrderItem'
   *               totalPrice:
   *                 type: number
   *                 example: 24.5
   *               totalItems:
   *                 type: integer
   *                 example: 2
   *               paymentMethod:
   *                 type: string
   *                 example: Card
   *     responses:
   *       201:
   *         description: Order created
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 message:
   *                   type: string
   *                 order:
   *                   $ref: '#/components/schemas/Order'
   *       400:
   *         description: Items are required
   *       401:
   *         description: Missing or invalid password-login token
   *       503:
   *         description: User authentication service unavailable
   */
  orderRouter.post("/orders", authenticateOrderUser, async (req, res) => {
    try {
      const {
        items,
        userName,
        userMobile,
        paymentMethod,
        totalPrice,
        totalItems,
      } = req.body;

      if (!items || !items.length) {
        return res.status(400).send({ message: "Items are required" });
      }

      const orderItems = normalizeOrderItems(items);
      const computedTotalItems = orderItems.reduce((sum, item) => sum + item.qty, 0);
      const computedTotalPrice = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);

      const order = await OrderModel.create({
        userId: req.orderUserId,
        userName: req.orderUser?.name || userName || "",
        userMobile: req.orderUser?.mobile || userMobile,
        items: orderItems,
        totalItems: Number(totalItems) || computedTotalItems,
        totalPrice: Number(totalPrice) || computedTotalPrice,
        paymentMethod: paymentMethod || "Card",
        status: "Placed",
      });

      return res.status(201).send({
        message: "Order placed successfully",
        order,
      });
    } catch (error) {
      console.log(error);
      return res.status(500).send({ err: "Something went wrong" });
    }
  });

  return orderRouter;
}

const orderRouter = createOrderRouter();
orderRouter.createOrderRouter = createOrderRouter;

module.exports = orderRouter;