# Prepare a release

The included workflow creates a **draft source release**. It never publishes a marketplace listing or promises a prebuilt installer.

1. Finish the feature and replace starter copy. Confirm licences and asset rights.
2. Run portable and native checks. On Omarchy record the exact installed version, commands, results, source commit and limitations in docs/ACCEPTANCE.json. Set status to passed only after actual acceptance. Record this in a subsequent documentation-only commit.
3. Update VERSION and the manifest before testing. Merge the release preparation through a PR and confirm green CI on the final main commit.
4. Run **Release source** from Actions on `main`, supplying the semantic version tag and the full `expected_commit` SHA. The workflow verifies main, runs tests, creates an annotated tag and builds the assets before pushing the tag. It refuses to move an existing tag. The source archive preserves the complete tracked project, including development checks. Installed runtime packages must use an explicit file allowlist and exclude authoring instructions, blueprint files and workflow files.
5. Review the draft release, write outcome-focused notes and publish when ready.

The first release has its own runbook and draft notes in [RELEASE-v0.1.0.md](RELEASE-v0.1.0.md).

The archive script refuses uninitialized projects, dirty checkouts, version/tag mismatches and runtime changes after the recorded evidence commit. It uses `docs/ACCEPTANCE-vX.Y.Z.json` when present, otherwise the historical `docs/ACCEPTANCE.json`. Normally both the record and live acceptance must be passed. An owner-requested release with outstanding live checks needs a versioned `pending-live` record with passing portable evidence and the explicit `allow_pending_live` workflow input. This preserves the missing evidence as pending in the release manifest; it does not turn CI into desktop acceptance. Failed records and later runtime changes remain blocked.

The five assets are the source tarball, `SOURCE-MANIFEST.json`, `RELEASE-MANIFEST.json`, `SBOM.spdx.json` (a source-package inventory), and `SHA256SUMS`. Before publication, download the draft assets and verify their sizes, hashes, source SHA/tree, version, and annotated tag against main. The archive is source, not an installer. The Git install remains the documented runtime installation path.
