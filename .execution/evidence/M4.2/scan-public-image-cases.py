import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile

root = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('scanner', Path(__file__).with_name('scan-public-image.py'))
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)
directory = Path(tempfile.mkdtemp(prefix='public-image-scanner-test-', dir=root / '.runtime')).resolve()
assert directory.parent == (root / '.runtime').resolve()

def tar_bytes(files):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w') as archive:
        for path, data in files:
            info = tarfile.TarInfo(path)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
    return output.getvalue()

def fixture(label, files, compressed=True):
    layers = [tar_bytes(entries) for entries in files]
    encoded = [gzip.compress(layer, mtime=0) if compressed else layer for layer in layers]
    sha = lambda data: 'sha256:' + hashlib.sha256(data).hexdigest()
    config = json.dumps({'architecture':'amd64','os':'linux','rootfs':{'diff_ids':[sha(layer) for layer in layers]}}).encode()
    image = json.dumps({'schemaVersion':2,'config':{'digest':sha(config)},'layers':[{'digest':sha(layer)} for layer in encoded]}).encode()
    index = json.dumps({'schemaVersion':2,'manifests':[{'digest':sha(image),'platform':{'architecture':'amd64','os':'linux'}}]}).encode()
    name = lambda digest: 'blobs/sha256/' + digest[7:]
    manifest = json.dumps([{'Config':name(sha(config)),'Layers':[name(sha(layer)) for layer in encoded]}]).encode()
    data = tar_bytes([('manifest.json',manifest), (name(sha(config)),config), (name(sha(image)),image), (name(sha(index)),index)] + [(name(sha(layer)),layer) for layer in encoded])
    path = directory / (label + '.tar')
    path.write_bytes(data)
    return path, sha(index)

for compressed in [True, False]:
    path, image = fixture('clean-' + str(compressed), [[('opt/toolchain/public.txt', b'public tooling only')]], compressed)
    report = scanner.scan_archive(path, image)
    assert report['violations'] == []
    assert report['filesScanned'] == 1
path, image = fixture('historical-canary', [[('opt/toolchain/removed.txt', b'SYNTHETIC_PRIVATE_SCORING_CANARY_M0')], [('opt/toolchain/.wh.removed.txt', b'')]])
assert any(item['kind'] == 'private_canary' for item in scanner.scan_archive(path, image)['violations'])
path, image = fixture('chunk-boundary', [[('opt/toolchain/payload', b'a' * (1048576 - 10) + b'SYNTHETIC_PRIVATE_ELIGIBILITY_CANARY_M0')]])
assert any(item['kind'] == 'private_canary' for item in scanner.scan_archive(path, image)['violations'])
for number, path_name in enumerate(['workspace/services/private-api/src/main.ts', 'workspace/examples/private-shop/fixture.json', 'workspace/.execution/state.json', 'work/.env', 'work/.git/config']):
    path, image = fixture('private-path-' + str(number), [[(path_name, b'no executable contents')]])
    assert any(item['kind'] == 'private_path' for item in scanner.scan_archive(path, image)['violations'])
path, image = fixture('digest-forgery', [[('opt/toolchain/public.txt', b'public')]])
try:
    scanner.scan_archive(path, 'sha256:' + 'f' * 64)
    raise AssertionError('forged image digest accepted')
except KeyError:
    pass
print(json.dumps({'assurance':'tested','cleanCompressedAndRawLayers':True,'historicalCanaryDetected':True,'chunkBoundaryCanaryDetected':True,'privatePathsDetected':5,'forgedImageRejected':True,'extractionPerformed':False,'fixtureDirectory':str(directory)}))
