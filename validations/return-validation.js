const Joi = require("joi");

// Submit Return Order Schema
const submitReturnSchema = Joi.object({
    orderIds: Joi.array()
        .items(Joi.number().integer().positive())
        .min(1)
        .required()
        .messages({
            "array.base": "Order IDs must be an array",
            "array.min": "At least one order ID is required",
            "array.includes": "All order IDs must be valid positive numbers",
            "any.required": "Order IDs are required",
        }),

    returnReasonId: Joi.number()
        .integer()
        .positive()
        .required()
        .messages({
            "number.base": "Return reason ID must be a number",
            "number.integer": "Return reason ID must be an integer",
            "number.positive": "Return reason ID must be a positive number",
            "any.required": "Return reason ID is required",
        }),

    note: Joi.string().trim().max(500).allow(null, "").optional().messages({
        "string.base": "Note must be a string",
        "string.max": "Note cannot exceed 500 characters",
    }),
});

module.exports = {
    submitReturnSchema,
};