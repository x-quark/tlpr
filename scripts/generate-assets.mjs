import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedDirectory = path.join(root, 'assets', 'generated');
const iconSource = path.join(root, 'assets', 'icon.svg');
const smallIconSource = path.join(root, 'assets', 'icon-small.svg');
const iconSizes = [16, 32, 48, 128];

await mkdir(generatedDirectory, { recursive: true });
const icon = await readFile(iconSource);
const smallIcon = await readFile(smallIconSource);

await Promise.all(
  iconSizes.map((size) =>
    sharp(size <= 32 ? smallIcon : icon, { density: 384 })
      .resize(size, size, { fit: 'fill' })
      .png({ compressionLevel: 9 })
      .toFile(path.join(generatedDirectory, `icon-${size}.png`)),
  ),
);

await Promise.all([
  sharp(path.join(root, 'assets', 'store', 'small-promo.svg'), { density: 192 })
    .resize(440, 280, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(generatedDirectory, 'store-small-promo-440x280.png')),
  sharp(path.join(root, 'assets', 'store', 'marquee.svg'), { density: 192 })
    .resize(1400, 560, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(generatedDirectory, 'store-marquee-1400x560.png')),
]);

console.log(`Generated ${iconSizes.length + 2} branded assets in assets/generated`);
