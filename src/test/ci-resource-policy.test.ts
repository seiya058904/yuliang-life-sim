import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('PR and deployment use the same explicit serial full-suite policy (#15)', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  expect(pkg.scripts['test:ci']).toBe('vitest run --no-file-parallelism');
  for (const file of ['verify-pr.yml', 'deploy-pages.yml']) {
    const workflow = readFileSync(`.github/workflows/${file}`, 'utf8');
    expect(workflow).toContain('run: npm run test:ci');
    expect(workflow).not.toMatch(/run: npm test(?:\s*\n| -- --no-file-parallelism)/);
    expect(workflow).toContain('run: npm run build');
    expect(workflow).toContain('YULIANG_E2E_SERVER: preview');
  }
});
