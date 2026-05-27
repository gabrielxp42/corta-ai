import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const manifestPath = path.join(publicDir, 'asset-manifest.json');

const ignoredNames = new Set([
  '.DS_Store',
  '.gitkeep',
  'asset-manifest.json',
]);

const walk = async (directoryPath) => {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredNames.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }

    const stats = await fs.stat(fullPath);
    const relativePath = path.relative(publicDir, fullPath).split(path.sep).join('/');
    const categoryPath = path.dirname(relativePath).split(path.sep).join('/');

    files.push({
      name: entry.name,
      path: relativePath,
      size: stats.size,
      category: categoryPath === '.' ? 'Geral' : categoryPath,
    });
  }

  return files;
};

const main = async () => {
  const files = await walk(publicDir);
  files.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));

  const payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    files,
  };

  await fs.writeFile(manifestPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Manifesto gerado com ${files.length} arquivos em ${manifestPath}`);
};

main().catch((error) => {
  console.error('Falha ao gerar manifesto de assets:', error);
  process.exitCode = 1;
});
