# StarForge canonical branch and release policy

## Canonical StarForge source

For StarForge implementation, validation, and release-candidate work, the canonical branch is:

- `starforge/governance-kernel`

All StarForge milestone workflows, the Phase A real-model gate, and the Android 9 validation workflow must run from this branch. The latest known green baseline before this policy was recorded is commit `42566ffc9031a8893fd95895e6c50cd7014a2aa0`; new changes must earn a fresh green run before the baseline is advanced.

## Relationship to the repository default branch

The GitHub repository default branch is currently `feat/harness-backend`. It contains a substantially different upstream-derived history. The branch comparison shows the StarForge branch has hundreds of StarForge-specific commits and has diverged from the default branch.

Do not merge `starforge/governance-kernel` into `feat/harness-backend`, force-update either branch, or retarget releases merely to make the branch names match. That could mix the StarForge product work into the upstream-derived branch and make future upstream syncs unsafe.

Changing GitHub's repository default branch is a repository-settings operation and is not performed by this source-file policy. Until an authorized repository-settings action changes it, treat `starforge/governance-kernel` as the canonical StarForge development/release-candidate source, and `feat/harness-backend` as the repository's existing default/upstream-derived branch.

## Required workflow

1. Make StarForge code changes on `starforge/governance-kernel`.
2. Run the applicable targeted test plus the StarForge regression workflows.
3. Advance the validated checkpoint only after the relevant required workflows are green.
4. Keep live APInex validation separate from mock/offline tests; a green offline workflow does not prove that a real APInex business mission ran.
5. Build and release Android from the validated StarForge branch only after the applicable runtime and packaging checks pass.
6. Never bypass immutable upstream release-tag checks to make a fork mirror succeed. Upstream-only release mirroring must remain scoped to the upstream repository.

## Promotion checklist

Before a public release, verify:

- [ ] The intended source commit is on `starforge/governance-kernel`.
- [ ] M3–M9, HQ Reality, Web Runtime, Phase A, and Android 9 checks have green runs for that exact commit where applicable.
- [ ] The live APInex gate reports whether the secret is configured and whether real execution actually ran; a skipped/pending gate is not a pass.
- [ ] Android package is built from the validated commit and tested on a physical Android 9 device.
- [ ] Release assets and provenance point to the same validated source commit.
