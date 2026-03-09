const multer = require("multer");
const path = require("path");

// Store file with timestamp prefix to avoid name collisions
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

// FIX: Only accept PDF files
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== ".pdf" || file.mimetype !== "application/pdf") {
    return cb(new Error("Only PDF files are allowed"), false);
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
