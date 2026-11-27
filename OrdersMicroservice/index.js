require("dotenv").config();

const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const { connect, getPool } = require("./config/db");
const swaggerSpecs = require("./config/swagger");
const orderRouter = require("./features/order/order.route");

const PORT = process.env.PORT || 8081;
const app = express();

app.use(express.json());
app.use(cors());

app.get("/health", async (_req, res) => {
  try {
    await getPool().request().query("SELECT 1");
    return res.status(200).json({ status: "ok" });
  } catch {
    return res.status(503).json({ status: "unavailable" });
  }
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

async function start() {
  try {
    await connect();
    app.listen(PORT, () => {
      console.log(`Orders Microservice listening at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Orders Microservice startup failed:", error);
    process.exitCode = 1;
  }
}

if (require.main === module) start();

module.exports = { app, start };