import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logoPath = path.join(root, 'src', 'assets', 'zad-luxury-logo.jpg');
const iconPath = path.join(root, 'public', 'assets', 'icons', 'icon-192x192.png');

await mkdir(path.dirname(iconPath), { recursive: true });
await sharp(logoPath)
  .resize(192, 192, { fit: 'cover' })
  .png()
  .toFile(iconPath);
