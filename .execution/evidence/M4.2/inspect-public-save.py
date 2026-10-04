import json
import tarfile
import sys
with tarfile.open(sys.argv[1]) as archive:
    names = archive.getnames()
    manifest = json.load(archive.extractfile('manifest.json'))
    index = json.load(archive.extractfile('index.json')) if 'index.json' in names else None
    print(json.dumps({'manifest':manifest, 'index':index, 'small_json_blobs':{name:json.loads(archive.extractfile(name).read()) for name in names if name.startswith('blobs/sha256/') and archive.getmember(name).size<65536 and archive.extractfile(name).read(1)==b'{'}}))
