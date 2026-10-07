const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const convert = require("heic-convert");

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const getContentType = (ext) => {
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
  };
  return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
};

/**
 * @param {Buffer} fileBuffer - The file buffer to upload.
 * @param {string} fileName - The original file name.
 * @param {string} keyPrefix - The prefix path (folder structure) in the R2 bucket.
 * @returns {Promise<string>} - Resolves with the file URL after successful upload.
 */
const uploadFileToS3 = async (fileBuffer, fileName, keyPrefix) => {
  try {
    let fileExtension = fileName.split(".").pop().toLowerCase();
    let bodyBuffer = fileBuffer;

    // Convert HEIC/HEIF -> JPG
    if (fileExtension === "heic" || fileExtension === "heif") {
      const converted = await convert({
        buffer: fileBuffer,
        format: "JPEG",
        quality: 0.9,
      });
      bodyBuffer = Buffer.from(converted);
      fileExtension = "jpg";
    }

    const uniqueFileName = `${uuidv4()}.${fileExtension}`;
    const key = `${keyPrefix}/${uniqueFileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: bodyBuffer,
      ContentType: getContentType(fileExtension),
    });
    await r2Client.send(command);

    const domain = process.env.R2_ENDPOINT.replace("https://", "");
    return `https://${domain}/${key}`;
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw new Error("Failed to upload file to R2");
  }
};

module.exports = uploadFileToS3;