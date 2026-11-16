import collections
import json
import pathlib
import subprocess
import sys


def inspect(directory):
    # Force the workspace crate to be checked when target artifacts span worktrees.
    (pathlib.Path(directory) / "src-tauri/src/lib.rs").touch()
    result = subprocess.run(
        ['cargo', 'clippy', '--locked', '--manifest-path', 'src-tauri/Cargo.toml',
         '--all-targets', '--all-features', '--message-format=json'],
        cwd=directory, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    pathlib.Path(f'/tmp/{pathlib.Path(directory).name}-clippy.jsonl').write_text(result.stdout)
    if result.returncode:
        print(result.stdout[-10000:])
        print(result.stderr[-10000:])
        raise SystemExit(result.returncode)
    diagnostics = collections.Counter()
    for line in result.stdout.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if item.get('reason') != 'compiler-message':
            continue
        message = item['message']
        if message['level'] not in ('warning', 'error'):
            continue
        primary = next((span['file_name'] for span in message['spans'] if span['is_primary']), '')
        code = (message.get('code') or {}).get('code', '')
        diagnostics[(primary, code, message['message'], message['level'])] += 1
    return diagnostics


feature, baseline = sys.argv[1:]
previous = inspect(baseline)
current = inspect(feature)
new = current - previous
for issue, count in new.items():
    print(f'NEW ({count}): {issue}')
print(f'Clippy: upstream={previous.total()}, feature={current.total()}, new={new.total()}')
raise SystemExit(bool(new))
