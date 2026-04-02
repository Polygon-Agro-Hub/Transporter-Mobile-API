const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Transporter Mobile API",
      version: "1.0.0",
      description: "API documentation for the Polygon Agro Hub Transporter Mobile app.",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development Server",
      },
      {
        url: "https://transporter-mobile-api.vercel.app/transporter", 
        description: "Production Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./routes/*.js", "./server.js"], // Files containing annotations
};

const swaggerSpec = swaggerJsdoc(options);

const setupSwagger = (app, basePath) => {
  const swaggerPath = `${basePath}/api-docs`;
  
  // Enforce trailing slash so relative JS/CSS requests resolve correctly
  app.use(swaggerPath, (req, res, next) => {
    if (req.originalUrl === swaggerPath) {
      return res.redirect(`${swaggerPath}/`);
    }
    next();
  });

  app.use(swaggerPath, swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
};

module.exports = setupSwagger;
