#!/usr/bin/env bash
# PURPOSE: Keep pushed release tags on the exact main commit used by CI.
set -euo pipefail

remote_name="${1:-origin}"
remote_main=""

while read -r local_ref local_sha _remote_ref _remote_sha; do
  # PURPOSE: Ignore branch pushes, tag deletions, and non-release tags.
  [[ "${local_ref}" =~ ^refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
  [[ "${local_sha}" != 0000000000000000000000000000000000000000 ]] || continue

  if [[ -z "${remote_main}" ]]; then
    remote_main="$(git ls-remote --heads "${remote_name}" refs/heads/main | awk 'NR == 1 { print $1 }')"
  fi
  if [[ -z "${remote_main}" ]]; then
    echo "Cannot read main from remote ${remote_name}." >&2
    exit 1
  fi

  tag_commit="$(git rev-parse "${local_ref}^{commit}")"
  if [[ "${tag_commit}" != "${remote_main}" ]]; then
    tag_name="${local_ref#refs/tags/}"
    echo "Push rejected: ${tag_name} must point to the latest remote main commit." >&2
    echo "Update main before creating and pushing the release tag." >&2
    exit 1
  fi
done
