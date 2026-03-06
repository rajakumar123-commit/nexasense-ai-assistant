exports.uploadFile = (req, res) => {

  if (!req.file) {
    return res.status(400).json({
      message: "No file uploaded"
    });
  }

  res.json({
    message: "File uploaded successfully",
    filename: req.file.filename
  });

};