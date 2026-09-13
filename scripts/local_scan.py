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
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

SCHEMA = "xiio.sdk.local-static-scan/v1"
IGNORED_DIRS = {
    ".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build",
    "coverage", ".next", ".nuxt", ".cache", ".venv", "venv", "__pycache__",
}
SOURCE_SUFFIXES = {".py", ".js", ".mjs", ".cjs", ".json", ".sh", ".bash"}
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


def iter_files(root: Path) -> Iterable[Path]:
    for current, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in IGNORED_DIRS)
        base = Path(current)
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
            ast.parse(path.read_text(encoding="utf-8"), filename=rel)
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
    if not isinstance(exports, dict):
        return findings
    for key, value in sorted(exports.items()):
        targets: list[str] = []
        if isinstance(value, str):
            targets = [value]
        elif isinstance(value, dict):
            targets = [v for v in value.values() if isinstance(v, str)]
        for target in targets:
            if not target.startswith("./"):
                continue
            target_path = root / target[2:]
            if not target_path.exists():
                findings.append(Finding(
                    "PACKAGE_EXPORT_TARGET_MISSING", "FAIL", "package.json",
                    f"export {key!r} points to missing {target!r}",
                ))
    return findings


def scan(root: Path, require_managed_manifest: bool = False) -> dict:
    root = root.resolve()
    findings: list[Finding] = []
    source_files = 0
    syntax_checked = 0

    if not root.exists() or not root.is_dir():
        return {
            "schema": SCHEMA,
            "root": str(root),
            "axis": "1000s/Y/local-static",
            "status": "WAIT_NO_CODE_SUBJECT",
            "local_static_pass": False,
            "live_authority": False,
            "closure_100": False,
            "counts": {"source_files": 0, "syntax_checked": 0, "fail": 0, "unknown": 0},
            "findings": [asdict(Finding("ROOT_NOT_DIRECTORY", "UNKNOWN", ".", "scan root is missing or not a directory"))],
        }

    repo_markers = sorted(name for name in REPO_MARKERS if (root / name).exists())
    repo_subject_bound = bool(repo_markers)
    if not repo_subject_bound:
        findings.append(Finding(
            "REPO_SUBJECT_UNBOUND", "UNKNOWN", ".",
            "directory has no recognized repository/project root marker; syntax observations cannot establish a repo baseline",
        ))

    for path in iter_files(root):
        symlink_finding = check_symlink(path, root)
        if symlink_finding:
            findings.append(symlink_finding)
        if path.suffix.lower() in SOURCE_SUFFIXES:
            source_files += 1
            finding = check_syntax(path, root)
            if finding:
                findings.append(finding)
            else:
                syntax_checked += 1

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

    if source_files == 0:
        findings.append(Finding("NO_SCANNABLE_SOURCE", "UNKNOWN", ".", "no supported source files found"))

    fail_count = sum(1 for f in findings if f.state == "FAIL")
    unknown_count = sum(1 for f in findings if f.state == "UNKNOWN")
    observed_count = sum(1 for f in findings if f.state == "OBSERVED")
    if not repo_subject_bound:
        status = "WAIT_NO_REPO_SUBJECT"
    elif source_files == 0:
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
        ],
        "subject": {"repo_bound": repo_subject_bound, "root_markers": repo_markers},
        "managed_manifest": {
            "exact_path_present": has_manifest,
            "required_by_invocation": require_managed_manifest,
        },
        "counts": {
            "source_files": source_files,
            "syntax_checked": syntax_checked,
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
    return 1 if result["status"] == "FAIL_LOCAL_STATIC" else 0


if __name__ == "__main__":
    raise SystemExit(main())
