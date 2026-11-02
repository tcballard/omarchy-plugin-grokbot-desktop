# Agent Desktop v0.2.0: multi-provider feature scope

Status: scoped, implementation not started.
Date: 2 November 2026.
Feature branch: `feature/multi-provider-companion`.
Base: `928f73a00114a60fec673d204bd20be36199a0a7` (v0.1.2 main).
Owner decision: consolidate personal-agent companions as **Agent Desktop** (Omarchy Agent Desktop in platform-qualified copy), with target repository slug `omarchy-plugin-agent-desktop`. The existing repository will be renamed in place.
Release: **v0.2.0 delivers multi-provider support and the Agent Desktop rename.** Costumes are deferred to a later feature release; no version is assigned to them.

## Outcome

One installed Omarchy companion can show and talk to Grok bots, Hermes profiles and existing local coding agents in one roster. Adding a provider should require an adapter, provider setup/help and conformance tests, without another copy of the avatar or chat interface.

First demonstrable slice: a Grok bot and a Hermes profile with the same display name coexist; a message, reply, draft and unread indicator remain attached to the correct agent when switching between them. One unavailable provider leaves the other usable.

This is a desktop integration project. Agent runtimes continue to own their memory, credentials, tools and execution policies.

## Scope boundaries

| First feature release | Deferred or separately investigated |
| --- | --- |
| Shared provider contract v1 and deterministic fake adapter | Public adapter marketplace, dynamic downloads, third-party SDK |
| Grok webhook adapter and roster discovery | New Grok API functionality not supported by its actual integration |
| Hermes gateway adapter with explicit CLI fallback | Reimplementing Hermes or bundling its agent runtime |
| Existing local coding-agent routes behind one adapter | New coding-agent integrations unrelated to consolidation |
| Mixed roster, identities, shared config resolution | Cross-provider autonomous handoffs, shared memory or orchestration |
| Capability-aware chat, approvals and history | Full-text search, transcript export, new durable chat database |
| Existing appearance, attachments, dictation and privacy behaviour | Costumes and unrelated visual redesign |
| Repository/product rename and upgrade compatibility | New permanent plugin ID unless separately decided |
| Extension checklist for OpenClaw, Dots and Muse | Promised support before a concrete supported interface is verified |

OpenClaw, Dots and Muse are future candidates. Their exact upstream projects, API availability, authentication and terms are not established by this scope. No browser-session scraping or reverse-engineered credential extraction is assumed. An unavailable integration must be reported as unavailable, not emulated with a different agent.

## Architecture and ownership

Retain the hosted `kind: service`, `Main.qml` entry point and one companion window inside omarchy-shell. No second Quickshell process or standalone shell root.

- QML owns rendering, focus, interaction, appearance, selection, in-memory drafts and unread state.
- A small controller owns provider connections, validated event routing, request state, deadlines and lifecycle cleanup.
- Provider adapters own upstream protocol details, discovery, authentication integration and capability reporting.
- Providers own durable agent conversations, memory, approvals and execution.
- Shell inline settings retain appearance and placement. Provider config remains a private companion-owned file with a documented schema.
- Attachments stay in a bounded private runtime directory. No new persistent transcript store.
- Keep current Python/QML implementation for this change. Adapters may later use another language without changing the wire contract; a Rust rewrite is not part of this scope.

Use explicit modules and a fixed built-in adapter registry. Do not introduce a generic command/network DSL. Keep provider conditions out of avatar/rendering components. Evaluate existing process/store helpers, including Omakit Run/Store, during implementation only if they reduce duplicated boundary code; adoption needs a pinned source/license review and actual lifecycle fit.

## Provider contract v1

Use UTF-8 JSON Lines on stdin/stdout between the controller and each enabled adapter. Stderr is redacted diagnostics. At most one long-lived adapter process per configured provider instance; CLI children can still be created per turn inside the local/Hermes adapter.

Handshake negotiates protocol major/minor, adapter version, availability, provider-instance identity, upstream compatibility, capabilities and limits. No request is dispatched before a successful compatible handshake. Unsupported major versions fail visibly; additive optional fields may be ignored, unknown methods return unsupported.

The runtime schema, documentation and adapter conformance tests must be delivered together. Keep schemas dependency-light.

### Identity and envelopes

Use structured identity fields, not parsing display names or concatenated colon strings:
- provider type, such as grok, hermes or local;
- configured provider-instance ID, allowing future multiple accounts/roots;
- provider-native agent ID;
- provider-native session ID where supported;
- controller-generated request ID;
- operation correlation ID for commands and acknowledgements;
- connection epoch and event ID/sequence to reject stale or duplicate events.

UI keys derive from the complete provider-instance/agent identity. Examples such as `hermes:donna` are display shorthand only. Discovery refresh must preserve other providers and retain temporarily unavailable agents with explicit status. Successful authoritative removal is distinct from failed discovery. Duplicate names require disambiguation; voice shortcuts never silently pick between ambiguous matches.

### Operations

| Operation | Required behaviour |
| --- | --- |
| hello | Negotiate protocol, capabilities and limits |
| agents.list | Return agents and availability; indicate complete versus partial discovery |
| message.send | Submit to the explicit agent/session with request ID and optional private attachment handles |
| request.cancel | Report requested, confirmed, unsupported or outcome unknown; never claim a remote task stopped merely because its viewer closed |
| prompt.answer | Optional: bind response to provider/session/request/prompt identity and generation |
| history.list | Optional: bounded pages and opaque cursor, with persistence/truncation metadata |
| session.compact | Optional: preserve upstream semantics and report completion |
| shutdown | Stop adapter-owned work and clean up without killing externally owned provider services |

Providers without server-side session IDs use an explicit local view/session identity; they must not advertise durable history. New-session/reset is reserved for a later verified provider capability rather than pretending Clear resets memory.

Events: availability, accepted, progress, text delta, final response, input required, input settled, history result, cancellation result and typed error. Background messages include source identity and upstream event/message IDs without pretending they answer a foreground request. Provider-specific extensions remain namespaced.

Capabilities are per agent/session where needed: streaming, attachment types/limits, history, background events, approvals, single/multiple-choice clarification, cancellation semantics, compaction and persistence. Declare actual transport capabilities: Hermes CLI fallback is not gateway streaming.

### Lifecycle and delivery guarantees

Separate local receipt from provider acceptance. Foreground state: submitting -> accepted/running -> waiting for input -> running -> completed/failed/cancelled. Delivery-unknown is a distinct recovery state after ambiguous transport failure. Provider availability is separate from request state.

- Retain one foreground submission at a time for the first release; background events still arrive for all enabled providers. No new concurrent agent scheduler.
- Every accepted request gets at most one terminal UI transition. Reject late, duplicate, stale-epoch and wrong-session events.
- Never automatically resend a potentially accepted message. Use upstream idempotency/reconciliation when available; otherwise expose unknown outcome and explicit retry.
- Apply a controller-owned end-to-end deadline equally to streaming, CLI and webhook routes. Optional transport timeouts cannot extend it. Waiting for approval counts towards the configured deadline in v1.
- Cancel waits for acknowledgement. A webhook lacking remote cancellation stops local waiting and says the remote operation may continue. Already completed work cannot become cancelled.
- Preserve existing close-bubble versus hide behaviour: closing the card leaves work running; hiding requests cancellation of the foreground work, with truthful provider semantics.
- Backoff reconnects are bounded. Reconnect retrieves missed events/history where supported; show a gap when recovery is impossible. Do not overwrite drafts or duplicate messages.
- Shell unload stops adapter processes and reaps owned children. Do not stop an externally owned Hermes gateway. No unconditional cancellation of unrelated external turns.

Initial limits: 1 MiB maximum JSON frame; 4,000-character user prompt retained; current four-attachment/25 MB-per-file limits retained subject to lower provider limits; bounded queued events and retained history. Keep canonical approval action data separate from clipped display text. Reject oversize control/action payloads rather than silently changing their meaning. Streaming display limits must not silently imply a truncated response is complete.

Errors distinguish unavailable, unauthenticated, unsupported, incompatible version, offline, empty result, rejected, rate limited, deadline exceeded, malformed data and internal failure. Include safe recovery guidance, not credential-bearing exception strings.

## Provider work

### Grok

Preserve current roster import, webhook authentication, accepted-asynchronous reply flow and private callback helper. Map legacy ask IDs to namespaced requests; ambiguous legacy callbacks fail visibly. Preserve existing URL/header validation and attachment refusal. Grok coding CLI remains a local-agent route, distinct from Grok Bot webhook identity. No automatic provider substitution.

### Hermes

Bring over Yani's profile discovery and gateway bridge with attribution and preserved commit provenance. Use its canonical Bot Chat, streaming, background messages, approvals, clarification, history and compaction.

Fix reviewed gaps:
- one config resolver for UI, discovery, bridge and CLI;
- controller deadline enforced on streaming;
- retain pending approval controls until provider acknowledgement; restore on recoverable failure;
- implement multiple-choice selection correctly or report it unsupported;
- missing/malformed YAML must not silently reveal hidden profiles;
- explicit CLI fallback for attachments/unavailable bridge, with downgraded capabilities;
- runtime-version/feature probe for internal gateway modules and DB schema;
- reconcile reconnect gaps and history without losing local drafts;
- distinguish Clear view from server-side reset/forget;
- correct card expansion at top and bottom edges.

Do not claim arbitrary Hermes versions work. Record the tested upstream revision/version and prerequisites.

### Local agents

Wrap existing trusted executable resolution and prompt-on-stdin behaviour. Keep existing supported commands and authentication ownership. Process-group cancellation must reap descendants. Preserve image/file handling and stdout ceilings. Do not infer history, approval or streaming support from an executable name.

### Future provider integration checklist

Before implementing OpenClaw, Dots, Muse or another provider: resolve exact upstream identity; inspect official API/CLI/socket and authentication; document local/remote trust and endpoints; map capabilities; confirm cancellation/idempotency/session semantics; verify installation/license requirements; add adapter fixtures and a real end-to-end acceptance record. If no usable interface exists, record the blocker and defer that adapter.

## Setup and shared UI

Add a provider section to settings: enable/configure provider, check availability, sync its agents, show supported capabilities and actionable dependency/authentication errors. Provider-native login stays with the provider's supported tool. Keep setup discoverable without requiring raw JSON editing for routine choices; private secret entry stays in an appropriate private helper, not shell inline settings.

One mixed picker with provider labels when needed; stable identity underneath. Preserve custom appearance, roster appearance, name badge, motion, scaling, click-through, multi-monitor placement and reduced motion. Import compact/expand and scroll improvements as shared behaviour. History/approval/compact controls appear only when supported.

Normal status/diagnostics return identities, availability and lifecycle, not excerpts of prompts/replies. Sensitive IPC, including approval answers, uses private stdin/socket delivery. No network listener is added for the common protocol.

## Rename and migration

Target product name: **Agent Desktop**. Target repository: `tcballard/omarchy-plugin-agent-desktop` (lowercase slug). Rename the existing repository in place so its history and collaboration remain together. The remote rename is a rollout task, not completed by this scope update.

Repository name, display name and permanent plugin ID are separate:
- Keep `io.github.tcballard.grokbot-desktop` as the permanent ID for this feature.
- Keep legacy IPC target, helper aliases and settings/key paths working.
- Do not publish a second listing with the same ID or treat a rename as a new install.
- A new permanent ID would be a separate migration decision with marketplace coordination.

Rename checklist:
1. Check availability of the chosen destination `tcballard/omarchy-plugin-agent-desktop` before the in-place rename.
2. Inventory repository references in README, manifests, badges, workflows, release packaging, installation commands and marketplace metadata.
3. Prepare neutral display copy and adapter docs; preserve licenses, source credits and authorship.
4. Convert legacy dispatch/roster config through an explicit schema migration. Preserve the original backup, provider settings, unknown keys and secret file ownership/modes. Migration is atomic, repeatable, conflict-aware and does not overwrite unrelated shell entries.
5. Preserve old selected-agent mapping and shortcuts. Keep new schema side-by-side if needed so returning to v0.1.2 can still read unchanged legacy settings. Never migrate transient chat/drafts as though they were durable history.
6. Verify upgrade from Grok v0.1.2, replacement Hermes installation, fresh install, interrupted migration and rollback.
7. Owner performs/schedules the repository rename; re-resolve repository identity and refs afterwards. Verify old URL behaviour rather than assuming every downstream consumer follows it.
8. Update the existing marketplace source/listing through its current supported process at an exact tested commit, including rename coordination where needed. No submission or remote rename is performed by this scope document.

Marketplace guidance checked on 2 November: one root manifest/plugin, globally unique permanent ID, documented dependencies and installation/removal, exact-commit update verification. Current submission and security guidance:
- https://github.com/omacom/omarchy-plugin-marketplace/blob/main/SUBMISSION.md
- https://github.com/omacom/omarchy-plugin-marketplace/blob/main/SECURITY.md
Recheck at release; historical approval does not cover a new feature commit.

## Implementation sequence and acceptance

| Stage | Deliverable | Exit condition |
| --- | --- | --- |
| 0. Scope | This record, roadmap link, isolated branch | Base and non-goals recorded; Agent Desktop name, target slug and v0.2.0 assigned |
| 1. Shared fixes | Review #24–26 and #24 fork follow-ups | IPC, dictation and cancellation regressions pass; preserve provenance |
| 2. Contract | v1 schemas, controller, fake adapter, config/identity model | Two same-name agents cannot cross-route; invalid/stale events rejected |
| 3. Existing behaviour | Grok and local adapters | Existing requests, callbacks, privacy, attachments and UI regressions pass |
| 4. Hermes | Profile/gateway adapter and explicit CLI fallback | Mixed Grok/Hermes slice works; reviewed gaps fixed |
| 5. Product integration | Setup, mixed picker, capability controls and shared card changes | Unavailable provider leaves others usable; approvals/history have accurate semantics |
| 6. Rename/migration | Chosen branding, compatibility aliases, upgrade/rollback docs | Fresh/legacy/Hermes migrations pass; existing plugin identity preserved |
| 7. Release candidate | Exact-commit evidence, docs and feature release notes | CI, native checks and live Omarchy acceptance pass |

Feature development stays on this branch (or small child branches targeting it). Keep main releasable. Reconcile fixes landing on main before merging the feature. Do not blindly merge the entire fork or prematurely archive Yani's repository. Review open #17/#18 separately; they are not automatically included. No implementation, merge, tag or publication is completed by this scoping commit.

## Test plan

Portable conformance fixtures cover: protocol negotiation; malformed/oversize frames; partial reads; bounded producer/backpressure; duplicate names/accounts; partial discovery; no credential/chat leakage in argv/logs; request acceptance races; ambiguous disconnect without resubmission; late events after cancel; child cleanup; deadline parity; background reply routing; callback correlation; denied/expired/rejected approval; multiple-choice clarification; hidden profile parsing failure; unavailable dependencies; attachment validation; history pagination/compaction/gaps; config precedence and atomic migration/rollback.

Run `./tests/run` and native QML checks appropriate to the changed components. Add provider contract behaviour tests, not just source-string assertions. Previous review runs were not a clean baseline: missing binary assets/Git metadata, unavailable sockets, missing YAML and an unresolved attachment test must be resolved on a complete supported checkout before claiming green.

Live acceptance on stable and dev Omarchy where claimed: shell reload/unload, private IPC, cancellation, restart, top/bottom card placement, click-through/focus, reduced motion and fractional scaling; real Grok webhook callback; real Hermes gateway/CLI fallback, approval and reconnect; installed local agent; coexistence and isolated failure. Record exact plugin and upstream versions, commands and observed results. Live evidence cannot be replaced with mocked tests.

Removal preserves provider configuration, credentials and upstream conversations. No installer hooks, sudo setup, background provider installation or new shared authentication broker.

## Decisions still open

- Destination availability and rename execution timing: verify before the in-place rename.
- Later costume release number: unassigned; costumes do not block v0.2.0.
- Tested Hermes version range and future provider interfaces: implementation investigation.
- Marketplace source-rename procedure: verify with current supported workflow before changing listing metadata.

## Progress

- [x] Existing source and fork comparison completed at pinned commits.
- [x] Dedicated branch created from current main.
- [x] Feature scope and rename boundaries recorded.
- [ ] Shared fixes reviewed and integrated.
- [x] First protocol slice: v1 JSON Lines server, envelope schema, hook client, reference adapter, and Hermes gateway wrapper with portable tests. See [Provider API](PROVIDER-API.md).
- [ ] Contract/controller and three initial adapters implemented. The current slice is headless; mixed-provider desktop routing, Grok/local adapters, configuration and live Hermes acceptance remain pending.
- [ ] Mixed-provider acceptance and migration verified.
- [x] Product name and target repository slug selected; v0.2.0 assigned to multi-provider support.
- [ ] Repository/listing rename coordinated and executed.
- [ ] Release candidate validated and published.

Update this record and the existing roadmap as work progresses. Do not create parallel status documents.

### First implementation slice — 2026-11-02

Implemented the standalone provider endpoint and developer hook client before
connecting the desktop UI. The reference adapter completes a real pipe-based
request; the Hermes adapter covers discovery, admission, streaming, prompts,
history, compaction, cancellation and deadlines behind the same v1 boundary.
Hermes gateway behaviour is mocked in these tests; no live compatibility claim.

Validation: 19 provider API tests passed; 5 existing Python sync tests passed;
plugin structural checks and Python compilation passed. The full Node suite
reported 89 passing and 18 failing tests, matching the pre-change checkout's
Unix-socket `listen EPERM` failures in this environment. Native `qmllint` is not
available. No QML was changed, and live Hermes/Omarchy validation remains pending.
