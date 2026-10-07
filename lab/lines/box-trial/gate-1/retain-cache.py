"""Light Docker metadata operations; retain one gate-owned image per remaining repo."""
import pathlib, subprocess, json, time
here = pathlib.Path(__file__).resolve().parent
ids = ['matplotlib__matplotlib-24570', 'scikit-learn__scikit-learn-11578', 'sphinx-doc__sphinx-7454', 'sympy__sympy-12481']
receipt = here / 'cache-retention.json'
records = json.loads(receipt.read_text()) if receipt.exists() else {}
for ident in ids:
    if ident in records:
        continue
    image = 'ghcr.io/epoch-research/swe-bench.eval.x86_64.' + ident + ':latest'
    deadline = time.monotonic() + 7200
    while time.monotonic() < deadline:
        result = subprocess.run(['docker', 'image', 'inspect', image, '--format', '{{.Id}}'], capture_output=True)
        if result.returncode == 0:
            tag = 'lab-gate-1-cache-' + ident + ':temporary'
            tagged = subprocess.run(['docker', 'tag', image, tag], capture_output=True)
            if tagged.returncode == 0:
                records[ident] = {'image_id': result.stdout.decode().strip(), 'tag': tag}
                receipt.write_bytes(json.dumps(records, indent=2).encode())
                print('Retained temporary shared-layer cache: ' + ident, flush=True)
                break
        attempt = here / 'records' / ident / 'attempt.json'
        if attempt.exists():
            print('No retained image for completed attempt: ' + ident, flush=True)
            break
        time.sleep(2)
