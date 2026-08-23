# Main branch protection

The workflow exposes one stable required check: `CI / quality`. It runs generated-file synchronization, dependency installation, lint, strict TypeScript, all Node tests (including the real onboarding job fixture), every checked-in Python onboarding manifest validation, and the production build on Node 24/Python 3.13.

Repository administration could not be completed from the implementation environment because the configured GitHub CLI token is invalid. Apply this ruleset manually to `Iamanshuaditya/3d`:

1. Target the default branch `main`.
2. Require a pull request before merging.
3. Require at least one approving review and dismiss stale approvals when new commits are pushed.
4. Require status check `CI / quality` and require the branch to be up to date before merging.
5. Require conversation resolution.
6. Block force pushes and branch deletion.
7. Do not allow bypass except a deliberately reviewed emergency administrator policy.

After configuring it, verify from a test pull request that a failing lint/test/build blocks merge and that direct pushes to `main` are rejected.
