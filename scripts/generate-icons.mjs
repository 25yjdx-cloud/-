import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(root, 'src', 'assets', 'icons');
const outputDirectory = sourceDirectory;
const logoPath = path.join(root, 'src', 'assets', 'zad-luxury-logo.jpg');
const iconBySeason = {
  default: 'icon-default.png',
  fallback: 'icon-fallback.png',
  ramadan: 'icon-ramadan.png',
  fitr: 'icon-fitr.png',
  adha: 'icon-adha.png',
};

await mkdir(outputDirectory, { recursive: true });
await mkdir(path.join(root, 'public', 'assets', 'icons'), { recursive: true });
await Promise.all([
  sharp(logoPath)
    .resize(192, 192, { fit: 'cover' })
    .png()
    .toFile(path.join(outputDirectory, 'icon-192x192.png')),
  ...Object.values(iconBySeason).map((iconName) => sharp(logoPath)
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toFile(path.join(outputDirectory, iconName))),
  sharp(logoPath)
    .resize(192, 192, { fit: 'cover' })
    .png()
    .toFile(path.join(root, 'public', 'assets', 'icons', 'icon-192x192.png')),
  ...Object.values(iconBySeason).map((iconName) => sharp(logoPath)
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toFile(path.join(root, 'public', 'assets', 'icons', iconName))),
]);

const iconEntries = (iconName) => [
  {
    src: `./assets/icons/icon-192x192.png`,
    sizes: '192x192',
    type: 'image/png',
    purpose: 'any',
  },
  {
    src: `./assets/icons/${iconName}`,
    sizes: '512x512',
    type: 'image/png',
    purpose: 'any',
  },
];

const baseManifestPath = path.join(root, 'manifest.json');
const baseManifest = JSON.parse(await readFile(baseManifestPath, 'utf8'));
baseManifest.icons = iconEntries(iconBySeason.default);
await writeFile(baseManifestPath, `${JSON.stringify(baseManifest, null, 2)}\n`);

await Promise.all(Object.entries(iconBySeason).map(async ([season, iconName]) => {
  const seasonalManifest = {
    ...baseManifest,
    icons: iconEntries(iconName),
  };
  await writeFile(
    path.join(root, `manifest-${season}.json`),
    `${JSON.stringify(seasonalManifest, null, 2)}\n`,
  );
}));
