#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'dist');

console.log('--- [SPHEREx Sky] Building Static Site for GitHub Pages ---');

// 1. Build UI bundle
console.log('1. Compiling UI bundle with Vite...');
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

// 2. Prepare dist/ folder
console.log('2. Preparing dist/ directory...');
if (fs.existsSync(OUT)) {
  fs.rmSync(OUT, { recursive: true, force: true });
}
fs.mkdirSync(OUT, { recursive: true });

// Helper to copy recursively
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 3. Copy static assets
const filesToCopy = [
  'index.html',
  'manifest.json',
  'sw.js',
  'scientific_resources.json',
  'data_field.json',
];

const dirsToCopy = [
  'assets',
  'css',
  'js',
];

for (const file of filesToCopy) {
  const p = path.join(ROOT, file);
  if (fs.existsSync(p)) {
    fs.copyFileSync(p, path.join(OUT, file));
    console.log(`   + Copied ${file}`);
  }
}

for (const dir of dirsToCopy) {
  const p = path.join(ROOT, dir);
  if (fs.existsSync(p)) {
    copyDir(p, path.join(OUT, dir));
    console.log(`   + Copied ${dir}/`);
  }
}

// 4. Create .nojekyll so GitHub Pages does not ignore underscore files or folders
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('   + Created .nojekyll (for GitHub Pages)');

console.log(`\n✓ Static site successfully created in ${OUT}`);
console.log('  Ready for GitHub Pages or any static CDN hosting!');
