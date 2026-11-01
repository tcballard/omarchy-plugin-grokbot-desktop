import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { archive } from '../scripts/archive.mjs'
import { root, hash } from '../scripts/template.mjs'

const tag = 'v9.9.9'

function candidate(t, status = 'pending-live') {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-release-'))
  const base = path.join(temporary, 'repo')
  const clone = spawnSync('git', ['clone', '--quiet', '--no-hardlinks', root, base], { encoding: 'utf8' })
  assert.equal(clone.status, 0, clone.stderr)
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const git = (...args) => {
    const result = spawnSync('git', ['-c', 'user.name=Release Test', '-c', 'user.email=release@example.invalid', ...args], { cwd: base, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  const write = (file, data) => fs.writeFileSync(path.join(base, file), data)
  write('VERSION', '9.9.9\n')
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json')))
  manifest.version = '9.9.9'
  write('manifest.json', JSON.stringify(manifest, null, 2) + '\n')
  git('add', 'VERSION', 'manifest.json')
  git('commit', '-qm', 'Fixture version')
  const input = git('rev-parse', 'HEAD')
  const evidence = {
    status, input_commit: input, platform: 'Synthetic release test', date: '2026-11-01',
    commands: ['./tests/run'], results: ['Synthetic fixture only'],
    live: { status: status === 'passed' ? 'passed' : 'pending' },
    portable: { status: 'passed' }
  }
  write(`docs/ACCEPTANCE-${tag}.json`, JSON.stringify(evidence, null, 2) + '\n')
  git('add', 'docs')
  git('commit', '-qm', 'Fixture evidence')
  git('tag', '-a', tag, '-m', 'Synthetic test tag')
  return { base, git, write, input, evidence }
}

test('source packaging requires explicit pending-live acknowledgement and rejects failed evidence', t => {
  const c = candidate(t)
  assert.throws(() => archive(c.base, { tag, allowPendingLive: false }), /pending live checks require explicit/)
  assert.equal(fs.existsSync(path.join(c.base, 'dist')), false)
  c.evidence.status = 'failed'
  c.write(`docs/ACCEPTANCE-${tag}.json`, JSON.stringify(c.evidence))
  c.git('add', 'docs'); c.git('commit', '-qm', 'Failed fixture evidence')
  c.git('tag', '-d', tag); c.git('tag', '-a', tag, '-m', 'Synthetic failed tag')
  assert.throws(() => archive(c.base, { tag, allowPendingLive: true }), /Record actual acceptance/)
})

test('source assets bind the tagged commit, archive contents, acceptance and every checksum', t => {
  const c = candidate(t)
  const result = archive(c.base, { tag, allowPendingLive: true })
  const read = name => JSON.parse(fs.readFileSync(path.join(result.out, name)))
  const release = read('RELEASE-MANIFEST.json')
  const source = read('SOURCE-MANIFEST.json')
  const sbom = read('SBOM.spdx.json')
  assert.equal(release.source.commit, c.git('rev-parse', 'HEAD'))
  assert.equal(release.source.tree, c.git('rev-parse', 'HEAD^{tree}'))
  assert.deepEqual(source.source, release.source)
  assert.equal(release.version, '9.9.9')
  assert.deepEqual(release.validation, { inputCommit: c.input, live: 'pending', portable: 'passed' })
  assert.equal(sbom.spdxVersion, 'SPDX-2.3')
  assert.equal(sbom.packages[0].versionInfo, '9.9.9')
  assert.ok(sbom.packages[0].downloadLocation.endsWith('@' + release.source.commit))
  const lines = fs.readFileSync(path.join(result.out, 'SHA256SUMS'), 'utf8').trim().split('\n')
  assert.equal(lines.length, 4)
  for (const line of lines) {
    const [digest, name] = line.split('  ')
    assert.equal(hash(fs.readFileSync(path.join(result.out, name))), digest)
  }
  for (const file of [...release.artifacts, ...release.releaseDocuments]) {
    const bytes = fs.readFileSync(path.join(result.out, file.name))
    assert.equal(bytes.length, file.bytes)
    assert.equal(hash(bytes), file.sha256)
  }
  const tarball = path.join(result.out, release.artifacts[0].name)
  const manifestPath = c.git('ls-tree', '--name-only', 'HEAD', 'manifest.json')
  const extracted = spawnSync('tar', ['-xzOf', tarball, `grokbot-desktop/${manifestPath}`], { encoding: 'utf8' })
  assert.equal(extracted.status, 0, extracted.stderr)
  assert.equal(JSON.parse(extracted.stdout).version, '9.9.9')
  const tracked = c.git('ls-files', '-z').split('\0').filter(Boolean)
  assert.deepEqual(source.files.map(f => f.path), tracked)
  for (const file of source.files) assert.equal(file.sha256, hash(fs.readFileSync(path.join(c.base, file.path))))
})

test('pending-live acknowledgement cannot bypass dirty trees or changed runtime after evidence', t => {
  const c = candidate(t)
  fs.appendFileSync(path.join(c.base, 'Main.qml'), '\n// synthetic runtime change\n')
  assert.throws(() => archive(c.base, { tag, allowPendingLive: true }), /clean checkout/)
  c.git('add', 'Main.qml'); c.git('commit', '-qm', 'Changed fixture runtime')
  assert.throws(() => archive(c.base, { tag, allowPendingLive: true }), /exact commit/)
  c.git('tag', '-d', tag); c.git('tag', '-a', tag, '-m', 'Synthetic changed runtime tag')
  assert.throws(() => archive(c.base, { tag, allowPendingLive: true }), /Runtime\/build inputs changed after acceptance/)
})
