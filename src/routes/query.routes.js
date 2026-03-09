const express = require("express");
const router = express.Router();

const { queryDocument } = require("../controllers/query.controller");


// ─────────────────────────────
// Ask question about document
// ─────────────────────────────
router.post("/query", queryDocument);


module.exports = router;