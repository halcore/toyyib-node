# Contributing

Thanks for helping improve `@toyyib/sdk`. Bug reports, fixes and docs improvements are all welcome.

## Setup

The library runs on Node 18 or newer, but its development tools need Node 22 or newer.

```sh
git clone https://github.com/halcore/toyyib-node.git
cd toyyib-node
npm ci
```

## Checks

| Command              | What it does                                       |
| -------------------- | -------------------------------------------------- |
| `npm test`           | Runs the tests, with a fake `fetch`: no network    |
| `npm run lint`       | ESLint and Prettier                                |
| `npm run typecheck`  | Type-checks the source, the tests and the examples |
| `npm run build`      | Builds `dist/` (ES module, CommonJS and types)     |
| `npm run check:dist` | Loads the build and makes one request through it   |
| `npm run format`     | Formats everything with Prettier                   |

CI runs all of them on every pull request.

## API types

The reply types come from the API's OpenAPI schema. `openapi/schema.json` is a filtered copy of it, and `src/generated/schema.d.ts` is generated from that copy. Never edit either by hand. To refresh both:

```sh
npm run generate
```

This reads the live schema. To use a local file instead, set `TOYYIB_SCHEMA_URL=file:///path/to/schema.json`.

## Rules for changes

- Write a failing test first, then the change that makes it pass.
- Test data is invented. Use sandbox-style symbols such as `TESTCO`, and never a real API key.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:` and so on. Releases and the changelog are built from them.
- Keep the library dependency-free at runtime.

## Pull requests

Open a pull request against `main`. A maintainer reviews every one, and CI must pass before it's merged.

To report a security problem, don't open an issue: see [SECURITY.md](SECURITY.md).
