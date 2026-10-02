const multer = require("multer");
const path = require("path");

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = /^(jpeg|jpg|png|pdf|heic|heif)$/i;
    const ext = path.extname(file.originalname).slice(1);
    const extname = allowedExts.test(ext);

    const isHeic = /^(heic|heif)$/i.test(ext);
    const allowedMimes =
      /^(image\/(jpeg|jpg|png|heic|heif|heic-sequence|heif-sequence)|application\/pdf)$/i;
    const mimetype =
      allowedMimes.test(file.mimetype) ||
      ((file.mimetype === "application/octet-stream" || isHeic) && extname);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      return cb(new Error("Only JPG, PNG, HEIC, and PDF formats are supported"));
    }
  },
});

module.exports = { upload };