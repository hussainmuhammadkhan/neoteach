const https = require('https');

/**
 * Calls OpenAI GPT-4o to generate a short personalised certificate blurb.
 * Falls back to a template string if the API call fails.
 */
async function generateCertificateText(studentName, courseName, performanceLevel, score) {
  const prompt =
    `You are writing the official body text for an educational certificate issued by NeoTeach.\n` +
    `Write 2–3 professional, warm, congratulatory sentences for:\n` +
    `  • Student: ${studentName}\n` +
    `  • Course: ${courseName}\n` +
    `  • Performance level: ${performanceLevel}\n` +
    `  • Score: ${score}%\n\n` +
    `Rules:\n` +
    `- Address the student by name.\n` +
    `- Mention the course name.\n` +
    `- Highlight their achievement level.\n` +
    `- Do NOT include "Certificate of Completion" — already in the header.\n` +
    `- No markdown, no bullet points.\n` +
    `- Under 60 words.`;

  const payload = JSON.stringify({
    model: 'gpt-4o',
    max_tokens: 200,
    temperature: 0.75,
    messages: [
      { role: 'system', content: 'You write short professional certificate text for an edu platform.' },
      { role: 'user',   content: prompt },
    ],
  });

  try {
    const text = await _post(payload);
    return text.trim();
  } catch (err) {
    console.error('OpenAI error — using fallback:', err.message);
    return _fallback(studentName, courseName, performanceLevel, score);
  }
}

// ── Internal HTTP helper ──────────────────────────────────
function _post(payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path:     '/v1/chat/completions',
        method:   'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.error) return reject(new Error(json.error.message));
            const text = json.choices?.[0]?.message?.content ?? '';
            resolve(text);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function _fallback(name, course, level, score) {
  return (
    `This certifies that ${name} has successfully completed the "${course}" ` +
    `course on the NeoTeach platform with a score of ${score}%, ` +
    `achieving the ${level} performance level. ` +
    `This is a testament to their dedication and commitment to learning.`
  );
}

module.exports = { generateCertificateText };