# GitHub Steps for Billy

Repo: **https://github.com/binetasaju/billy** (remote name `origin`, default branch `main`)

All commands are run from the repo root: `~/billy`

---

## 1. One-time setup

### 1.1 Your name and email (already set, check once)
```bash
git config --global user.name     # should print: Bineta Saju
git config --global user.email    # should be the email on your GitHub account
```
If wrong:
```bash
git config --global user.name  "Bineta Saju"
git config --global user.email "you@example.com"
```

### 1.2 Log in to GitHub from the terminal
GitHub does **not** accept your account password for `git push`. Use **one** of these:

**Option A — GitHub CLI (easiest)**
```bash
sudo apt install gh
gh auth login          # GitHub.com → HTTPS → Login with a web browser
gh auth setup-git      # lets git use the gh login
```

**Option B — Personal access token**
1. GitHub → profile picture → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. Repository access: *Only select repositories* → `billy`. Permissions: **Contents: Read and write**, **Pull requests: Read and write**.
3. Copy the token (you only see it once).
4. Save it so you're not asked every time:
   ```bash
   git config --global credential.helper store
   ```
   On the next `git push`, enter your GitHub username and paste the **token** as the password.

---

## 2. Right now: get the current work onto GitHub

Current state:
- `main` has **1 commit not yet pushed** (`chore: remove app screen recording and demo GIF`)
- Branch `chore/fixes-tests-cleanup` has all the recent fixes and is **not pushed yet**

```bash
# 1. Push main's pending commit
git checkout main
git push origin main

# 2. Push the fixes branch
git checkout chore/fixes-tests-cleanup
git push -u origin chore/fixes-tests-cleanup
```

### Open a Pull Request (PR)
**On the website:** open https://github.com/binetasaju/billy → a yellow bar says *"chore/fixes-tests-cleanup had recent pushes"* → **Compare & pull request** → write a short title/description → **Create pull request**.

**Or with the CLI:**
```bash
gh pr create --base main --title "Fixes: safe areas, extraction, GST, crop, tests" --fill
```

### Merge it
On the PR page → **Merge pull request** → **Confirm merge** → **Delete branch** (on GitHub).

Then update your laptop:
```bash
git checkout main
git pull origin main
git branch -d chore/fixes-tests-cleanup     # delete the local copy of the merged branch
```

---

## 3. Everyday workflow (every new feature or fix)

```bash
# 1. Start from an up-to-date main
git checkout main
git pull origin main

# 2. Make a branch for the work
git checkout -b feat/manual-bill-entry

# 3. ...edit code, test on the phone...

# 4. Run checks before committing (from mobile/)
cd mobile && npx tsc --noEmit && npm run lint && npm test && cd ..

# 5. See what changed, then commit
git status
git diff
git add -A
git commit -m "feat: add manual bill entry from home screen"

# 6. Push and open a PR
git push -u origin feat/manual-bill-entry
# → open the PR on GitHub (section 2), merge, then pull main
```

**One branch = one feature/fix.** Small PRs are easier to check and undo.

### Branch names
| Prefix | Use for | Example |
|---|---|---|
| `feat/` | New feature | `feat/custom-amount-split` |
| `fix/` | Bug fix | `fix/phone-10-digit` |
| `chore/` | Cleanup, deps, config | `chore/remove-console-logs` |
| `docs/` | Docs only | `docs/update-readme` |

### Commit messages
Start with the same prefix, then say *what* changed:
```
feat: add "owe someone" debts to groups
fix: stop adding GST on tax-inclusive bills
docs: add GitHub steps
```

---

## 4. Never commit secrets

These must stay **out of git** (already in `mobile/.gitignore`):
- `mobile/.env` — Gemini / Vision API keys
- `*.keystore`, `*.jks` — signing keys

Before every commit, check `git status` — if you ever see `.env` or a keystore listed, **don't commit**.

If a key was pushed by mistake: **revoke it immediately** (Google AI Studio → API keys → delete, create a new one). Removing it from git later is not enough — the old commit is still public.

> `google-services.json` is committed on purpose; Firebase client config is safe to share as long as Firebase security rules are set up.

---

## 5. Undo / fix mistakes

| Situation | Command |
|---|---|
| Throw away changes to one file (not committed) | `git restore path/to/file` |
| Throw away **all** uncommitted changes | `git restore .` ⚠️ can't be undone |
| Unstage a file (keep the changes) | `git restore --staged path/to/file` |
| Fix the last commit message (not pushed yet) | `git commit --amend -m "new message"` |
| Add a forgotten file to the last commit (not pushed yet) | `git add file && git commit --amend --no-edit` |
| Undo the last commit but keep the changes | `git reset --soft HEAD~1` |
| Undo a commit that's **already pushed** | `git revert <commit-id>` (makes a new "undo" commit — safe) |
| Save work-in-progress to switch branches | `git stash` … later `git stash pop` |
| Go back to the last commit after an AI broke things | `git restore .` (uncommitted) or `git reset --hard HEAD` ⚠️ |

**Never** use `git push --force` on `main`.

---

## 6. Useful commands

```bash
git status                     # what's changed
git log --oneline -10          # last 10 commits
git branch -a                  # all branches (local + GitHub)
git diff main                  # what this branch changes vs main
git fetch origin               # get latest info from GitHub without changing files
git pull origin main           # update current branch with GitHub's main
```

---

## 7. Optional: protect `main` on GitHub

GitHub → repo → **Settings → Branches → Add branch ruleset** → target `main` →
- ✅ Require a pull request before merging
- ✅ Block force pushes

This stops accidental direct pushes to `main` — all changes go through a PR.

---

## 8. Housekeeping still pending
- Delete the empty nested repo inside `mobile/` (it makes git look confused when run from `mobile/`):
  ```bash
  rm -rf ~/billy/mobile/.git
  ```
