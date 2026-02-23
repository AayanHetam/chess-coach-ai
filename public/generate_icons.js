const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, 'logo.svg');
const svgBuffer = fs.readFileSync(SVG_PATH);

async function generate() {
  const sizes = [
    { name: 'favicon-16x16.png',        size: 16  },
    { name: 'favicon-32x32.png',        size: 32  },
    { name: 'apple-touch-icon.png',     size: 180 },
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'android-chrome-512x512.png', size: 512 },
  ];

  for (const { name, size } of sizes) {
    await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(__dirname, name));
    console.log(`  ✓ ${name} (${size}x${size})`);
  }

  // favicon.ico — embed 32x32 PNG (browsers accept PNG-in-ICO)
  await sharp(svgBuffer)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(__dirname, 'favicon.ico'));
  console.log('  ✓ favicon.ico (32x32)');

  // Social image: 1200x630 warm cream background, logo centered
  const logoSize = 420;
  const logoBuffer = await sharp(svgBuffer)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const x = Math.round((1200 - logoSize) / 2);
  const y = Math.round((630 - logoSize) / 2);

  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 255, g: 248, b: 245, alpha: 1 },
    },
  })
    .composite([{ input: logoBuffer, left: x, top: y }])
    .png()
    .toFile(path.join(__dirname, 'social-networks-1200x630.png'));
  console.log('  ✓ social-networks-1200x630.png');

  console.log('\nAll icons generated!');
}

generate().catch(console.error);
