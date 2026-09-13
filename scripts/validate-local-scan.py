#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

SCANNER = Path(__file__).with_name("local_scan.py")


def invoke(root: Path, *args: str) -> tuple[int, dict]:
    p = subprocess.run([sys.executable, str(SCANNER), str(root), *args], capture_output=True, text=True, check=False)
    return p.returncode, json.loads(p.stdout)


def write(path: Path, text: str, *, encoding: str = "utf-8") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding=encoding)


def make_repo(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    (path / ".git").mkdir(exist_ok=True)


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)

        # WAIT must be visible in both JSON and process status; WAIT != PASS.
        empty = base / "empty"
        empty.mkdir()
        rc, out = invoke(empty)
        assert rc == 2
        assert out["status"] == "WAIT_NO_REPO_SUBJECT"
        assert not out["local_static_pass"]
        assert not out["live_authority"]

        archive = base / "archive"
        archive.mkdir()
        write(archive / "orphan.py", "x = 1\n")
        rc, out = invoke(archive)
        assert rc == 2
        assert out["status"] == "WAIT_NO_REPO_SUBJECT"
        assert out["local_static_pass"] is False
        assert any(f["code"] == "REPO_SUBJECT_UNBOUND" for f in out["findings"])

        good = base / "good"
        good.mkdir()
        write(good / "app.py", "x = 1\n")
        write(good / "package.json", '{"exports":{"./app":"./app.mjs"}}\n')
        write(good / "app.mjs", "export const x = 1;\n")
        write(good / "xiio/managed-project.manifest.json", '{"project_id":"fixture"}\n')
        rc, out = invoke(good, "--require-managed-manifest")
        assert rc == 0, out
        assert out["status"] == "PASS_LOCAL_STATIC", out
        assert out["counts"]["fail"] == 0
        assert out["closure_100"] is False

        pybad = base / "pybad"
        make_repo(pybad)
        write(pybad / "bad.py", "def broken(:\n")
        rc, out = invoke(pybad)
        assert rc == 1
        assert out["status"] == "FAIL_LOCAL_STATIC"
        assert any(f["code"] == "SYNTAX_ERROR" for f in out["findings"])

        # PEP 263 encoding cookies are valid Python and must not false-fail.
        latin = base / "latin"
        make_repo(latin)
        latin_source = "# -*- coding: latin-1 -*-\nname = 'caf\xe9'\n".encode("latin-1")
        (latin / "latin.py").write_bytes(latin_source)
        rc, out = invoke(latin)
        assert rc == 0, out
        assert out["status"] == "PASS_LOCAL_STATIC", out

        jsonbad = base / "jsonbad"
        make_repo(jsonbad)
        write(jsonbad / "bad.json", "{nope}\n")
        rc, out = invoke(jsonbad)
        assert rc == 1
        assert any(f["code"] == "SYNTAX_ERROR" for f in out["findings"])

        expbad = base / "expbad"
        make_repo(expbad)
        write(expbad / "package.json", '{"exports":{"./missing":"./src/missing.mjs"}}\n')
        write(expbad / "ok.mjs", "export {};\n")
        rc, out = invoke(expbad)
        assert rc == 1
        assert any(f["code"] == "PACKAGE_EXPORT_TARGET_MISSING" for f in out["findings"])

        # Root shorthand exports must not bypass target validation.
        rootexp = base / "rootexp"
        make_repo(rootexp)
        write(rootexp / "package.json", '{"exports":"./dist/missing.mjs"}\n')
        write(rootexp / "ok.mjs", "export {};\n")
        rc, out = invoke(rootexp)
        assert rc == 1
        assert any(f["code"] == "PACKAGE_EXPORT_TARGET_MISSING" for f in out["findings"])

        # Wildcard exports are pattern-aware, not literal '*' path checks.
        wildcard = base / "wildcard"
        make_repo(wildcard)
        write(wildcard / "package.json", '{"exports":{"./features/*":"./src/features/*.mjs"}}\n')
        write(wildcard / "src/features/one.mjs", "export const one = 1;\n")
        rc, out = invoke(wildcard)
        assert rc == 0, out
        assert out["status"] == "PASS_LOCAL_STATIC", out

        manifest = base / "manifest"
        make_repo(manifest)
        write(manifest / "app.py", "x=1\n")
        rc, out = invoke(manifest, "--require-managed-manifest")
        assert rc == 1
        assert any(f["code"] == "MANAGED_PROJECT_MANIFEST_EXACT_PATH_MISSING" and f["state"] == "FAIL" for f in out["findings"])

        # Directory symlink escapes must be seen even with followlinks=False.
        symlink_repo = base / "symlink"
        make_repo(symlink_repo)
        write(symlink_repo / "ok.py", "x=1\n")
        outside = base / "outside"
        outside.mkdir()
        os.symlink(outside, symlink_repo / "src-link", target_is_directory=True)
        rc, out = invoke(symlink_repo)
        assert rc == 1, out
        assert any(f["code"] == "SYMLINK_ESCAPES_ROOT" and f["path"] == "src-link" for f in out["findings"])

        # Common code families that lack a qualified parser cannot silently inherit PASS.
        tsrepo = base / "tsrepo"
        make_repo(tsrepo)
        write(tsrepo / "package.json", '{}\n')
        write(tsrepo / "src/app.ts", "const x: number = 1;\n")
        rc, out = invoke(tsrepo)
        assert rc == 2, out
        assert out["status"] == "DEGRADED_LOCAL_STATIC"
        assert any(f["code"] == "SOURCE_FAMILY_UNVALIDATED" for f in out["findings"])

        if subprocess.run(["which", "node"], capture_output=True).returncode == 0:
            jsbad = base / "jsbad"
            make_repo(jsbad)
            write(jsbad / "bad.mjs", "export const = ;\n")
            rc, out = invoke(jsbad)
            assert rc == 1
            assert any(f["code"] == "SYNTAX_ERROR" for f in out["findings"])

    print("local static scan hostiles: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
