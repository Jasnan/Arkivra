# Releasing Arkivra

Arkivra releases are built from signed SemVer tags on `main`. A tag publishes the multi-platform container image, but the GitHub release and its notes must still be created separately.

## Release candidate gate

Before tagging a release candidate:

1. Confirm the release branch is based on the current `main` and has no unrelated changes.
2. Resolve or explicitly defer every release-blocking issue and pull request.
3. Run the automated preflight checks:

   ```bash
   pnpm install --frozen-lockfile
   pnpm deps:audit
   pnpm deps:audit:prod
   pnpm typecheck
   pnpm test:fast
   pnpm build
   docker compose -f compose.production.yaml config --quiet
   ```

4. Build the container with the candidate version and repeat the rootless image smoke test from `.github/workflows/docker-publish.yml`.
5. Review the README, documentation, website, Compose defaults, issue template, and changelog for the exact candidate version.
6. Merge the release branch into `main`. Do not tag an unmerged branch.

## Publish v0.1.0-rc.1

Create an annotated, signed tag on the reviewed `main` commit:

```bash
git switch main
git pull --ff-only
git tag -s v0.1.0-rc.1 -m "Arkivra v0.1.0-rc.1"
git push origin v0.1.0-rc.1
```

Wait for **Publish Docker image** to finish successfully. Verify both AMD64 and ARM64 manifests for `ghcr.io/jasnan/arkivra:0.1.0-rc.1`, then create a GitHub prerelease using the reviewed changelog text.

## Candidate validation

Test the published, digest-resolved candidate rather than a locally built image.

### Clean deployment

- Generate a new production Compose configuration.
- Start PostgreSQL, Docling, and Arkivra with empty volumes.
- Confirm migrations, health checks, first-account administration, and sign-in.
- Test Docker-managed Arkivra storage and an `ARKIVRA_DATA_DIR` host directory.

### Upgrade from v0.1.0-beta.1

- Export and independently preserve a tested backup, deployment secrets, PostgreSQL data, and Arkivra file data.
- Stop every old Arkivra API and worker container so no authentication account can be written during the issuer backfill.
- Change only the pinned Arkivra image to `0.1.0-rc.1` and start the deployment.
- Confirm migrations complete and existing users, vaults, documents, versions, previews, tags, and search results remain available.

### Application smoke test

- Register and sign in with email and password.
- If configured, test Google or GitHub OAuth and TOTP.
- Upload a representative PDF and another supported document.
- Wait for processing, search for extracted text, preview and download the document, add a version, and restore an older version.
- Move a document to Trash and restore it.
- Create a backup and restore it into an isolated replacement instance.
- If enabled, test semantic search, cited document chat, and PDF translation separately from the core document workflow.

Record the tested image digest, platform, Docker version, PostgreSQL version, Docling version, browser, and result. A quiet observation period is useful only after these checks pass.

## Promote v0.1.0

Promote the candidate only when there is no unresolved release blocker and the candidate has completed at least one deliberate test cycle.

1. Freeze application changes on the release line.
2. Update candidate references and the changelog to `v0.1.0` without adding application behavior changes.
3. Repeat the automated preflight and container smoke tests.
4. Merge the release-finalization change to `main`.
5. Create and push the signed `v0.1.0` tag.
6. Verify the `0.1.0` and `latest` image tags and both platform manifests.
7. Create the non-prerelease GitHub release and publish the updated documentation and website.
8. Install `0.1.0` once from a clean production Compose configuration and verify health, sign-in, upload, processing, search, download, backup, and restore.

If a blocking problem is found, fix it on a new branch and publish the next candidate instead of moving an existing tag.
