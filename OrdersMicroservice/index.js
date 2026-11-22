require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const swaggerUi = require("swagger-ui-express");
const connect = require("./config/db");
const swaggerSpecs = require("./config/swagger");
const orderRouter = require("./features/order/order.route");

const PORT = process.env.PORT || 8081;
const app = express();

app.use(express.json());
app.use(cors());

app.get("/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  return res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
  });
});

// Swagger Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  customCss: '.swagger-ui { font-family: Arial, sans-serif; }',
  customSiteTitle: 'Orders Microservice API Documentation'
}));

app.get("/", (req, res) => {
  res.redirect("/api-docs");
});

app.use("/api", orderRouter);

app.listen(PORT, async () => {
    await connect();
    console.log(`Orders Microservice listening at http://localhost:${PORT}`);
});