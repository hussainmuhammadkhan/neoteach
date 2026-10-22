const express = require("express");
const router  = express.Router();
const { getUsers, deleteUser } = require("../AdminControllers/userController");

router.get("/",       getUsers);
router.delete("/:id", deleteUser); // ✅ delete user
module.exports = router;