#!/usr/bin/python3
"""Operator-installed fixed KVM lifecycle broker. M5.2: forwards one hash-bound
job envelope plus artifact to the fresh guest's trusted supervisor over the
dedicated virtio-serial channel and returns its signed result record. The
broker never interprets candidate output and never signs."""
import hashlib
from contextlib import contextmanager
import json
import os
import pathlib
import re
import queue
import socket
import struct
import subprocess
import sys
import threading
import time
import uuid
from xml.sax.saxutils import escape

ROOT = pathlib.Path('/var/lib/private-task')
CONFIG = pathlib.Path('/etc/private-task/runner.json')
PROFILE = 'dedicated-linux-kvm-fresh-vm'
MAX_ARTIFACT = 16777216
MAX_JOB_RECORD = 262144
MAX_RESULT_RECORD = 1048576
CHANNEL = 'org.private-task.control'
HARNESS_IDS = {'pure-module/v1', 'frontend/v1', 'backend-api/v1', 'application-policy/v1', 'composed/v1'}
LIMITS = {'cpus': 2, 'memoryMiB': 512, 'pids': 128, 'seconds': 120, 'logBytes': 1048576, 'writableMiB': 256}

def call(executable, arguments):
    process = subprocess.Popen([executable, *arguments], stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               env={'PATH': '/usr/bin:/bin', 'LANG': 'C'})
    chunks = queue.Queue(maxsize=32)
    stop = threading.Event()
    def consume(stream, is_stdout):
        try:
            while not stop.is_set():
                data = stream.read(4096)
                chunks.put((is_stdout, data), timeout=1)
                if not data:
                    return
        except Exception:
            return
    for stream, is_stdout in [(process.stdout, True), (process.stderr, False)]:
        threading.Thread(target=consume, args=(stream, is_stdout), daemon=True).start()
    output = bytearray()
    size = finished = 0
    deadline = time.monotonic() + 20
    try:
        while finished < 2:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ValueError('fixed_operation_timeout')
            try:
                is_stdout, data = chunks.get(timeout=min(remaining, 1))
            except queue.Empty:
                continue
            if not data:
                finished += 1
            else:
                size += len(data)
                if size > 65536:
                    raise ValueError('fixed_operation_output_limit')
                if is_stdout:
                    output.extend(data)
        if process.wait(timeout=max(0.01, deadline-time.monotonic())):
            raise ValueError('fixed_operation_failed')
        return output.decode('utf8')
    finally:
        stop.set()
        if process.poll() is None:
            process.kill()
            process.wait(timeout=3)
        process.stdout.close()
        process.stderr.close()

def sync_directory(directory):
    descriptor = os.open(str(directory), os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)

def persist(path, value):
    temporary = path.with_name(path.name + '.tmp-' + str(uuid.uuid4()))
    with temporary.open('x') as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    sync_directory(path.parent)

def bounded_json(path):
    if path.is_symlink() or path.stat().st_size > 65536:
        raise ValueError('invalid_operator_file')
    return json.loads(path.read_text())

def identifier(value):
    if not isinstance(value, str) or str(uuid.UUID(value)) != value:
        raise ValueError('invalid_identifier')
    return value

def receipt(request, status):
    return dict(leaseId=request['leaseId'], jobId=request['jobId'],
                baselineDigest=request['baselineDigest'], profile=PROFILE, status=status)

@contextmanager
def lease_lock(path):
    import fcntl
    descriptor = os.open(str(path), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('lease_operation_in_progress')
        yield
    finally:
        os.close(descriptor)

def main():
    if sys.platform != 'linux' or not pathlib.Path('/dev/kvm').exists():
        raise ValueError('dedicated_kvm_required')
    raw = sys.stdin.buffer.read(262145)
    if len(raw) > 262144:
        raise ValueError('request_bounds')
    request = json.loads(raw)
    if not isinstance(request, dict) or request.get('operation') not in ('create', 'destroy', 'run'):
        raise ValueError('unknown_operation')
    lease_id = identifier(request.get('leaseId'))
    if ROOT.is_symlink() or ROOT.resolve() != ROOT:
        raise ValueError('unsafe_managed_root')
    locks = ROOT / 'locks'
    if locks.is_symlink() or locks.resolve() != locks:
        raise ValueError('unsafe_lock_root')
    locks.mkdir(mode=0o700, exist_ok=True)
    with lease_lock(locks / (lease_id + '.lock')):
        return perform(request)

def perform(request):
    if request.get('version') != 1:
        raise ValueError('unsupported_protocol')
    if request.get('operation') == 'run':
        return run(request)
    if set(request) != {'version', 'operation', 'leaseId', 'jobId', 'baselineDigest'} or request['operation'] not in ('create', 'destroy'):
        raise ValueError('unknown_operation')
    lease_id = identifier(request['leaseId'])
    job_id = identifier(request['jobId'])
    if not isinstance(request['baselineDigest'], str) or not re.fullmatch('[a-f0-9]{64}', request['baselineDigest']):
        raise ValueError('invalid_baseline')
    config = bounded_json(CONFIG)
    if set(config) != {'profile', 'dedicatedHostAttested', 'baselinePath', 'baselineDigest'} or config['profile'] != PROFILE or config['dedicatedHostAttested'] is not True or config['baselineDigest'] != request['baselineDigest']:
        raise ValueError('invalid_operator_configuration')
    if ROOT.is_symlink() or ROOT.resolve() != ROOT:
        raise ValueError('unsafe_managed_root')
    leases = ROOT / 'leases'
    if leases.is_symlink() or leases.resolve() != leases:
        raise ValueError('unsafe_lease_root')
    leases.mkdir(mode=0o700, exist_ok=True)
    directory = leases / lease_id
    if directory.is_symlink() or directory.resolve() != directory:
        raise ValueError('unsafe_lease_path')
    name = 'private-task-' + lease_id
    record = directory / 'lease.json'
    overlay = directory / 'overlay.qcow2'
    if request['operation'] == 'create':
        baseline = pathlib.Path(config['baselinePath'])
        if not baseline.is_absolute() or baseline.is_symlink() or baseline.resolve() != baseline or not baseline.is_file() or baseline.stat().st_mode & 0o222:
            raise ValueError('baseline_must_be_read_only')
        digest = hashlib.sha256()
        with baseline.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1048576), b''):
                digest.update(chunk)
        if digest.hexdigest() != config['baselineDigest']:
            raise ValueError('baseline_digest_mismatch')
        # Durable job tombstones prohibit job replay, including after disposal/crash.
        claims = ROOT / 'claims'
        if claims.is_symlink() or claims.resolve() != claims:
            raise ValueError('unsafe_claim_root')
        claims.mkdir(mode=0o700, exist_ok=True)
        with (claims / (job_id + '.claim')).open('x') as stream:
            stream.write(lease_id)
            stream.flush()
            os.fsync(stream.fileno())
        sync_directory(claims)
        directory.mkdir(mode=0o700)
        sync_directory(leases)
        persist(record, receipt(request, 'quarantined'))
        call('/usr/bin/qemu-img', ['create', '-f', 'qcow2', '-F', 'qcow2', '-b', str(baseline), str(overlay)])
        # No candidate or guest management network is granted by this lifecycle module.
        # Sole host<->guest channel: one virtio-serial port, host end is a
        # qemu-bound unix socket inside the lease directory. No NIC, no
        # guest agent, no other channel exists.
        xml = f"""<domain type='kvm'><name>{name}</name><uuid>{lease_id}</uuid>
<memory unit='MiB'>1024</memory><vcpu>2</vcpu><os><type arch='x86_64'>hvm</type><boot dev='hd'/></os>
<features><acpi/><apic/></features><on_poweroff>destroy</on_poweroff><on_reboot>destroy</on_reboot><on_crash>destroy</on_crash>
<devices><emulator>/usr/bin/qemu-system-x86_64</emulator><disk type='file' device='disk'><driver name='qemu' type='qcow2'/><source file='{escape(str(overlay))}'/><target dev='vda' bus='virtio'/></disk><channel type='unix'><source mode='bind' path='{escape(str(directory / 'control.sock'))}'/><target type='virtio' name='{CHANNEL}'/></channel></devices></domain>"""
        domain = directory / 'domain.xml'
        domain.write_text(xml)
        call('/usr/bin/virsh', ['--connect', 'qemu:///system', 'define', str(domain)])
        call('/usr/bin/virsh', ['--connect', 'qemu:///system', 'start', name])
        result = receipt(request, 'fresh')
        persist(record, result)
        return result
    existing = bounded_json(record)
    if any(existing.get(key) != request[key] for key in ('leaseId', 'jobId', 'baselineDigest')):
        raise ValueError('lease_ownership_mismatch')
    if existing.get('status') == 'destroyed':
        return receipt(request, 'destroyed')
    # Tombstone first; any failed cleanup remains quarantined for operator recovery.
    persist(record, receipt(request, 'quarantined'))
    domains = call('/usr/bin/virsh', ['--connect', 'qemu:///system', 'list', '--all', '--name']).splitlines()
    if name in domains:
        running = call('/usr/bin/virsh', ['--connect', 'qemu:///system', 'list', '--name']).splitlines()
        if name in running:
            call('/usr/bin/virsh', ['--connect', 'qemu:///system', 'destroy', name])
        call('/usr/bin/virsh', ['--connect', 'qemu:///system', 'undefine', name])
    for path in (overlay, directory / 'domain.xml', ROOT / 'staging' / (job_id + '.bin')):
        if path.is_symlink() or path.resolve() != path:
            raise ValueError('unsafe_disposal_path')
        if path.exists():
            if not path.is_file():
                raise ValueError('unexpected_disposal_target')
            path.unlink()
    result = receipt(request, 'destroyed')
    persist(record, result)
    return result

def job_binding(job):
    if not isinstance(job, dict) or set(job) != {'protocolVersion', 'jobId', 'attemptId', 'jobKind', 'profile', 'packageHash', 'submissionHash', 'artifactHash', 'imageDigest', 'harnessId', 'harnessDigest', 'requiredCheckIds', 'deadline', 'limits'}:
        raise ValueError('invalid_job')
    if job['protocolVersion'] != 1 or job['profile'] != PROFILE or job['jobKind'] not in ('public', 'private') or job['harnessId'] not in HARNESS_IDS:
        raise ValueError('invalid_job')
    identifier(job['jobId'])
    identifier(job['attemptId'])
    for key in ('packageHash', 'submissionHash', 'artifactHash', 'harnessDigest'):
        if not isinstance(job[key], str) or not re.fullmatch('[a-f0-9]{64}', job[key]):
            raise ValueError('invalid_job')
    if not isinstance(job['imageDigest'], str) or not re.fullmatch('sha256:[a-f0-9]{64}', job['imageDigest']):
        raise ValueError('invalid_job')
    checks = job['requiredCheckIds']
    if not isinstance(checks, list) or not 1 <= len(checks) <= 1024 or len(set(checks)) != len(checks) or any(not isinstance(check, str) or not re.fullmatch('[a-zA-Z0-9_.-]{1,80}', check) for check in checks):
        raise ValueError('invalid_job')
    if not isinstance(job['deadline'], int) or job['deadline'] <= int(time.time() * 1000):
        raise ValueError('invalid_job')
    if job['limits'] != LIMITS:
        raise ValueError('invalid_job')
    return job

def channel_exchange(path, envelope, artifact, deadline_ms):
    control = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        # The domain binds the socket at boot; connect retries absorb the gap
        # between 'virsh start' and qemu creating the channel endpoint.
        remaining = lambda: max(0.001, (deadline_ms - int(time.time() * 1000)) / 1000)
        for _ in range(400):
            try:
                control.connect(str(path))
                break
            except OSError:
                if remaining() <= 0.001:
                    raise ValueError('guest_channel_unavailable')
                time.sleep(0.1)
        else:
            raise ValueError('guest_channel_unavailable')
        control.settimeout(remaining())
        frame = json.dumps(envelope, separators=(',', ':'), sort_keys=True).encode('utf8')
        if len(frame) > MAX_JOB_RECORD:
            raise ValueError('envelope_too_large')
        control.sendall(struct.pack('<I', len(frame)) + frame + artifact)
        head = control.recv(4)
        if len(head) != 4:
            raise ValueError('guest_result_truncated')
        length = struct.unpack('<I', head)[0]
        if length == 0 or length > MAX_RESULT_RECORD:
            raise ValueError('guest_result_bounds')
        payload = bytearray()
        while len(payload) < length:
            chunk = control.recv(min(65536, length - len(payload)))
            if not chunk:
                raise ValueError('guest_result_truncated')
            payload.extend(chunk)
        return json.loads(bytes(payload))
    finally:
        control.close()

def run(request):
    if set(request) != {'version', 'operation', 'leaseId', 'job'}:
        raise ValueError('unknown_operation')
    lease_id = identifier(request['leaseId'])
    job = job_binding(request['job'])
    config = bounded_json(CONFIG)
    if set(config) != {'profile', 'dedicatedHostAttested', 'baselinePath', 'baselineDigest'} or config['profile'] != PROFILE or config['dedicatedHostAttested'] is not True:
        raise ValueError('invalid_operator_configuration')
    leases = ROOT / 'leases'
    directory = leases / lease_id
    if directory.is_symlink() or directory.resolve() != directory:
        raise ValueError('unsafe_lease_path')
    record = directory / 'lease.json'
    existing = bounded_json(record)
    if existing.get('leaseId') != lease_id or existing.get('jobId') != job['jobId'] or existing.get('baselineDigest') != config['baselineDigest'] or existing.get('status') != 'fresh':
        raise ValueError('lease_ownership_mismatch')
    staged = ROOT / 'staging' / (job['jobId'] + '.bin')
    if staged.is_symlink() or staged.resolve() != staged or not staged.is_file() or staged.stat().st_size > MAX_ARTIFACT:
        raise ValueError('invalid_artifact')
    artifact = staged.read_bytes()
    if hashlib.sha256(artifact).hexdigest() != job['artifactHash']:
        raise ValueError('artifact_mismatch')
    # The fresh guest booted at create; its supervisor is already waiting on
    # the virtio-serial port. A missing domain means the guest is gone.
    running = call('/usr/bin/virsh', ['--connect', 'qemu:///system', 'list', '--name']).splitlines()
    if 'private-task-' + lease_id not in running:
        raise ValueError('guest_not_running')
    persist(record, dict(leaseId=lease_id, jobId=job['jobId'], baselineDigest=config['baselineDigest'], profile=PROFILE, status='executed'))
    envelope = {'artifactBytes': len(artifact), 'artifactHash': job['artifactHash'], 'deadline': job['deadline'], 'job': job, 'leaseId': lease_id}
    try:
        record_out = channel_exchange(directory / 'control.sock', envelope, artifact, min(job['deadline'], int(time.time() * 1000) + job['limits']['seconds'] * 1000 + 30000))
        valid = isinstance(record_out, dict) and 'result' in record_out and isinstance(record_out.get('signature'), str) and re.fullmatch('[A-Za-z0-9_-]{86}', record_out['signature'])
    except Exception:
        record_out = None
        valid = False
    if not valid:
        persist(record, dict(leaseId=lease_id, jobId=job['jobId'], baselineDigest=config['baselineDigest'], profile=PROFILE, status='quarantined'))
        raise ValueError('guest_result_invalid')
    # Unsigned supervisor observations are retained as host-side forensics
    # only; they never ride inside the signed result.
    observations = record_out.get('observations')
    if observations is not None:
        persist(directory / 'result-observations.json', observations)
    return {'result': record_out['result'], 'signature': record_out['signature']}

if __name__ == '__main__':
    try:
        print(json.dumps(main()))
    except Exception:
        print(json.dumps({'error': 'runner_operation_unverified'}))
        sys.exit(2)
