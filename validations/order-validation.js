const Joi = require("joi");

const assignDriverOrderSchema = Joi.object({
  invNo: Joi.string().trim().min(3).max(100).required().messages({
    "string.empty": "Invoice number is required",
    "string.min": "Invoice number must be at least 3 characters long",
    "any.required": "Invoice number is required",
  }),
});

const startJourneySchema = Joi.object({
  orderIds: Joi.alternatives().try(
    Joi.array().items(Joi.number().integer().positive().required()).min(1),
    Joi.string().trim().required()
  ).required().messages({
    "any.required": "orderIds parameter is required",
  }),
});

const saveSignatureSchema = Joi.object({
  processOrderIds: Joi.array().items(Joi.number().integer().positive().required()).min(1).required().messages({
    "array.base": "processOrderIds must be an array",
    "any.required": "processOrderIds is required",
  }),
  latitude: Joi.alternatives().try(Joi.number(), Joi.string().allow("")).optional(),
  longitude: Joi.alternatives().try(Joi.number(), Joi.string().allow("")).optional(),
});

module.exports = {
  assignDriverOrderSchema,
  startJourneySchema,
  saveSignatureSchema,
};
