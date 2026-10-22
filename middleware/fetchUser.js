const jwt = require('jsonwebtoken');

const fetchuser = (req, res, next) => {
    const JWT_SECRET = 'Hussainisadeveloper';

    // ✅ Accept token from header OR query param (fallback for multipart requests)
    const token = req.header('auth-token') || req.query.token;

    // 🔍 DEBUG logs — remove after issue is confirmed fixed
    // console.log('🔑 [fetchuser] auth-token header:', req.header('auth-token') ? '✅ FOUND' : '❌ MISSING');
    // console.log('🔑 [fetchuser] query token:',       req.query.token           ? '✅ FOUND' : '❌ MISSING');
    // console.log('🔑 [fetchuser] all headers:', JSON.stringify(req.headers));

    if (!token) {
        return res.status(401).send({ error: "Please authenticate using a valid token" });
    }

    try {
        const data = jwt.verify(token, JWT_SECRET);
        req.user = { 
            id:   data.id,
            role: data.role
        };
        next();
    } catch (error) {
        console.log('🔑 [fetchuser] jwt.verify error:', error.message);
        res.status(401).send({ error: "Please authenticate using a valid token" });
    }
};

module.exports = fetchuser;