#!/usr/bin/env node
// CI-only transfer of Prettier's exact results for review via Actions job logs.
// No automatic commit; the feature branch is only updated after review.
import { readFileSync } from 'node:fs';
for (const file of [
  'src/components/adjustments/Curves.tsx',
  'src/components/panel/editor/ImageCanvas.tsx',
  'src/store/useEditorStore.ts',
  'docs/targeted-curves.md',
]) {
  const content = readFileSync(file).toString('base64');
  console.log(`FORMATTED_START ${file}`);
  for (let i = 0; i < content.length; i += 3000) {
    console.log(`FORMATTED_CHUNK ${content.slice(i, i + 3000)}`);
  }
  console.log(`FORMATTED_END ${file}`);
}
