#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, readJSON, hash } from './template.mjs';
import { check } from './check.mjs';

export function archive(base=root, { tag=process.env.RELEASE_TAG, allowPendingLive=process.env.ALLOW_PENDING_LIVE==='true' }={}) {
  const c=check(base);
  if(!c.initialized)throw Error('Initialize a real project before preparing a release');
  if(!/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(tag||''))throw Error('Set RELEASE_TAG to a semantic version tag');
  const git=(...args)=>{const r=spawnSync('git',args,{cwd:base,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();};
  if(git('status','--porcelain'))throw Error('Release requires a clean checkout');
  if(git('cat-file','-t',`refs/tags/${tag}`)!=='tag')throw Error('Release requires an annotated tag');
  if(git('rev-parse',`${tag}^{commit}`)!==git('rev-parse','HEAD'))throw Error('Release tag must resolve to this exact commit');
  const versioned=path.join(base,`docs/ACCEPTANCE-${tag}.json`);
  const a=readJSON(fs.existsSync(versioned)?versioned:path.join(base,'docs/ACCEPTANCE.json'));
  const pending=a.status==='pending-live' && a.live?.status==='pending' && a.portable?.status==='passed';
  if(!((a.status==='passed' && a.live?.status==='passed') || (pending && allowPendingLive)) || !a.platform || !a.date || !Array.isArray(a.commands) || !a.commands.length || !Array.isArray(a.results) || !a.results.length || !/^[a-f0-9]{40}$/.test(a.input_commit||''))throw Error('Record actual acceptance evidence; pending live checks require explicit ALLOW_PENDING_LIVE=true');
  // Evidence may be recorded in a later docs-only commit, never after a runtime change.
  git('merge-base','--is-ancestor',a.input_commit,'HEAD');
  const changed=git('diff','--name-only',a.input_commit,'HEAD').split('\n').filter(Boolean);
  if(changed.some(f=>!f.startsWith('docs/')&&!['README.md','CREDITS.md'].includes(f)))throw Error('Runtime/build inputs changed after acceptance');
  const version=tag.slice(1);
  if(fs.readFileSync(path.join(base,'VERSION'),'utf8').trim()!==version)throw Error('VERSION must match tag');
  if(c.kind==='plugin' && readJSON(path.join(base,'manifest.json')).version!==version)throw Error('Manifest version must match tag');
  if(c.kind==='app' && !fs.readFileSync(path.join(base,'Cargo.toml'),'utf8').includes(`version = "${version}"`))throw Error('Cargo version must match tag');
  if(c.kind==='package' && !fs.readFileSync(path.join(base,`pkgbuilds/${c.slug}/PKGBUILD`),'utf8').includes(`pkgver=${version}\n`))throw Error('Package version must match tag');
  const out=path.join(base,'dist');fs.mkdirSync(out,{recursive:true});
  const archivePath=path.join(out,`${c.slug}-${tag}-source.tar.gz`);
  const r=spawnSync('git',['archive','--format=tar.gz',`--prefix=${c.slug}/`,'-o',archivePath,'HEAD'],{cwd:base,encoding:'utf8'});
  if(r.status!==0)throw Error(r.stderr);
  const source={repository:'https://github.com/tcballard/omarchy-plugin-grokbot-desktop',commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}')};
  const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
  const identity=name=>({name,bytes:fs.statSync(path.join(out,name)).size,sha256:hash(fs.readFileSync(path.join(out,name)))});
  const files=git('ls-files','-z').split('\0').filter(Boolean).map(name=>({path:name,sha256:hash(fs.readFileSync(path.join(base,name)))}));
  write('SOURCE-MANIFEST.json',{schemaVersion:1,version,source,files});
  write('SBOM.spdx.json',{
    spdxVersion:'SPDX-2.3',dataLicense:'CC0-1.0',SPDXID:'SPDXRef-DOCUMENT',name:`${c.slug}-${tag}-source`,
    documentNamespace:`${source.repository}/sbom/${source.commit}`,
    creationInfo:{created:new Date(git('show','-s','--format=%cI','HEAD')).toISOString().replace(/\.\d{3}Z$/,'Z'),creators:['Tool: grokbot-source-release']},
    packages:[{SPDXID:'SPDXRef-Source',name:c.slug,versionInfo:version,downloadLocation:`git+${source.repository}@${source.commit}`,
      filesAnalyzed:false,licenseConcluded:'NOASSERTION',licenseDeclared:'NOASSERTION',copyrightText:'NOASSERTION',
      comment:'Source-package inventory only. Project code is MIT; bundled Inter fonts use OFL-1.1. See LICENSE and CREDITS.md. External host dependencies are not inventoried.'}],
    relationships:[{spdxElementId:'SPDXRef-DOCUMENT',relationshipType:'DESCRIBES',relatedSpdxElement:'SPDXRef-Source'}]
  });
  const artifacts=[identity(path.basename(archivePath))];
  const releaseDocuments=['SOURCE-MANIFEST.json','SBOM.spdx.json'].map(identity);
  write('RELEASE-MANIFEST.json',{schemaVersion:1,version,source,validation:{inputCommit:a.input_commit,live:a.live.status,portable:a.portable?.status||'not-recorded'},artifacts,releaseDocuments});
  const all=[...artifacts,...releaseDocuments,identity('RELEASE-MANIFEST.json')];
  fs.writeFileSync(path.join(out,'SHA256SUMS'),all.map(f=>`${f.sha256}  ${f.name}\n`).join(''));
  return {out,source,files:all,live:a.live.status};
}

if(process.argv[1]===new URL(import.meta.url).pathname) {
  try {const result=archive();console.log(`Created source release in ${result.out}; live acceptance: ${result.live}. This is not an installable application binary.`);}
  catch(e){console.error(e.message);process.exitCode=1;}
}
