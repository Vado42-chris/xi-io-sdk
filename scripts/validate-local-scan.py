#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

SCANNER = Path(__file__).with_name("local_scan.py")


def invoke(root: Path, *args: str) -> tuple[int, dict]:
    p = subprocess.run([sys.executable, str(SCANNER), str(root), *args], capture_output=True, text=True, check=False)
    return p.returncode, json.loads(p.stdout)


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)

        empty = base / "empty"
        empty.mkdir()
        rc, out = invoke(empty)
        assert rc == 0
        assert out["status"] == "WAIT_NO_REPO_SUBJECT"
        assert not out["local_static_pass"]
        assert not out["live_authority"]

        archive = base / "archive"
        archive.mkdir()
        write(archive / "orphan.py", "x = 1\n")
        rc, out = invoke(archive)
        assert rc == 0
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
        pybad.mkdir()
        (pybad / ".git").mkdir()
        write(pybad / "bad.py", "def broken(:\n")
        rc, out = invoke(pybad)
        assert rc == 1
        assert out["status"] == "FAIL_LOCAL_STATIC"
        assert any(f["code"] == "SYNTAX_ERROR" for f in out["findings"])

        jsonbad = base / "jsonbad"
        jsonbad.mkdir()
        (jsonbad / ".git").mkdir()
        write(jsonbad / "bad.json", "{nope}\n")
        rc, out = invoke(jsonbad)
        assert rc == 1
        assert any(f["code"] == "SYNTAX_ERROR" for f in out["findings"])

        expbad = base / "expbad"
        expbad.mkdir()
        (expbad / ".git").mkdir()
        write(expbad / "package.json", '{"exports":{"./missing":"./src/missing.mjs"}}\n')
        write(expbad / "ok.mjs", "export {};\n")
        rc, out = invoke(expbad)
        assert rc == 1
        assert any(f["code"] == "PACKAGE_EXPORT_TARGET_MISSING" for f in out["findings"])

        manifest = base / "manifest"
        manifest.mkdir()
        (manifest / ".git").mkdir()
        write(manifest / "app.py", "x=1\n")
        rc, out = invoke(manifest, "--require-managed-manifest")
        assert rc == 1
        assert any(f["code"] == "MANAGED_PROJECT_MANIFEST_EXACT_PATH_MISSING" and f["state"] == "FAIL" for f in out["findings"])

        if subprocess.run(["which", "node"], capture_output=True).returncode == 0:
            jsbad = base / "jsbad"
            jsbad.mkdir()
            (jsbad / ".git").mkdir()
            write(jsbad / "bad.mjs", "export const = ;\n")
            rc, out = invoke(jsbad)
            assert rc == 1
            assert any(f["code"] == "SYNTAX_ERROR" for f in out["findings"])

    print("local static scan hostiles: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
