const express = require("express");
const router  = express.Router();
const { getDashboardStats } = require("../AdminControllers/adminController");

router.get("/stats", getDashboardStats);

module.exports = router;