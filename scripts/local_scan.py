#!/usr/bin/env python3
"""xi-io portable local static scan (Y-axis / 1000s).

This scanner is intentionally local and read-only. It reports physical syntax and
repository-structure observations; it never establishes provider currentness,
runtime, deployment, authority, or closure.

Hard: LOCAL_PASS != LIVE | ACCOUNTING_100 != CLOSURE_100.
"""
from __future__ import annotations

import argparse
import ast
import json
import os
import shutil
import subprocess
import sys
import tokenize
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Iterator

SCHEMA = "xiio.sdk.local-static-scan/v1"
IGNORED_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build",
    "coverage", ".next", ".nuxt", ".cache", ".venv", "venv", "__pycache__",
}
SOURCE_SUFFIXES = {".py", ".js", ".mjs", ".cjs", ".json", ".sh", ".bash"}
# These are common Studio source families that this dependency-light scanner cannot
# safely parse with stdlib/Node alone. Their presence must stay visible and must not
# silently inherit PASS_LOCAL_STATIC.
UNVALIDATED_CODE_SUFFIXES = {".ts", ".tsx", ".mts", ".cts", ".jsx", ".vue", ".svelte"}
REPO_MARKERS = {
    ".git", "package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml",
    "build.gradle", "build.gradle.kts", "Gemfile", "composer.json", ".hg",
}


@dataclass(frozen=True)
class Finding:
    code: str
    state: str
    path: str
    detail: str


def _rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return str(path)


def iter_entries(root: Path) -> Iterable[Path]:
    """Yield files plus directory symlinks without traversing symlinked directories."""
    for current, dirs, files in os.walk(root, followlinks=False):
        base = Path(current)
        kept_dirs: list[str] = []
        for name in sorted(dirs):
            candidate = base / name
            if candidate.is_symlink():
                # A directory symlink is itself part of the physical repo surface even
                # when followlinks=False. Yield it so escape checks cannot miss it.
                yield candidate
                continue
            if name not in IGNORED_DIRS:
                kept_dirs.append(name)
        dirs[:] = kept_dirs
        for name in sorted(files):
            yield base / name


def run_command(argv: list[str]) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=20,
            check=False,
        )
        return proc.returncode, (proc.stdout or "").strip()
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 127, str(exc)


def check_syntax(path: Path, root: Path) -> Finding | None:
    rel = _rel(path, root)
    suffix = path.suffix.lower()
    try:
        if suffix == ".py":
            # tokenize.open honors PEP 263 encoding cookies instead of falsely
            # rejecting valid non-UTF-8 Python sources.
            with tokenize.open(path) as handle:
                ast.parse(handle.read(), filename=rel)
            return None
        if suffix == ".json":
            json.loads(path.read_text(encoding="utf-8"))
            return None
        if suffix in {".js", ".mjs", ".cjs"}:
            node = shutil.which("node")
            if not node:
                return Finding("TOOL_UNAVAILABLE", "UNKNOWN", rel, "node not available for --check")
            rc, out = run_command([node, "--check", str(path)])
            if rc:
                return Finding("SYNTAX_ERROR", "FAIL", rel, out[:1000] or f"node --check exit {rc}")
            return None
        if suffix in {".sh", ".bash"}:
            bash = shutil.which("bash")
            if not bash:
                return Finding("TOOL_UNAVAILABLE", "UNKNOWN", rel, "bash not available for -n")
            rc, out = run_command([bash, "-n", str(path)])
            if rc:
                return Finding("SYNTAX_ERROR", "FAIL", rel, out[:1000] or f"bash -n exit {rc}")
            return None
    except (UnicodeDecodeError, SyntaxError, json.JSONDecodeError, OSError) as exc:
        return Finding("SYNTAX_ERROR", "FAIL", rel, str(exc)[:1000])
    return None


def check_symlink(path: Path, root: Path) -> Finding | None:
    if not path.is_symlink():
        return None
    rel = _rel(path, root)
    try:
        resolved = path.resolve(strict=False)
        resolved.relative_to(root.resolve())
        return None
    except ValueError:
        return Finding("SYMLINK_ESCAPES_ROOT", "FAIL", rel, f"resolves outside root: {resolved}")


def iter_export_targets(value: object, trail: str = "exports") -> Iterator[tuple[str, str]]:
    """Yield string export targets from root shorthands, arrays and condition maps."""
    if isinstance(value, str):
        yield trail, value
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            yield from iter_export_targets(child, f"{trail}[{index}]")
        return
    if isinstance(value, dict):
        for key in sorted(value):
            yield from iter_export_targets(value[key], f"{trail}.{key}")


def export_target_exists(root: Path, target: str) -> bool:
    if not target.startswith("./"):
        # Non-local/null/condition semantics are outside this existence check.
        return True
    relative = target[2:]
    if "*" in relative:
        return any(root.glob(relative))
    return (root / relative).exists()


def check_package_exports(root: Path) -> list[Finding]:
    pkg = root / "package.json"
    if not pkg.is_file():
        return []
    findings: list[Finding] = []
    try:
        data = json.loads(pkg.read_text(encoding="utf-8"))
    except Exception:
        return findings
    exports = data.get("exports")
    if exports is None:
        return findings
    for trail, target in iter_export_targets(exports):
        if export_target_exists(root, target):
            continue
        findings.append(Finding(
            "PACKAGE_EXPORT_TARGET_MISSING", "FAIL", "package.json",
            f"{trail} points to missing current target {target!r}",
        ))
    return findings


def scan(root: Path, require_managed_manifest: bool = False) -> dict:
    root = root.resolve()
    findings: list[Finding] = []
    source_files = 0
    syntax_checked = 0
    unvalidated_by_suffix: dict[str, list[str]] = {}

    if not root.exists() or not root.is_dir():
        return {
            "schema": SCHEMA,
            "root": str(root),
            "axis": "1000s/Y/local-static",
            "status": "WAIT_NO_CODE_SUBJECT",
            "local_static_pass": False,
            "live_authority": False,
            "closure_100": False,
            "counts": {"source_files": 0, "syntax_checked": 0, "fail": 0, "unknown": 1, "observed": 0},
            "findings": [asdict(Finding("ROOT_NOT_DIRECTORY", "UNKNOWN", ".", "scan root is missing or not a directory"))],
        }

    repo_markers = sorted(name for name in REPO_MARKERS if (root / name).exists())
    repo_subject_bound = bool(repo_markers)
    if not repo_subject_bound:
        findings.append(Finding(
            "REPO_SUBJECT_UNBOUND", "UNKNOWN", ".",
            "directory has no recognized repository/project root marker; syntax observations cannot establish a repo baseline",
        ))

    for path in iter_entries(root):
        symlink_finding = check_symlink(path, root)
        if symlink_finding:
            findings.append(symlink_finding)
        if path.is_dir():
            continue
        suffix = path.suffix.lower()
        if suffix in UNVALIDATED_CODE_SUFFIXES:
            unvalidated_by_suffix.setdefault(suffix, []).append(_rel(path, root))
            continue
        if suffix in SOURCE_SUFFIXES:
            source_files += 1
            finding = check_syntax(path, root)
            if finding:
                findings.append(finding)
            else:
                syntax_checked += 1

    for suffix, paths in sorted(unvalidated_by_suffix.items()):
        findings.append(Finding(
            "SOURCE_FAMILY_UNVALIDATED", "UNKNOWN", paths[0],
            f"{len(paths)} {suffix} source file(s) observed but this dependency-light scanner has no qualified parser; first={paths[0]}",
        ))

    findings.extend(check_package_exports(root))

    manifest_paths = [
        root / "xiio" / "managed-project.manifest.json",
        root / "xiio" / "managed-project.manifest.yaml",
    ]
    has_manifest = any(p.is_file() for p in manifest_paths)
    if not has_manifest:
        findings.append(Finding(
            "MANAGED_PROJECT_MANIFEST_EXACT_PATH_MISSING",
            "FAIL" if require_managed_manifest else "OBSERVED",
            "xiio/managed-project.manifest.{json,yaml}",
            "canonical exact-path manifest not observed; applicability/repair belongs to managed-project owners",
        ))

    if source_files == 0 and not unvalidated_by_suffix:
        findings.append(Finding("NO_SCANNABLE_SOURCE", "UNKNOWN", ".", "no supported source files found"))

    fail_count = sum(1 for f in findings if f.state == "FAIL")
    unknown_count = sum(1 for f in findings if f.state == "UNKNOWN")
    observed_count = sum(1 for f in findings if f.state == "OBSERVED")
    if not repo_subject_bound:
        status = "WAIT_NO_REPO_SUBJECT"
    elif source_files == 0 and not unvalidated_by_suffix:
        status = "WAIT_NO_CODE_SUBJECT"
    elif fail_count:
        status = "FAIL_LOCAL_STATIC"
    elif unknown_count:
        status = "DEGRADED_LOCAL_STATIC"
    else:
        status = "PASS_LOCAL_STATIC"

    return {
        "schema": SCHEMA,
        "root": str(root),
        "axis": "1000s/Y/local-static",
        "status": status,
        "local_static_pass": status == "PASS_LOCAL_STATIC",
        "live_authority": False,
        "closure_100": False,
        "hard_invariants": [
            "LOCAL_PASS != LIVE",
            "ACCOUNTING_100 != CLOSURE_100",
            "REPORT != LOOP_EXIT",
            "RESULT != LOOP_EXIT",
            "WAIT != PASS",
        ],
        "subject": {"repo_bound": repo_subject_bound, "root_markers": repo_markers},
        "managed_manifest": {
            "exact_path_present": has_manifest,
            "required_by_invocation": require_managed_manifest,
        },
        "coverage": {
            "validated_suffixes": sorted(SOURCE_SUFFIXES),
            "unvalidated_code_suffixes_observed": sorted(unvalidated_by_suffix),
        },
        "counts": {
            "source_files": source_files,
            "syntax_checked": syntax_checked,
            "unvalidated_code_files": sum(len(v) for v in unvalidated_by_suffix.values()),
            "fail": fail_count,
            "unknown": unknown_count,
            "observed": observed_count,
        },
        "findings": [asdict(f) for f in sorted(findings, key=lambda f: (f.state, f.code, f.path, f.detail))],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only local static/Y-axis scan")
    parser.add_argument("root", nargs="?", default=".")
    parser.add_argument("--require-managed-manifest", action="store_true")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()
    result = scan(Path(args.root), require_managed_manifest=args.require_managed_manifest)
    json.dump(result, sys.stdout, indent=2 if args.pretty else None, sort_keys=True)
    sys.stdout.write("\n")
    if result["status"] == "PASS_LOCAL_STATIC":
        return 0
    if result["status"] == "FAIL_LOCAL_STATIC":
        return 1
    # WAIT/DEGRADED must not be indistinguishable from PASS to shell/CI callers.
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
