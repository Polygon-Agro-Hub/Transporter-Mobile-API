const Joi = require("joi");

// Login Schema
const loginSchema = Joi.object({
  empId: Joi.string().trim().min(3).max(50).required().messages({
    "string.empty": "Employee ID is required",
    "string.min": "Employee ID must be at least 3 characters long",
    "string.max": "Employee ID must be at most 50 characters long",
  }),
  password: Joi.string().trim().max(100).required().messages({
    "string.empty": "Password is required",
    "string.max": "Password must be at most 100 characters long",
  }),
});

// Change Password Schema
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().trim().required().messages({
    "string.empty": "Current password is required",
  }),
  newPassword: Joi.string().trim().required().messages({
    "string.empty": "New password is required",
  }),
});

// Register Driver Schema
const registerDriverSchema = Joi.object({
  personal: Joi.object({
    firstName: Joi.string().trim().required().messages({
      "string.empty": "First name is required",
    }),
    lastName: Joi.string().trim().required().messages({
      "string.empty": "Last name is required",
    }),
    phone1: Joi.string().trim().required().messages({
      "string.empty": "Primary phone number is required",
    }),
    phone2: Joi.string().trim().allow("", null).optional(),
    nic: Joi.string().trim().required().messages({
      "string.empty": "National Identity Card (NIC) is required",
    }),
    email: Joi.string().trim().allow("", null).optional(),
    languages: Joi.array().items(Joi.string()).default(["English"]),
    jobRole: Joi.string()
      .valid("Light Weight Driver", "Heavy Weight Driver")
      .default("Light Weight Driver"),
    profilePhoto: Joi.string().allow("", null).optional(),
  }).required(),
  residential: Joi.object({
    houseNumber: Joi.string().trim().required().messages({
      "string.empty": "House number is required",
    }),
    streetName: Joi.string().trim().required().messages({
      "string.empty": "Street name is required",
    }),
    city: Joi.string().trim().required().messages({
      "string.empty": "City is required",
    }),
    district: Joi.string().trim().required().messages({
      "string.empty": "District is required",
    }),
    province: Joi.string().trim().allow("", null).optional(),
    country: Joi.string().trim().default("Sri Lanka"),
  }).required(),
  bank: Joi.object({
    bankAccountHolder: Joi.string().trim().required().messages({
      "string.empty": "Account holder name is required",
    }),
    bankAccountNumber: Joi.string().trim().required().messages({
      "string.empty": "Account number is required",
    }),
    bankName: Joi.string().trim().required().messages({
      "string.empty": "Bank name is required",
    }),
    bankBranch: Joi.string().trim().required().messages({
      "string.empty": "Branch name is required",
    }),
  }).required(),
  license: Joi.object({
    licenseNumber: Joi.string()
      .trim()
      .required()
      .custom((value, helpers) => {
        if (/\s/.test(value)) {
          return helpers.error("license.spaces");
        }
        if (value.length < 7) {
          return helpers.error("string.min");
        }
        if (value.length > 9) {
          return helpers.error("string.max");
        }
        if (/[a-z]/.test(value)) {
          return helpers.error("license.uppercase");
        }
        return value.toUpperCase();
      })
      .messages({
        "string.empty": "Driving license ID is required",
        "any.required": "Driving license ID is required",
        "license.spaces": "Spaces are not allowed in driving license ID",
        "string.min": "Driving license ID must be at least 7 characters",
        "string.max": "Driving license ID must be at most 9 characters",
        "license.uppercase": "Driving license ID must use English uppercase letters",
      }),
    licenseFrontPhoto: Joi.string().allow("", null).optional(),
    licenseBackPhoto: Joi.string().allow("", null).optional(),
  }).required(),
  insurance: Joi.object({
    insurancePolicyNumber: Joi.string()
      .trim()
      .required()
      .custom((value, helpers) => {
        if (/\s/.test(value)) {
          return helpers.error("insurance.spaces");
        }
        if (value.length < 5) {
          return helpers.error("string.min");
        }
        if (value.length > 30) {
          return helpers.error("string.max");
        }
        if (!/^[A-Za-z0-9\/-]+$/.test(value)) {
          return helpers.error("insurance.pattern");
        }
        return value.toUpperCase();
      })
      .messages({
        "string.empty": "Insurance policy number is required",
        "any.required": "Insurance policy number is required",
        "insurance.spaces": "Spaces are not allowed in insurance policy number",
        "string.min": "Insurance policy number must be at least 5 characters",
        "string.max": "Insurance policy number must be at most 30 characters",
        "insurance.pattern":
          "Insurance policy number can only contain alphanumeric characters, hyphens (-), and slashes (/)",
      }),
    insuranceExpiry: Joi.string().trim().allow("", null).optional(),
    insuranceFrontPhoto: Joi.string().allow("", null).optional(),
    insuranceBackPhoto: Joi.string().allow("", null).optional(),
  }).required(),
  vehicle: Joi.object({
    vehicleNumber: Joi.string()
      .trim()
      .required()
      .custom((value, helpers) => {
        if (/\s/.test(value)) {
          return helpers.error("vehicle.spaces");
        }
        if (value.length < 5) {
          return helpers.error("string.min");
        }
        if (value.length > 10) {
          return helpers.error("string.max");
        }
        if (!/^[A-Za-z0-9-]+$/.test(value)) {
          return helpers.error("vehicle.pattern");
        }
        return value.toUpperCase();
      })
      .messages({
        "string.empty": "Vehicle registration number is required",
        "any.required": "Vehicle registration number is required",
        "vehicle.spaces": "Spaces are not allowed in vehicle registration number",
        "string.min": "Vehicle registration number must be at least 5 characters",
        "string.max": "Vehicle registration number must be at most 10 characters",
        "vehicle.pattern":
          "Vehicle registration number can only contain uppercase letters (A–Z), digits (0–9), and hyphens (-)",
      }),
    vehicleType: Joi.string().trim().required().messages({
      "string.empty": "Vehicle type is required",
      "any.required": "Vehicle type is required",
    }),
    vehicleCapacity: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
    vehicleFrontPhoto: Joi.string().allow("", null).optional(),
    vehicleBackPhoto: Joi.string().allow("", null).optional(),
    vehicleLeftSidePhoto: Joi.string().allow("", null).optional(),
    vehicleRightSidePhoto: Joi.string().allow("", null).optional(),
  }).required(),
});

module.exports = {
  loginSchema,
  changePasswordSchema,
  registerDriverSchema,
};
