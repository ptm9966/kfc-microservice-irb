const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'User Microservice API',
      version: '1.0.0',
      description: 'API documentation for User Authentication and Management Microservice',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: '/',
        description: 'Current host',
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
    },
  },
  apis: [
    path.join(__dirname, '../features/**/*.route.js'),
    path.join(__dirname, '../index.js'),
  ],
};

const specs = swaggerJsdoc(options);

module.exports = specs;