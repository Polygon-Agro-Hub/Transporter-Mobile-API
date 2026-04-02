const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Transporter Mobile API",
      version: "1.0.0",
      description:
        "API documentation for the Polygon Agro Hub Transporter Mobile app.",
    },
    servers: [
      {
        url: "http://localhost:3000/transporter",
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
  apis: ["./routes/*.js", "./server.js"],
};

const swaggerSpec = swaggerJsdoc(options);

const setupSwagger = (app, basePath) => {
  const swaggerPath = `${basePath}/api-docs`;

  // Fix trailing slash issue
  app.use(swaggerPath, (req, res, next) => {
    if (req.originalUrl === swaggerPath) {
      return res.redirect(`${swaggerPath}/`);
    }
    next();
  });

  // prevents JS loading error
  app.use(
    swaggerPath,
    swaggerUi.serveFiles(swaggerSpec),
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
    })
  );
};

module.exports = setupSwagger;