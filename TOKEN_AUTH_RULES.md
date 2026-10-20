# Auth and history-creation rules for this session

## Token handling
- The GitHub token was pasted in the chat and should be treated as leaked into this session transcript.
- It must not be echoed, logged, or committed.
- If this session needs authenticated GitHub actions, store the token only in a protected file outside the repository and reference that file in tool calls, never the raw value.
- Recommended next step: rotate the token in GitHub settings after initial setup, because paste-in-chat is not a safe storage mechanism.

## Commit timeline rules
- One project per calendar day across the GitHub account.
- Skip any date that already has any commit in any repository for the account.
- Chronological order only.
- One meaningful commit per day minimum.
- Multiple commits on one day only when the phase is technically large enough to justify logical checkpoints.
- Every commit should leave the tree coherent and buildable wherever practical.
- No secrets in the repo.
- Commit messages should be conventional, concise, and descriptive.

## Authorship for this repo
- This is NotAzie's project. Principal-engineer commits should be authored as NotAzie, not as the coding agent account, unless a step explicitly needs the agent account for verification only.
- Do not change authorship just to manufacture a cleaner narrative. Use the real owner for public-facing history.

## Branch policy for now
- The repo currently has two relevant branches:
  - `main`
  - `feat/phase-1-foundation`
- The current task is to continue evolving the project into production quality.
- Continue from the appropriate baseline once the audit and policy decisions are finalized.

## Immediate next steps
1. Remove the token from the chat and store it only in a protected secret file if authentication is required.
2. Rotate the token in GitHub settings.
3. Confirm whether the history should be built on top of `main` from a chosen available date, or whether the current branch should be treated as the continuation.
4. Then proceed phase by phase, one commit per day, pushed separately.
