const express    = require("express");
const router     = express.Router();

// ✅ Controller se import karo — model yahan define mat karo
const { getFlags, removeFlag } = require("../AdminControllers/flagController");

router.get("/",       getFlags);
router.delete("/:id", removeFlag);

module.exports = router;