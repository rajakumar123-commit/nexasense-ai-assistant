const multer = require("multer");
const path = require("path");

// Store file with timestamp prefix to avoid name collisions
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

// Accept PDF, DOCX, and TXT files
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];
const ALLOWED_MIMETYPES  = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain"
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
