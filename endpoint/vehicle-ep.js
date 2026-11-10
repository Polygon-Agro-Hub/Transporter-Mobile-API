const path = require("path");
const fs = require("fs");

/**
 * @openapi
 * /api/vehicle-types:
 *   get:
 *     tags:
 *       - Vehicle
 *     summary: Get supported vehicle types
 *     description: Retrieve list of vehicle types with capacity details from vehicle_type.json asset file.
 *     security: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: ["Light Weight Driver", "Heavy Weight Driver"]
 *         description: Optional category filter to return only light or heavy vehicles
 *     responses:
 *       200:
 *         description: Vehicle types retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Vehicle types fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "Three Wheeler"
 *                       capacity:
 *                         type: number
 *                         example: 100
 *                       category:
 *                         type: string
 *                         example: "Light Weight Driver"
 */
exports.getVehicleTypes = (req, res) => {
  try {
    const filePath = path.join(__dirname, "../asset/vehicle_type.json");
    let vehicleTypes = [];

    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      vehicleTypes = JSON.parse(fileContent);
    } else {
      vehicleTypes = require("../asset/vehicle_type.json");
    }

    const { category } = req.query;
    if (category) {
      vehicleTypes = vehicleTypes.filter(
        (v) => (v.category || "").toLowerCase() === category.toLowerCase()
      );
    }

    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    return res.status(200).json({
      success: true,
      message: "Vehicle types fetched successfully",
      data: vehicleTypes,
    });
  } catch (error) {
    console.error("Error reading vehicle types:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load vehicle types",
      error: error.message,
    });
  }
};
