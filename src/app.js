const express = require("express");
const cors = require("cors");

const uploadRoutes = require("./routes/upload.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/upload", uploadRoutes);

app.get("/", (req, res) => {
  res.send("NexaSense API running");
});

module.exports = app;