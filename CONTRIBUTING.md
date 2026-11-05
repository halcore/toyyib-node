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

## Releasing

Maintainers only. [release-please](https://github.com/googleapis/release-please) keeps a release PR open with the next version and its changelog, worked out from the commit messages. Merging that PR tags the release, and `.github/workflows/release.yml` publishes it to npm with provenance, using npm trusted publishing.

The first release needs one extra step, because npm can only add a trusted publisher to a package that already exists:

1. On npmjs.com, create a granular access token that can publish to the `@toyyib` scope, with a short expiry. Save it as this repo's `NPM_TOKEN` Actions secret.
2. Merge the release PR. The workflow publishes `0.1.0` with the token.
3. In the package's settings on npmjs.com, add a trusted publisher: GitHub Actions, organisation `halcore`, repository `toyyib-node`, workflow `release.yml`.
4. Delete the `NPM_TOKEN` secret and revoke the token. Later releases use trusted publishing only.
