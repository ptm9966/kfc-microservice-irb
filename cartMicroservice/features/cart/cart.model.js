const { Schema, model } = require("mongoose");

const cartSchema = new Schema({
  userId: { type: String, required: true },
  productId: { type: String, required: true },
  image: String,
  title: String,
  desc: String,
  price: Number,
  qty: Number,
});

cartSchema.index(
  { userId: 1, productId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: "string" } } }
);

module.exports = model("cart", cartSchema);