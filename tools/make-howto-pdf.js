// Renders docs/how-to-use.html to a PDF using the Playwright Chromium that the
// project already installs. Usage: node tools/make-howto-pdf.js <output.pdf>
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

(async () => {
  const root = path.resolve(__dirname, '..');
  const htmlPath = path.join(root, 'docs', 'how-to-use.html');
  const outPath = process.argv[2] || path.join(root, 'How-To-Use.pdf');

  if (!fs.existsSync(htmlPath)) {
    console.error(`Source not found: ${htmlPath}`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // Load from disk so relative assets (if any) resolve; wait for layout.
    await page.goto('file://' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'load' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });
    console.log(`Wrote ${outPath}`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
