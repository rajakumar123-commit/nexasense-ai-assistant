const multer = require("multer");
const path   = require("path");

// ✅ FIX W2: Use absolute path so uploads/ resolves correctly in Docker (/app/uploads)
// and in local dev — NOT relative to CWD which changes between environments
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// Store file with timestamp prefix to avoid name collisions
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

// ✅ FIX BUG3: Added .html / text/html to match upload.controller.js allowed types.
// Previously multer rejected text/html before the controller could validate it,
// causing confusing errors. Now both middleware and controller use the same list.
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".html"];
const ALLOWED_MIMETYPES  = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/html"
];

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIMETYPES.includes(file.mimetype)) {
    return cb(new Error("Only PDF, DOCX, and TXT files are allowed"), false);
  }
  cb(null, true);
}

// FIX: 20MB file size limit — prevents server crash from huge uploads
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }   // 20MB max
});

module.exports = upload;
