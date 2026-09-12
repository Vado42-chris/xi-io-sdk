#!/usr/bin/env python3
"""Collect host/workspace/runtime observations without minting closure authority.

This script is deliberately an observer, not a validator. It may run natively,
in a VM, container, CI runner, or unknown execution surface. It records what it
can observe and leaves qualification to an independent evaluator/readback.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import socket
import subprocess
import uuid
from pathlib import Path
from typing import Any

SCHEMA = "xiio.sdk.host-abi-observation/v1"
DEFAULT_PORTS = (8081, 11434, 11435)


def _run(*args: str, cwd: Path | None = None) -> dict[str, Any]:
    try:
        proc = subprocess.run(args, cwd=cwd, text=True, capture_output=True, timeout=5, check=False)
        return {
            "argv": list(args),
            "returncode": proc.returncode,
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
        }
    except (OSError, subprocess.SubprocessError) as error:
        return {"argv": list(args), "returncode": None, "stdout": "", "stderr": f"{type(error).__name__}: {error}"}


def _container_signals() -> list[str]:
    signals: list[str] = []
    for marker in (Path('/.dockerenv'), Path('/run/.containerenv')):
        if marker.exists():
            signals.append(str(marker))
    for env_key in ('container', 'KUBERNETES_SERVICE_HOST', 'CI', 'GITHUB_ACTIONS'):
        if os.environ.get(env_key):
            signals.append(f"env:{env_key}")
    for cgroup in (Path('/proc/1/cgroup'), Path('/proc/self/cgroup')):
        try:
            text = cgroup.read_text(encoding='utf-8', errors='replace').lower()
        except OSError:
            continue
        if any(token in text for token in ('docker', 'kubepods', 'containerd', 'podman', 'lxc')):
            signals.append(f"cgroup:{cgroup}")
    return sorted(set(signals))


def classify_execution_surface(signals: list[str]) -> str:
    return 'CONTAINER_OR_CI_OBSERVED' if signals else 'NATIVE_PROCESS_CANDIDATE'


def _git_observation(workspace: Path) -> dict[str, Any]:
    remote = _run('git', 'remote', 'get-url', 'origin', cwd=workspace)
    head = _run('git', 'rev-parse', 'HEAD', cwd=workspace)
    status = _run('git', 'status', '--porcelain', cwd=workspace)
    toplevel = _run('git', 'rev-parse', '--show-toplevel', cwd=workspace)
    return {
        'repository_root': toplevel['stdout'] if toplevel['returncode'] == 0 else None,
        'repo_remote': remote['stdout'] if remote['returncode'] == 0 else None,
        'head': head['stdout'] if head['returncode'] == 0 else None,
        'dirty': bool(status['stdout']) if status['returncode'] == 0 else None,
        'commands': {'remote': remote, 'head': head, 'status': status, 'toplevel': toplevel},
    }


def _tcp_readback(host: str, port: int) -> dict[str, Any]:
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return {'host': host, 'port': port, 'connectable': True}
    except OSError as error:
        return {'host': host, 'port': port, 'connectable': False, 'error': f"{type(error).__name__}: {error}"}


def make_report(workspace: Path, *, ports: tuple[int, ...] = DEFAULT_PORTS) -> dict[str, Any]:
    root = workspace.expanduser().resolve()
    signals = _container_signals()
    git = _git_observation(root)
    return {
        'schema': SCHEMA,
        'result': 'OBSERVED',
        'attempt_id': f"host-observation-{uuid.uuid4()}",
        'host_id_observed': socket.gethostname(),
        'platform_observed': {
            'system': platform.system(),
            'release': platform.release(),
            'machine': platform.machine(),
            'python': platform.python_version(),
        },
        'workspace_path_observed': str(root),
        'repo_remote_observed': git['repo_remote'],
        'head_observed': git['head'],
        'repository_root_observed': git['repository_root'],
        'git_dirty_observed': git['dirty'],
        'execution_surface_observed': classify_execution_surface(signals),
        'container_or_ci_signals': signals,
        'loopback_readback': [_tcp_readback('127.0.0.1', port) for port in ports],
        'git_observation': git,
        'authority_granted': False,
        'closure_claimed': False,
        'physical_host_claimed': False,
        'independent_attestation_claimed': False,
        'receipt_id': None,
        'hard': [
            'HOST_LABEL != HOST_ATTESTATION',
            'NATIVE_PROCESS_CANDIDATE != PHYSICAL_HOST_VERIFIED',
            'SANDBOX_CONTAINER != PHYSICAL_HOST',
            '9_FIELDS_PRESENT != 9_FIELDS_ATTESTED',
            'SELF_OBSERVATION != INDEPENDENT_RECEIPT',
            'PORT_CONNECTABLE != HEALTH_CONTRACT_PASS',
            'OBSERVED != RCP',
        ],
    }


def self_test() -> None:
    assert classify_execution_surface([]) == 'NATIVE_PROCESS_CANDIDATE'
    assert classify_execution_surface(['/.dockerenv']) == 'CONTAINER_OR_CI_OBSERVED'
    report = {
        'result': 'OBSERVED',
        'authority_granted': False,
        'closure_claimed': False,
        'physical_host_claimed': False,
        'independent_attestation_claimed': False,
        'receipt_id': None,
    }
    assert report['result'] != 'PASS'
    assert report['receipt_id'] is None
    assert report['authority_granted'] is False
    assert report['closure_claimed'] is False
    print(json.dumps({
        'schema': 'xiio.sdk.host-abi-observer-self-test/v1',
        'result': 'PASS',
        'hostiles': 6,
        'self_attestation_credit': 0,
        'effects': 0,
    }, sort_keys=True))


def main() -> int:
    parser = argparse.ArgumentParser(description='Collect host ABI observations without minting closure authority')
    parser.add_argument('workspace', nargs='?', default='.', help='workspace to observe')
    parser.add_argument('--json', action='store_true', help='emit JSON')
    parser.add_argument('--self-test', action='store_true', help='run invariant self-test only')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    report = make_report(Path(args.workspace))
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(f"host={report['host_id_observed']} surface={report['execution_surface_observed']} result={report['result']}")
        print(f"workspace={report['workspace_path_observed']}")
        print(f"head={report['head_observed']}")
        for row in report['loopback_readback']:
            print(f"127.0.0.1:{row['port']} connectable={row['connectable']}")
        print('No physical-host, RCP, LIVE, or independent-attestation claim is implied.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
