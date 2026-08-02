# Stremio CLI

https://github.com/user-attachments/assets/15237b76-7a26-419b-a372-79329934e6cc

A small CLI client for searching Stremio and getting stream links. It uses
[Television (`tv`)](https://github.com/alexpasmantier/television) for the fuzzy-search TUI.

Search for a movie or series, select a season and episode when needed, then
choose a stream. The selected stream URL is printed to stdout.

> [!WARNING]
> Vibecoded slop

## Requirements

- Node.js 22.13 or newer (for the built-in SQLite cache)
- [pnpm](https://pnpm.io/)
- [Television (`tv`)](https://github.com/alexpasmantier/television#installation)

## Setup

Install the dependencies and create your local environment file:

```sh
pnpm install
cp .env.example .env
```

Set `STREMIO_ADDONS` to one or more Stremio addon manifest URLs. Separate
multiple URLs with commas:

```dotenv
STREMIO_ADDONS=https://example.com/manifest.json,https://another.example/manifest.json
```

## Run

Run from the TypeScript source during development:

```sh
pnpm start -- --search "The Matrix"
```

Use `Enter` to select an item and `Ctrl-C` to quit.

Searches, episode metadata, addon manifests, and short-lived stream results are
cached in SQLite. The database is stored in `$XDG_CACHE_HOME/stremio-cli`, or
`~/.cache/stremio-cli` when `XDG_CACHE_HOME` is not set.

## Build

Build the executable JavaScript files into `dist/`:

```sh
pnpm build
./dist/index.js --search "The Matrix"
```

To install the `stremio-cli` command globally from this checkout:

```sh
pnpm build
pnpm link --global
stremio-cli --search "The Matrix"
```

The build is a Node.js executable, not a standalone native binary. Node.js and
`tv` must still be installed on the target system.
