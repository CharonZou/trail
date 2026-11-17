<div align="center">

<img src="docs/image/readme/logo.png" alt="Trail" width="108" />

# Trail

### A detachable desktop workspace for AI agents

**Projects, agents, models, plugins and workflows — in one long-lived desktop environment.**

Local-first · Model-agnostic · Plugin-powered · macOS / Windows / Linux

<br />

[![Release](https://img.shields.io/github/v/release/CharonZou/trail?label=release)](https://github.com/CharonZou/trail/releases/latest)
[![CI](https://github.com/CharonZou/trail/actions/workflows/ci.yml/badge.svg)](https://github.com/CharonZou/trail/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/CharonZou/trail)](LICENSE)

<br />

**[Download](https://github.com/CharonZou/trail/releases/latest)** ·
[User guide](docs/guide/index.md) ·
[Plugin development](docs/plugin-development.md) ·
[Screenshots](docs/guide/screenshots.md) ·
[简体中文](README.zh-CN.md)

</div>

---

## What Trail is

Trail is a desktop application, not an IDE panel and not a terminal session.
The project, its sessions, the agent working on them, and the Review / Preview
/ File panels each get their own space, and all of it is still there after a
restart.

A terminal agent is good at executing and an IDE agent is good at being
embedded. Trail is the layer that keeps the work: an independent, long-lived,
extensible workspace an agent can actually live in.

> **Current release line: 1.0.x (Early Preview).**

## What you get

* **Local-first storage.** Projects, sessions, transcripts, settings and
  credentials stay on your machine in a SQLite database owned by the Rust host
  core. Nothing is uploaded to make the app work.
* **Model freedom.** OpenAI-compatible endpoints, Anthropic, Google, local
  runtimes such as Ollama, and OAuth-backed providers — swap the model without
  rewriting your workflow.
* **Agent orchestration.** Subagents run delegated tasks in their own sessions,
  and the Session Orchestrator coordinates them with visible status, logs and
  results.
* **Three ways to work.** Agent for interactive turns, Plan for a reviewed
  sequence, Goal for a bounded run with a turn budget.
* **Plugins, not features.** Panels, tools, composer triggers, themes, floating
  widgets, background services and MCP servers ship as plugins with declared
  permissions and their own sandbox.
* **Permissions you control.** Filesystem, network, shell, browser, clipboard
  and credential access are gated per capability, and the gate is not something
  a plugin can talk its way past.

## Where it comes from

Trail is a fork, and it says so.

* **Agent engine — [`earendil-works/pi`](https://github.com/earendil-works/pi).**
  `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core` and
  `@earendil-works/pi-coding-agent` (pinned at `1.4.0`, patched in `patches/`)
  provide provider access, the agent loop and the coding tools. Pi is the
  engine; Trail is the desktop workspace built on top of it.
* **Desktop application — [`vastsa/PI-Desktop`](https://github.com/vastsa/PI-Desktop)**,
  released under LGPL-3.0, contributes the Electron workbench, the Rust host
  core, the plugin system, the specs and the tests under `docs/`.

This repository is the maintained Trail release line. It renames the workspace
packages (`@trail/*`), the environment variables (`TRAIL_*`), the host binary
(`trail-host-core`) and the local data directories (`.trail`), and points
releases, auto-updates, security reporting and issue feedback at
`CharonZou/trail`.

Some identifiers are deliberately **not** renamed, because changing them would
break data or contracts that already exist:

* the application ID `net.aiuo.pi-desktop`, which the OS keychain and packaged
  profiles were created under;
* persisted format tags, the plugin device-id namespace, the default
  config-sync key prefix, and the config-sync cryptographic domain separators,
  which are inputs to already-written vaults and already-uploaded buckets;
* the built-in skill ids `pi-desktop/imagegen` and `pi-desktop/visualize`, and
  the `.pi-desktop.lock` suffix on a session lease — prompt text and on-disk
  state a running install already carries these names;
* the `pi-desktop/*` branch namespace host-core uses for session worktrees,
  which already exists inside users' repositories;
* the directory a paired remote machine keeps its Host in (`~/.pi-desktop/pi-host`
  and the Host's default `~/.pi-desktop` profile), because the desktop finds and
  replaces the running Host by that exact path — a second name would let two
  Hosts write one database;
* the `pi-desktop/*` IPC and remote-control method names, the local MCP
  control-plane names (`pi_desktop_invoke`, the `X-Pi-Desktop-Token` header),
  and the renderer bridge global `window.piDesktop` — plugin panels and paired
  clients already bind to those names, so moving them needs a protocol version
  boundary, not a rebrand;
* the plugin marketplace catalogs, still served by their upstream publishers,
  and the publisher id written into an installed plugin's provenance row, which
  stays in that catalog's vocabulary.

Renamed with a read-fallback, so existing data keeps working: session links are
now `trail://session/<id>` and pasted `pi-desktop://session/<id>` links still
resolve, and a workspace's `.pi-desktopignore` is still honored beside the new
`.trailignore`.

Renamed without a fallback where the value only leaves the machine: the
`User-Agent` and `x-opencode-client` headers providers see, and the Linux
executable, deb/rpm package and icon names. An existing `.deb` or `.rpm`
installed under the old package name is therefore a separate package from the
Trail one rather than something it upgrades in place.

Old installations upgrade in place: the app reads `~/.pi-desktop` and
`PI_DESKTOP_DATA_DIR` when only the pre-Trail name exists. The other `TRAIL_*`
names are developer and harness switches and are renamed without a fallback, so
a local `.env` or script carries the new name.

## Install

Grab the package for your platform from the
[releases page](https://github.com/CharonZou/trail/releases/latest):
Windows installer or portable ZIP, macOS DMG / ZIP for Apple Silicon and Intel,
and AppImage / deb / rpm for Linux.

## Run from source

Requirements: Node.js `>=22.19`, pnpm `>=10`, a stable Rust toolchain.

```bash
git clone https://github.com/CharonZou/trail.git
cd trail

pnpm install

cargo build -p host-core
pnpm build:js

pnpm dev
```

Verification:

```bash
pnpm typecheck
pnpm lint
pnpm test
cargo test -p host-core
```

Packaged builds need the release host binary and the runtime bundle:

```bash
pnpm dist
```

## Repository layout

| Path | Responsibility |
| --- | --- |
| `apps/desktop` | Renderer, preload and Electron main process |
| `apps/pi-host` | Remote host build used over SSH |
| `crates/host-core` | Rust host: persistence, files, plugins, credentials |
| `packages/agent-runtime` | Agent execution on top of pi |
| `packages/shared` | Cross-boundary contracts and schemas |
| `packages/plugin-sdk` | Plugin authoring contract |
| `docs/` | Specs, ADRs, user guide |

## Documentation

* [User guide](docs/guide/index.md) and [screenshots](docs/guide/screenshots.md)
* [Architecture](docs/spec/02-architecture/01-architecture.md) and
  [specifications](docs/spec/README.md)
* [Decision records](docs/adr/README.md)
* [Plugin development](docs/plugin-development.md)
* [E2E test plan](docs/spec/06-delivery/04-e2e-test-plan.md) and
  [release runbook](docs/spec/06-delivery/06-release-runbook.md)
* [Agent development policy](AGENTS.md)

## Contributing

Issues, pull requests, plugins, skills, MCP integrations, documentation and
translations are all welcome. Before writing code, read
[`AGENTS.md`](AGENTS.md): it defines the boundaries a change may not cross.

For a capability that is only yours, ask one question first: **would this be
better as a plugin?** Keep the core restrained and let the ecosystem grow.

Report security vulnerabilities privately as described in
[`SECURITY.md`](SECURITY.md), not through a public issue.

## License

Trail is distributed under the **GNU Lesser General Public License v3.0**
([`LICENSE`](LICENSE)); see [`README.zh-CN.md`](README.zh-CN.md) for the
Chinese edition. Bundled third-party plugins and vendored assets keep their own
notices and licenses alongside their sources.

---

<div align="center">

<img src="docs/image/readme/logo.png" alt="Trail" width="72" />

## Trail

### Build your own Agent workspace.

**Your model · Your agent · Your plugins · Your workspace**

<br />

**[Download](https://github.com/CharonZou/trail/releases/latest)** ·
[User guide](docs/guide/index.md) ·
[Build a Plugin](docs/plugin-development.md)

<br /><br />

<sub>Local-first · Model-agnostic · Plugin-powered</sub>

</div>
