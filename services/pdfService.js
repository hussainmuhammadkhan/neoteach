const PDFDocument = require('pdfkit');
const fs          = require('fs');
const path        = require('path');

/**
 * Generates a landscape A4 PDF certificate using PDFKit.
 * Returns the saved file path.
 *
 * Install: npm install pdfkit
 */
async function generateCertificatePdf({
  certId,
  studentName,
  courseName,
  performanceLevel,
  aiText,
  certCode,
  completionDate,
  score,
  outputDir,
}) {
  // ── Ensure output dir exists ────────────────────────────
  fs.mkdirSync(outputDir, { recursive: true });

  const fileName = `${certCode}.pdf`;
  const filePath = path.join(outputDir, fileName);

  // ── Landscape A4: 841 × 595 pt ─────────────────────────
  const doc = new PDFDocument({
    size:   'A4',
    layout: 'landscape',
    margin:  0,
  });

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const W = doc.page.width;   // 841.89
  const H = doc.page.height;  // 595.28

  // ── Brand colours ────────────────────────────────────────
  const NAVY   = '#0D1B3E';
  const GOLD   = '#C9A027';
  const TEAL   = '#00B496';
  const CREAM  = '#FAF8F2';
  const GRAY   = '#555555';
  const WHITE  = '#FFFFFF';

  // ── 1. Cream background ──────────────────────────────────
  doc.rect(0, 0, W, H).fill(CREAM);

  // ── 2. Navy left sidebar ─────────────────────────────────
  doc.rect(0, 0, 38, H).fill(NAVY);

  // ── 3. Gold top & bottom borders ─────────────────────────
  doc.rect(38, 0,      W - 38, 10).fill(GOLD);
  doc.rect(38, H - 10, W - 38, 10).fill(GOLD);

  // ── 4. Outer decorative border ───────────────────────────
  doc.rect(52, 22, W - 68, H - 44)
     .lineWidth(1.5)
     .strokeColor(GOLD)
     .stroke();

  // ── 5. Inner decorative border ───────────────────────────
  doc.rect(58, 28, W - 80, H - 56)
     .lineWidth(0.5)
     .strokeColor(GOLD)
     .stroke();

  // ── 6. Teal accent lines ─────────────────────────────────
  doc.moveTo(120, H - 100).lineTo(W - 60, H - 100)
     .lineWidth(1).strokeColor(TEAL).stroke();
  doc.moveTo(120, 70).lineTo(W - 60, 70)
     .lineWidth(0.5).strokeColor(TEAL).stroke();

  // ── 7. Platform name ─────────────────────────────────────
  doc.font('Helvetica-Bold')
     .fontSize(13)
     .fillColor(TEAL)
     .text('NeoTeach', 52, H - 88, { width: W - 68, align: 'center' });

  // ── 8. "Certificate of Completion" ───────────────────────
  doc.font('Times-Bold')
     .fontSize(28)
     .fillColor(NAVY)
     .text('Certificate of Completion', 52, H - 520, {
       width: W - 68, align: 'center',
     });

  // ── 9. "This certifies that" ─────────────────────────────
  doc.font('Times-Roman')
     .fontSize(12)
     .fillColor(GRAY)
     .text('This certifies that', 52, H - 462, { width: W - 68, align: 'center' });

  // ── 10. Student name (large italic gold) ─────────────────
  doc.font('Times-Italic')
     .fontSize(34)
     .fillColor(GOLD)
     .text(studentName, 52, H - 438, { width: W - 68, align: 'center' });

  // ── 11. "has successfully completed" ─────────────────────
  doc.font('Times-Roman')
     .fontSize(12)
     .fillColor(GRAY)
     .text('has successfully completed the course', 52, H - 390, {
       width: W - 68, align: 'center',
     });

  // ── 12. Course name ───────────────────────────────────────
  doc.font('Times-Bold')
     .fontSize(18)
     .fillColor(NAVY)
     .text(`"${courseName}"`, 52, H - 370, { width: W - 68, align: 'center' });

  // ── 13. AI-generated text ─────────────────────────────────
  doc.font('Times-Roman')
     .fontSize(10)
     .fillColor(GRAY)
     .text(aiText, 120, H - 330, { width: W - 240, align: 'center' });

  // ── 14. Performance badge (teal pill) ─────────────────────
  const badgeW = 160, badgeH = 24;
  const badgeX = (W / 2) - (badgeW / 2), badgeY = H - 285;
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 12).fill(TEAL);
  doc.font('Helvetica-Bold')
     .fontSize(10)
     .fillColor(WHITE)
     .text(`${performanceLevel}  ·  ${score}%`, badgeX, badgeY + 7, {
       width: badgeW, align: 'center',
     });

  // ── 15. Date (left footer) ────────────────────────────────
  const dateStr = new Date(completionDate).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  doc.font('Helvetica')
     .fontSize(9)
     .fillColor(GRAY)
     .text(`Date: ${dateStr}`, 72, H - 48, { width: 200 });

  // ── 16. Signature line (centre) ───────────────────────────
  const sigX = (W / 2) - 70;
  doc.moveTo(sigX, H - 44).lineTo(sigX + 140, H - 44)
     .lineWidth(0.7).strokeColor(NAVY).stroke();
  doc.font('Times-Roman')
     .fontSize(8)
     .fillColor(GRAY)
     .text('Authorized Signature', sigX, H - 38, { width: 140, align: 'center' });

  // ── 17. Certificate code (right footer) ───────────────────
  doc.font('Helvetica')
     .fontSize(9)
     .fillColor(NAVY)
     .text(`Cert. Code: ${certCode}`, W - 240, H - 48, {
       width: 178, align: 'right',
     });

  doc.end();

  // ── Wait for stream to finish ─────────────────────────────
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error',  reject);
  });

  return filePath;
}

module.exports = { generateCertificatePdf };