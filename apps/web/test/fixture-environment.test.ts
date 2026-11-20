import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { test } from 'node:test';
import { nextFixtureEnvironment } from '../../../scripts/lib/next-fixture-environment.mjs';

test('Next fixture environment overrides both inherited and dotenv backend selections', () => {
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(parent, 'bep-next-env-fixture-'));
  const require = createRequire(import.meta.url);
  const nextRequire = createRequire(require.resolve('next/package.json'));
  const envLoader = nextRequire.resolve('@next/env');
  try {
    writeFileSync(join(directory, '.env.local'), 'BEP_API_ORIGIN=https://local-file-fixture.example\n');
    writeFileSync(join(directory, '.env.production'), 'BEP_API_ORIGIN=https://production-file-fixture.example\n');
    for (const origin of [undefined, 'http://127.0.0.1:4321']) {
      const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
        import {createRequire} from 'node:module';
        const {loadEnvConfig}=createRequire(import.meta.url)(${JSON.stringify(envLoader)});
        loadEnvConfig(process.argv[1], false, {info(){},error(){}}, true);
        console.log(JSON.stringify({origin:process.env.BEP_API_ORIGIN}));
      `, directory], {
        encoding: 'utf8', timeout: 15000,
        env: nextFixtureEnvironment(origin, { ...process.env, BEP_API_ORIGIN: 'https://inherited-fixture.example' }),
      });
      assert.equal(child.status, 0, child.stderr);
      assert.deepEqual(JSON.parse(child.stdout.trim()), { origin: origin ?? '' });
    }
  } finally {
    const resolved = realpathSync(directory);
    const child = relative(parent, resolved);
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child) && dirname(resolved) === parent);
    rmSync(resolved, { recursive: true, force: true });
  }
});
