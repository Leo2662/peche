#!/usr/bin/env node
/**
 * Render scripts/social-assets.html to the PNGs referenced by the meta tags.
 *
 * Run by hand when the artwork changes, not on every build — the outputs are
 * committed so a deploy never depends on a browser being available:
 *
 *   npx playwright install chromium   # once
 *   node scripts/generate-social-assets.mjs
 *
 * Playwright is deliberately NOT a dependency of the app. It is only needed to
 * regenerate artwork, and pulling a browser into every install to produce three
 * files that change once a year is a bad trade.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, 'social-assets.html');
const outDir = resolve(here, '..', 'public');

/** Selector, output file, and the size to rasterise at. */
const TARGETS = [
  { id: '#og', file: 'og-image.png', width: 1200, height: 630 },
  { id: '#icon', file: 'icon-512.png', width: 512, height: 512 },
  { id: '#icon', file: 'apple-touch-icon.png', width: 180, height: 180 },
];

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error(
      'playwright is not installed. It is only needed to regenerate artwork:\n' +
        '  npm i -D playwright && npx playwright install chromium'
    );
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    // Honour a preinstalled browser when there is one.
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });

  try {
    for (const target of TARGETS) {
      // The frame is authored at its natural size; scaling by deviceScaleFactor
      // keeps text crisp at every output size rather than resampling a bitmap.
      const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
      await page.goto(pathToFileURL(source).href, { waitUntil: 'networkidle' });

      const element = await page.$(target.id);
      if (!element) throw new Error(`${target.id} not found in social-assets.html`);

      const box = await element.boundingBox();
      if (!box) throw new Error(`${target.id} has no layout`);

      await page.close();

      const scaled = await browser.newPage({
        viewport: { width: Math.round(box.width), height: Math.round(box.height) },
        deviceScaleFactor: target.width / box.width,
      });
      await scaled.goto(pathToFileURL(source).href, { waitUntil: 'networkidle' });
      const node = await scaled.$(target.id);
      await node.screenshot({ path: resolve(outDir, target.file) });
      await scaled.close();

      console.log(`${target.file}  ${target.width}×${target.height}`);
    }
  } finally {
    await browser.close();
  }
}

main();
