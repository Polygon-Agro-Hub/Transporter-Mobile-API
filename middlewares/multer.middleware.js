const multer = require("multer");
const path = require("path");

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf|heic|heif/;
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    const isHeicExt = /heic|heif/.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = filetypes.test(file.mimetype) ||
      file.mimetype === "application/octet-stream";

    if (extname && (mimetype || isHeicExt)) {
      return cb(null, true);
    } else {
      return cb(new Error("Only images (jpg, png, heic, heif) and PDFs are allowed"));
    }
  },
});

module.exports = { upload };