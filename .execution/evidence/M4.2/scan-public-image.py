import gzip
import hashlib
import json
import re
import sys
import tarfile

CANARIES = [b'SYNTHETIC_PRIVATE_SCORING_CANARY_M0', b'SYNTHETIC_PRIVATE_ELIGIBILITY_CANARY_M0']
PRIVATE_PATH = re.compile(r'(^|/)(services/private-api|services/external-api|examples/private-shop|\.execution|\.env|\.git)(/|$)', re.I)

class DigestReader:
    def __init__(self, stream):
        self.stream = stream
        self.digest = hashlib.sha256()
    def read(self, size=-1):
        data = self.stream.read(size)
        self.digest.update(data)
        return data


def scan_archive(path, expected_image):
    layers = []
    violations = []
    files = 0
    scanned_bytes = 0
    with tarfile.open(path, 'r:*') as archive:
        manifest = json.load(archive.extractfile('manifest.json'))
        if len(manifest) != 1:
            raise ValueError('image_manifest_count')
        def descriptor(digest):
            if not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
                raise ValueError('image_descriptor_syntax')
            data = archive.extractfile('blobs/sha256/' + digest[7:]).read()
            if 'sha256:' + hashlib.sha256(data).hexdigest() != digest:
                raise ValueError('image_descriptor_digest')
            return json.loads(data)
        image = descriptor(expected_image)
        if 'manifests' in image:
            candidates = [entry for entry in image['manifests'] if entry.get('platform', {}).get('architecture') == 'amd64' and entry.get('platform', {}).get('os') == 'linux']
            if len(candidates) != 1:
                raise ValueError('image_platform_count')
            image = descriptor(candidates[0]['digest'])
        config_bytes = archive.extractfile(manifest[0]['Config']).read()
        configuration_digest = 'sha256:' + hashlib.sha256(config_bytes).hexdigest()
        if configuration_digest != image['config']['digest']:
            raise ValueError('image_configuration_digest')
        config = json.loads(config_bytes)
        if ['blobs/sha256/' + entry['digest'][7:] for entry in image['layers']] != manifest[0]['Layers']:
            raise ValueError('image_layer_manifest_binding')
        expected_layers = config['rootfs']['diff_ids']
        if len(expected_layers) != len(manifest[0]['Layers']):
            raise ValueError('image_layer_count')
        for number, name in enumerate(manifest[0]['Layers']):
            stream = archive.extractfile(name)
            compressed = hashlib.sha256()
            while True:
                part = stream.read(1048576)
                if not part:
                    break
                compressed.update(part)
            if 'sha256:' + compressed.hexdigest() != image['layers'][number]['digest']:
                raise ValueError('image_compressed_layer_digest')
            stream.seek(0)
            head = stream.read(2)
            stream.seek(0)
            decoded = gzip.GzipFile(fileobj=stream) if head == b'\x1f\x8b' else stream
            digest = DigestReader(decoded)
            with tarfile.open(fileobj=digest, mode='r|') as layer:
                for item in layer:
                    if PRIVATE_PATH.search(item.name) or PRIVATE_PATH.search(item.linkname):
                        violations.append({'layer': number, 'kind': 'private_path', 'path': item.name[:256]})
                    if not item.isfile():
                        continue
                    files += 1
                    source = layer.extractfile(item)
                    tail = b''
                    remaining = item.size
                    while remaining:
                        data = source.read(min(1048576, remaining))
                        if not data:
                            raise ValueError('truncated_image_file')
                        scanned_bytes += len(data)
                        remaining -= len(data)
                        if any(canary in tail + data for canary in CANARIES):
                            violations.append({'layer': number, 'kind': 'private_canary', 'path': item.name[:256]})
                        tail = data[-128:]
            while digest.read(1048576):
                pass
            sha = 'sha256:' + digest.digest.hexdigest()
            if sha != expected_layers[number]:
                raise ValueError('image_layer_digest')
            layers.append(sha)
    return {'assurance': 'bounded', 'imageDigest': expected_image, 'configurationDigest': configuration_digest, 'layerDigests': layers, 'filesScanned': files, 'bytesScanned': scanned_bytes, 'violations': violations, 'scope': 'Every saved layer path and regular-file payload; known synthetic private canaries. Public upstream image provenance remains a vendor trust assumption, not semantic confidentiality or VM proof.'}

if __name__ == '__main__':
    report = scan_archive(sys.argv[1], sys.argv[2])
    print(json.dumps(report))
    sys.exit(1 if report['violations'] else 0)
