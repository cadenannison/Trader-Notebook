#!/usr/bin/env python3
"""Fail if a workflow references a repo secret that doesn't actually exist.

Requires a `gh` CLI authenticated with a token that has admin access to the
repo — the `actions/secrets` API endpoint isn't readable with the default
GITHUB_TOKEN available inside an Actions run. Run this manually:

    .github/scripts/audit_workflow_secrets.py

See the "Manual steps" note in the deploy/CI hardening PR for what's needed
to wire this into CI itself.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
WORKFLOWS_DIR = REPO_ROOT / ".github" / "workflows"
SECRET_REF_RE = re.compile(r"secrets\.([A-Z_][A-Z0-9_]*)")

# Always available in Actions, never listed by the actions/secrets API.
BUILTIN_SECRETS = {"GITHUB_TOKEN"}


def referenced_secrets() -> dict[str, set[str]]:
    refs: dict[str, set[str]] = {}
    for path in sorted(WORKFLOWS_DIR.glob("*.yml")):
        names = set(SECRET_REF_RE.findall(path.read_text())) - BUILTIN_SECRETS
        if names:
            refs[path.name] = names
    return refs


def configured_secrets(repo: str) -> set[str]:
    result = subprocess.run(
        ["gh", "api", f"repos/{repo}/actions/secrets", "--paginate", "--jq", ".secrets[].name"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.exit(
            "Failed to fetch configured secret names via `gh api "
            f"repos/{repo}/actions/secrets`.\n"
            "This endpoint requires a token with admin access to the repo — "
            "the default GITHUB_TOKEN in an Actions run cannot read it.\n"
            f"gh error:\n{result.stderr}"
        )
    return set(result.stdout.split())


def current_repo() -> str:
    result = subprocess.run(
        ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.exit(f"Failed to detect current repo via `gh repo view`:\n{result.stderr}")
    return result.stdout.strip()


def main() -> None:
    repo = current_repo()
    refs = referenced_secrets()
    configured = configured_secrets(repo)

    print(f"Repo: {repo}")
    print(f"Configured secrets ({len(configured)}): {', '.join(sorted(configured))}\n")

    missing: dict[str, set[str]] = {}
    for filename, names in refs.items():
        unresolved = names - configured
        if unresolved:
            missing[filename] = unresolved

    if not missing:
        print("OK: every secrets.* reference in .github/workflows/ matches a configured secret.")
        return

    print("FAIL: workflow(s) reference secrets that are not configured on the repo:\n")
    for filename, names in sorted(missing.items()):
        for name in sorted(names):
            print(f"  {filename}: secrets.{name}")
    print(
        "\nEither add the missing secret(s) in Settings > Secrets and variables > "
        "Actions, or remove the dead reference from the workflow."
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
