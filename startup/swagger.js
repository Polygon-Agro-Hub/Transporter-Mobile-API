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
        description: "Local Server",
      },
      {
        url: "https://transporter-mobile-api.vercel.app/transporter",
        description: "Development Server",
      },
      {
        url: "https://transporter-mobile-api-prod.vercel.app/transporter",
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
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false
            },
            status: {
              type: "string",
              example: "error"
            },
            message: {
              type: "string",
              example: "Error message details"
            },
            errors: {
              type: "array",
              items: {
                type: "string"
              }
            }
          }
        },
        SuccessResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true
            },
            status: {
              type: "string",
              example: "success"
            },
            message: {
              type: "string",
              example: "Operation completed successfully"
            }
          }
        },
        UserProfile: {
          type: "object",
          properties: {
            empId: {
              type: "string",
              example: "DRV001"
            },
            firstNameEnglish: {
              type: "string",
              example: "John"
            },
            lastNameEnglish: {
              type: "string",
              example: "Doe"
            },
            phoneCode01: {
              type: "string",
              example: "+94"
            },
            phoneNumber01: {
              type: "string",
              example: "771234567"
            },
            nic: {
              type: "string",
              example: "199512345678"
            },
            email: {
              type: "string",
              example: "john.doe@example.com"
            },
            image: {
              type: "string",
              example: "https://r2.example.com/users/profile-images/image.png"
            },
            passwordUpdated: {
              type: "integer",
              example: 1
            },
            createdAt: {
              type: "string",
              format: "date-time",
              example: "2026-06-25T10:00:00.000Z"
            },
            vType: {
              type: "string",
              nullable: true,
              example: "Lorry"
            },
            vRegNo: {
              type: "string",
              nullable: true,
              example: "WP-LH-1234"
            }
          }
        },
        DriverOrder: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              example: 12
            },
            driverId: {
              type: "integer",
              example: 3
            },
            orderId: {
              type: "integer",
              example: 45
            },
            drvStatus: {
              type: "string",
              enum: ["Todo", "On the way", "Hold", "Completed", "Return", "Return Received"],
              example: "Todo"
            },
            isHandOver: {
              type: "integer",
              enum: [0, 1],
              example: 0
            },
            handOverOfficer: {
              type: "integer",
              nullable: true,
              example: 5
            },
            handOverTime: {
              type: "string",
              format: "date-time",
              nullable: true,
              example: null
            },
            handOverPrice: {
              type: "number",
              nullable: true,
              example: null
            },
            startTime: {
              type: "string",
              format: "date-time",
              nullable: true,
              example: null
            },
            completeTime: {
              type: "string",
              format: "date-time",
              nullable: true,
              example: null
            },
            signature: {
              type: "string",
              nullable: true,
              example: null
            },
            createdAt: {
              type: "string",
              format: "date-time",
              example: "2026-06-26T08:00:00.000Z"
            },
            invNo: {
              type: "string",
              example: "INV-2026-0001"
            },
            amount: {
              type: "number",
              example: 1500.50
            },
            paymentMethod: {
              type: "string",
              example: "Cash"
            }
          }
        },
        ComplaintCategory: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              example: 1
            },
            categoryEnglish: {
              type: "string",
              example: "Late Delivery"
            },
            categorySinhala: {
              type: "string",
              example: "ප්‍රමාද වූ භාරදීම"
            },
            categoryTamil: {
              type: "string",
              example: "தாமதமான விநியோகம்"
            }
          }
        },
        HoldReason: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              example: 1
            },
            rsnEnglish: {
              type: "string",
              example: "Customer unavailable"
            },
            rsnSinhala: {
              type: "string",
              example: "පාරිභෝගිකයා නොමැත"
            },
            rsnTamil: {
              type: "string",
              example: "வாடிக்கையாளர் இல்லை"
            }
          }
        },
        ReturnReason: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              example: 1
            },
            rsnEnglish: {
              type: "string",
              example: "Damaged Items"
            },
            rsnSinhala: {
              type: "string",
              example: "හානි වූ අයිතම"
            },
            rsnTamil: {
              type: "string",
              example: "சேதமடைந்த பொருட்கள்"
            }
          }
        }
      }
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

  // prevents JS loading error on Vercel
  app.use(
    swaggerPath,
    swaggerUi.serveFiles(swaggerSpec),
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCssUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.3.0/swagger-ui.min.css",
      customJs: [
        "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.3.0/swagger-ui-bundle.js",
        "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.3.0/swagger-ui-standalone-preset.js",
      ],
    })
  );
};

module.exports = setupSwagger;