import { spawnSync } from 'node:child_process';
import path from 'node:path';
const [feature, baseline] = process.argv.slice(2);
function inspect(directory) {
  const result = spawnSync(
    process.execPath,
    [
      path.resolve(directory, 'node_modules/eslint/bin/eslint.js'),
      '.',
      '--ignore-pattern',
      '.github/review-tools/**',
      '--format',
      'json',
    ],
    { cwd: directory, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (![0, 1].includes(result.status)) throw new Error(result.stderr);
  const counts = new Map();
  for (const file of JSON.parse(result.stdout))
    for (const issue of file.messages) {
      const key = [
        path.relative(path.resolve(directory), file.filePath),
        issue.ruleId,
        issue.message,
        issue.severity,
      ].join(':');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  return counts;
}
const previous = inspect(baseline),
  current = inspect(feature);
let added = 0;
for (const [key, count] of current)
  if (count > (previous.get(key) ?? 0)) {
    added += count - (previous.get(key) ?? 0);
    console.error(key);
  }
const total = (counts) => [...counts.values()].reduce((sum, n) => sum + n, 0);
console.log(`ESLint: upstream=${total(previous)}, feature=${total(current)}, new=${added}`);
if (added) process.exit(1);
