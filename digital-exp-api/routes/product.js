const express = require("express");
const axios = require("axios");
const router = express.Router();

const productsServiceUrl = process.env.PRODUCTS_SERVICE_URL || "http://localhost:8083";

router.get("/", async (req, res) => {
  try {
    const response = await axios.get(`${productsServiceUrl}/api/product`, {
      headers: {
        Authorization: req.headers.authorization,
      },
      params: req.query,
    });
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || "Products service error";
    res.status(status).json({ message });
  }
});

module.exports = router;
