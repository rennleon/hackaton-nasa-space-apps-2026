# Releasing and rolling back

## Versioning

- **One source of truth:** the `VERSION` file at the repo root (Semantic Versioning `MAJOR.MINOR.PATCH`).
  `node scripts/version.mjs check` verifies that every version field agrees with it (root and web
  `package.json` and lockfiles, `backend/pyproject.toml`, `backend/uv.lock`, `ENGINE_VERSION`). CI runs this check.
- **Every release is an annotated git tag `vX.Y.Z` on `main`** plus a GitHub Release built from it.
- **Bump rules:** PATCH for fixes and copy changes; MINOR for new features or new data; MAJOR when the result
  contract (`contract/*.schema.json`) changes in a way old clients can't read.
- **Where the version shows:** the app footer (`vX.Y.Z`), the API `/health` endpoint, and `engine_version` in every
  result JSON, so you can always tell which release produced what you see.

## Cutting a release

1. Merge the PR into `main`, then on your machine: `git checkout main && git pull`.
2. Add your changes under `## [Unreleased]` in `CHANGELOG.md` (if not already there) and commit.
3. Run `npm run release -- patch` (or `minor`, `major`, or an exact version such as `0.2.0`).
   This bumps every version field, moves the Unreleased notes under the new version, regenerates the
   static results, commits `release: vX.Y.Z` and creates the tag. It does not push.
4. Publish: `git push origin main --follow-tags`.
   Pushing the tag runs `.github/workflows/release.yml`: tests, a check that the tag matches `VERSION`, the web
   build attached as `web-dist-vX.Y.Z.tar.gz`, the API image `ghcr.io/<owner>/<repo>-api:vX.Y.Z`, and a GitHub
   Release with the CHANGELOG notes.

For the very first release (`0.1.0`, already in `VERSION`): after merging, run `npm run release -- 0.1.0`; it skips
the bump and only tags.

## Rolling back

Pick the last good version from the GitHub Releases page or `git tag --sort=-v:refname`.

- **Run a previous version locally:** `git checkout vX.Y.Z && npm install && npm run dev`
  (or `npm run lan`). `git checkout main` returns to the latest.
- **Redeploy a previous version:** deploy the artifacts of that tag; nothing needs rebuilding:
  - web: the `web-dist-vX.Y.Z.tar.gz` asset of that GitHub Release (a static site);
  - API: the image `ghcr.io/<owner>/<repo>-api:vX.Y.Z`.
- **Undo a bad release on `main`:** `git revert <commit>` (never rewrite `main`'s history), add a CHANGELOG
  entry, and cut a new PATCH release. The bad tag stays, so history remains truthful.
