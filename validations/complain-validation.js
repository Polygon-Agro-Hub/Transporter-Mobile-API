const Joi = require("joi");

const addComplainSchema = Joi.object({
  complainCategory: Joi.alternatives().try(
    Joi.number().integer().positive(),
    Joi.string().trim().min(1)
  ).required().messages({
    "any.required": "Category and description are required",
  }),
  complain: Joi.string().trim().min(1).required().messages({
    "string.empty": "Category and description are required",
    "any.required": "Category and description are required",
  }),
});

module.exports = {
  addComplainSchema,
};
