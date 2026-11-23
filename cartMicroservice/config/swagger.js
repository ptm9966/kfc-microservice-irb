const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'KFC React App API',
      version: '1.0.0',
      description: 'API documentation for KFC React App Backend',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 8080}`,
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        CartItem: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            productId: { type: 'string' },
            title: { type: 'string' },
            image: { type: 'string' },
            desc: { type: 'string' },
            price: { type: 'number' },
            qty: { type: 'integer' },
          },
        },
        CartItemInput: {
          type: 'object',
          description: 'Provide productId, _id, or id as the product identifier. The response _id identifies the cart item.',
          properties: {
            _id: { type: 'string' },
            productId: { type: 'string' },
            id: { type: 'string' },
            title: { type: 'string' },
            name: { type: 'string' },
            image: { type: 'string' },
            desc: { type: 'string' },
            price: { type: 'number' },
            qty: { type: 'integer' },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, '../features/cart/*.route.js')], // Path to the API routes (cart only)
};

const specs = swaggerJsdoc(options);

module.exports = specs;
