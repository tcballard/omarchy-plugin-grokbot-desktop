# v0.2.0 release preparation

Status: prepared for owner review. No merge, release tag, release workflow or publication is authorised by this preparation request. Review [the release notes](RELEASE-NOTES-v0.2.0.md) before tagging.

| Item | Prepared state |
| --- | --- |
| Product/version | Agent Desktop / 0.2.0 in VERSION and manifest.json |
| Tested runtime/build source | `2006a72c38d5e1a66fe7cf449122db5a7b40db4e`; [green CI](https://github.com/tcballard/omarchy-plugin-grokbot-desktop/actions/runs/41700695687) |
| Branch/PR | `feature/multi-provider-companion`, PR #27 |
| Stable plugin identity | `io.github.tcballard.grokbot-desktop`; existing configuration and helper paths retained |
| Repository | `tcballard/omarchy-plugin-grokbot-desktop`; requested rename to `omarchy-plugin-agent-desktop` pending |
| Live evidence | Owner-reported Grok testing and Codex avatar-speed fix; remaining scope is pending in [versioned acceptance](ACCEPTANCE-v0.2.0.json) |
| Hermes | Experimental in Settings, manifest and documentation; no live Hermes setup tested |
| Preview | Existing media is historical; a current live v0.2.0 capture remains pending |
| Tag/assets | Not created; archive generation intentionally waits for tag approval |

## After review

1. Apply the owner's release-note feedback. Resolve the repository rename and update current links/provenance if it is renamed; retain the stable plugin identity. Do not rewrite historical evidence URLs. Revalidate runtime/build changes and record their tested input SHA before packaging.
2. Complete outstanding live checks, or obtain explicit approval for a release with those checks still pending. Keep the limitations visible. The existing packaging gate requires `allow_pending_live=true` for the latter; it must never be inferred from permission to prepare notes.
3. Once release/merge is authorised, remove the draft marker and change candidate links in the release notes to the final versioned source. Merge PR #27 and require green CI on the final main SHA. Verify the acceptance input is an ancestor and that only documentation changed after it.
4. Only after tag approval, dispatch **Release source** on `main` with `tag=v0.2.0`, the exact reviewed `expected_commit`, and the appropriate live-evidence input. The workflow creates an immutable annotated tag and a draft source release. Never move a published tag.
5. Download and verify the source archive, source/release manifests, SPDX source inventory and SHA256SUMS against that commit and tag. Review the resulting draft before publication. Marketplace publication is separate.

The source archive is not an installer. The Git installation path remains documented in the README; branch-specific test and rollback instructions are in [TESTING-v0.2.0.md](TESTING-v0.2.0.md).
