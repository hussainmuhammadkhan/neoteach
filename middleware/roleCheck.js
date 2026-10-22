// middleware/roleCheck.js

const roleCheck = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).send({ error: "Unauthorized" });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).send({ error: "Access denied: insufficient permissions" });
        }
        next();
    };
};

module.exports = roleCheck;
