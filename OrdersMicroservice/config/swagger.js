const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Orders Microservice API',
      version: '1.0.0',
      description: 'API documentation for Orders Microservice',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 8081}`,
        description: 'Orders Microservice Server',
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
        OrderItem: {
          type: 'object',
          properties: {
            productId: { type: 'string' },
            title: { type: 'string' },
            image: { type: 'string' },
            desc: { type: 'string' },
            price: { type: 'number' },
            qty: { type: 'integer' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            orderNo: { type: 'string' },
            userId: { type: 'string' },
            userName: { type: 'string' },
            userMobile: { type: 'string' },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/OrderItem' },
            },
            totalItems: { type: 'integer' },
            totalPrice: { type: 'number' },
            paymentMethod: { type: 'string' },
            status: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, '../features/**/*.route.js')], // Path to the API routes
};

const specs = swaggerJsdoc(options);

module.exports = specs;