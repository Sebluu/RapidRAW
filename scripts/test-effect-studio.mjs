import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const file = readFileSync(new URL('../src/utils/effectStudio.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(file, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const model = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64'));

test('new studio effects are independent and hidden by default', () => {
  const types = ['kaleidoscope', 'fractalFeedback', 'prism', 'localNormalize'];
  const state = model.normalizeEffectStudio({
    version: 1,
    effects: types.map(model.createStudioEffect),
  });
  assert.deepEqual(
    state.effects.map((effect) => effect.type),
    types,
  );
  assert.ok(state.effects.every((effect) => effect.visible === false));
  const updated = state.effects.map((effect) => (effect.type === 'prism' ? { ...effect, visible: true } : effect));
  const next = model.normalizeEffectStudio({ version: 1, effects: updated });
  assert.equal(next.effects.find((effect) => effect.type === 'prism').visible, true);
  assert.equal(next.effects.find((effect) => effect.type === 'fractalFeedback').visible, false);
});

test('saved kaleidoscope settings are preserved when adding creative modules', () => {
  const kaleidoscope = model.createStudioEffect('kaleidoscope');
  kaleidoscope.settings.mode = 'geometric';
  kaleidoscope.settings.mirrorSize = 6;
  const effects = [kaleidoscope, model.createStudioEffect('fractalFeedback')];
  const saved = JSON.stringify({ version: 1, effects });
  const state = model.normalizeEffectStudio(JSON.parse(saved));
  assert.equal(state.effects[0].settings.mirrorSize, 6);
  assert.equal(state.effects.length, 2);
});

test('luminance bounds are finite and sorted for both effects', () => {
  for (const normalize of [model.normalizeFeedback, model.normalizePrism]) {
    const settings = normalize({ maskLow: 85, maskHigh: 20, feather: 999, blur: -20 });
    assert.equal(settings.maskLow, 20);
    assert.equal(settings.maskHigh, 85);
    assert.equal(settings.feather, 100);
    assert.equal(settings.blur, 0);
  }
});

test('older triangle effects migrate and duplicate types are ignored', () => {
  const old = { ...model.createStudioEffect('kaleidoscope'), settings: { mode: 'triangle', grid: 4 } };
  const state = model.normalizeEffectStudio({ version: 1, effects: [old, old] });
  assert.equal(state.effects.length, 1);
  assert.equal(state.effects[0].settings.mode, 'geometric');
  assert.equal(state.effects[0].settings.mirrorSize, 0.5);
});

test('invalid creative values cannot reach the GPU settings', () => {
  assert.equal(model.normalizeFeedback({ amount: Infinity }).amount, 38);
  assert.equal(model.normalizePrism({ separation: 10000 }).separation, 60);
  assert.equal(model.normalizeLocalNormalize({ radius: -10 }).radius, 2);
});
