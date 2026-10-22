// ══════════════════════════════════════════════════════
// FCM Service — send push notifications via Firebase
// ══════════════════════════════════════════════════════
const https = require('https');

const FCM_SERVER_KEY = 'BPYjpfcIE2g12ebRi0-PI3Dyf42AeMBov5If1KHjVLEoQ0EVxM2h8E7RDlZKlcZQmhbBkMpgwy39q03PDS2YEsk';

// ── Send notification to a single device token ────────
const sendPushNotification = async ({ token, title, body, data = {} }) => {
  const payload = JSON.stringify({
    to: token,
    notification: {
      title,
      body,
      sound: 'default',
      badge: '1',
    },
    data,
    priority: 'high',
    content_available: true,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'fcm.googleapis.com',
      path:     '/fcm/send',
      method:   'POST',
      headers: {
  'Content-Type':   'application/json',
  'Content-Length': Buffer.byteLength(payload),
  'Authorization':  `key=${FCM_SERVER_KEY}`,
},
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          console.log('✅ FCM sent:', parsed);
          resolve(parsed);
        } catch (e) {
          resolve(responseData);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ FCM error:', err);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
};

module.exports = { sendPushNotification };