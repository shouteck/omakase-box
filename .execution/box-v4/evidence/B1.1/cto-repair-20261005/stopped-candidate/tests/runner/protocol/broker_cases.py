"""Injected lifecycle tests: no KVM, virsh, qemu-img or candidate code executes."""
import hashlib
import importlib.util
import io
import json
import pathlib
import tempfile
import types
import unittest
import uuid
from unittest.mock import patch
from contextlib import nullcontext

spec = importlib.util.spec_from_file_location('broker', 'infra/runner/broker.py')
broker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(broker)

class BrokerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='private-task-broker-')
        self.root = pathlib.Path(self.temporary.name).resolve()
        self.baseline = self.root / 'baseline.qcow2'
        self.baseline.write_bytes(b'synthetic baseline bytes')
        self.baseline.chmod(0o444)
        self.digest = hashlib.sha256(self.baseline.read_bytes()).hexdigest()
        self.config = self.root / 'config.json'
        self.config.write_text(json.dumps(dict(profile=broker.PROFILE, dedicatedHostAttested=True, baselinePath=str(self.baseline), baselineDigest=self.digest)))
        self.request = dict(version=1, operation='create', leaseId=str(uuid.uuid4()), jobId=str(uuid.uuid4()), baselineDigest=self.digest)
        self.commands = []
        self.domains = []
        self.running = []
        self.failure = None
        (self.root / 'staging').mkdir()

    def tearDown(self):
        self.baseline.chmod(0o666)
        self.temporary.cleanup()

    def execute(self, request):
        original_exists = pathlib.Path.exists
        def exists(path):
            return True if path.as_posix() == '/dev/kvm' else original_exists(path)
        with patch.object(broker, 'ROOT', self.root), patch.object(broker, 'CONFIG', self.config), patch.object(broker.sys, 'platform', 'linux'), patch.object(broker.sys, 'stdin', types.SimpleNamespace(buffer=io.BytesIO(json.dumps(request).encode()))), patch.object(pathlib.Path, 'exists', exists), patch.object(broker, 'call', self.fixed_call), patch.object(broker, 'sync_directory'), patch.object(broker, 'lease_lock', return_value=nullcontext()):
            return broker.main()

    def fixed_call(self, executable, arguments):
        self.commands.append((executable, arguments))
        if self.failure and self.failure in arguments:
            raise ValueError('synthetic operation failure')
        if executable == '/usr/bin/qemu-img':
            pathlib.Path(arguments[-1]).write_bytes(b'synthetic overlay')
        elif arguments[-3:] == ['list', '--all', '--name']:
            return '\n'.join(self.domains)
        elif arguments[-2:] == ['list', '--name']:
            return '\n'.join(self.running)
        elif 'define' in arguments:
            self.domains.append('private-task-' + self.request['leaseId'])
        elif 'start' in arguments:
            self.running.append(arguments[-1])
        elif 'destroy' in arguments:
            self.running.remove(arguments[-1])
        elif 'undefine' in arguments:
            self.domains.remove(arguments[-1])
        return ''

    def test_fixed_create_and_exact_disposal(self):
        receipt = self.execute(self.request)
        self.assertEqual(receipt['status'], 'fresh')
        directory = self.root / 'leases' / self.request['leaseId']
        self.assertEqual(self.commands[0], ('/usr/bin/qemu-img', ['create', '-f', 'qcow2', '-F', 'qcow2', '-b', str(self.baseline), str(directory / 'overlay.qcow2')]))
        xml = (directory / 'domain.xml').read_text()
        self.assertNotIn('<interface', xml)
        unrelated = self.root / 'staging' / 'unrelated.bin'
        unrelated.write_bytes(b'preserve')
        staged = self.root / 'staging' / (self.request['jobId'] + '.bin')
        staged.write_bytes(b'approved artifact')
        self.assertEqual(self.execute({**self.request, 'operation': 'destroy'})['status'], 'destroyed')
        self.assertFalse((directory / 'overlay.qcow2').exists())
        self.assertFalse(staged.exists())
        self.assertEqual(unrelated.read_bytes(), b'preserve')
        self.assertTrue((self.root / 'claims' / (self.request['jobId'] + '.claim')).exists())
        self.assertEqual(self.execute({**self.request, 'operation': 'destroy'})['status'], 'destroyed')

    def test_owner_mismatch_cannot_destroy_other_job(self):
        self.execute(self.request)
        before = len(self.commands)
        with self.assertRaisesRegex(ValueError, 'lease_ownership_mismatch'):
            self.execute({**self.request, 'operation': 'destroy', 'jobId': str(uuid.uuid4())})
        self.assertEqual(len(self.commands), before)
        self.assertTrue((self.root / 'leases' / self.request['leaseId'] / 'overlay.qcow2').exists())

    def test_baseline_modified_or_writable_denied(self):
        self.baseline.chmod(0o666)
        with self.assertRaisesRegex(ValueError, 'read_only'):
            self.execute(self.request)
        self.baseline.write_bytes(b'modified bytes')
        self.baseline.chmod(0o444)
        with self.assertRaisesRegex(ValueError, 'digest_mismatch'):
            self.execute(self.request)
        self.assertEqual(self.commands, [])

    def test_failed_create_is_quarantined_and_job_never_replayed(self):
        self.failure = 'start'
        with self.assertRaises(ValueError):
            self.execute(self.request)
        record = self.root / 'leases' / self.request['leaseId'] / 'lease.json'
        self.assertEqual(json.loads(record.read_text())['status'], 'quarantined')
        with self.assertRaises(FileExistsError):
            self.execute({**self.request, 'leaseId': str(uuid.uuid4())})
        self.failure = None
        self.assertEqual(self.execute({**self.request, 'operation': 'destroy'})['status'], 'destroyed')

    def test_failed_disposal_remains_quarantined(self):
        self.execute(self.request)
        self.failure = 'destroy'
        with self.assertRaises(ValueError):
            self.execute({**self.request, 'operation': 'destroy'})
        record = self.root / 'leases' / self.request['leaseId'] / 'lease.json'
        self.assertEqual(json.loads(record.read_text())['status'], 'quarantined')

    def test_invalid_command_path_and_symlink_refused(self):
        for request in [{**self.request, 'command': 'evil'}, {**self.request, 'leaseId': '../outside'}, {**self.request, 'operation': 'run', 'job': {'command': 'evil'}}]:
            with self.assertRaises((ValueError, AttributeError)):
                self.execute(request)
        original = pathlib.Path.is_symlink
        with patch.object(pathlib.Path, 'is_symlink', lambda path: True if path == self.root / 'leases' else original(path)):
            with self.assertRaisesRegex(ValueError, 'unsafe_lease_root'):
                self.execute(self.request)
        self.assertEqual(self.commands, [])

    def test_subprocess_uses_no_shell_fixed_environment_and_timeout(self):
        process = types.SimpleNamespace(stdout=io.BytesIO(b'ok'), stderr=io.BytesIO(), wait=lambda timeout: 0, poll=lambda: 0)
        with patch.object(broker.subprocess, 'Popen', return_value=process) as run:
            self.assertEqual(broker.call('/usr/bin/virsh', ['--connect', 'qemu:///system', 'list']), 'ok')
            args, kwargs = run.call_args
            self.assertEqual(args[0], ['/usr/bin/virsh', '--connect', 'qemu:///system', 'list'])
            self.assertNotIn('shell', kwargs)
            self.assertEqual(kwargs['env'], {'PATH': '/usr/bin:/bin', 'LANG': 'C'})

    def test_streaming_output_limit_kills_operation(self):
        from unittest.mock import Mock
        process = types.SimpleNamespace(stdout=io.BytesIO(b'x'*70000), stderr=io.BytesIO(), wait=lambda timeout: 0, poll=lambda: None, kill=Mock())
        with patch.object(broker.subprocess, 'Popen', return_value=process):
            with self.assertRaisesRegex(ValueError, 'output_limit'):
                broker.call('/usr/bin/virsh', ['list'])
        process.kill.assert_called_once()

    def test_atomic_receipt_interruption_preserves_previous_receipt(self):
        path = self.root / 'receipt.json'
        path.write_text('{"status":"quarantined"}')
        with patch.object(broker.os, 'replace', side_effect=OSError('synthetic crash')):
            with self.assertRaises(OSError):
                broker.persist(path, {'status': 'fresh'})
        self.assertEqual(json.loads(path.read_text())['status'], 'quarantined')

    def test_lease_lock_is_nonblocking_and_releases_descriptor(self):
        from unittest.mock import Mock
        fake = types.SimpleNamespace(LOCK_EX=2, LOCK_NB=4, flock=Mock(side_effect=BlockingIOError()))
        with patch.dict('sys.modules', {'fcntl':fake}), patch.object(broker.os,'open',return_value=7), patch.object(broker.os,'close') as close, patch.object(broker.os,'O_NOFOLLOW',131072,create=True):
            with self.assertRaisesRegex(ValueError,'in_progress'):
                with broker.lease_lock(self.root / 'lease.lock'):
                    self.fail('Concurrent disposal must not run.')
            fake.flock.assert_called_once_with(7,6)
            close.assert_called_once_with(7)

    # M5.2 'run' operation: strict request, lease/artifact binding, fixed
    # channel exchange, signed-record pass-through, quarantine on fault.
    def job(self):
        import time as clock
        return dict(protocolVersion=1, jobId=self.request['jobId'], attemptId=str(uuid.uuid4()), jobKind='public',
                    profile=broker.PROFILE, packageHash='a'*64, submissionHash='b'*64, artifactHash=hashlib.sha256(self.artifact).hexdigest(),
                    imageDigest='sha256:'+'d'*64, harnessId='pure-module/v1', harnessDigest='e'*64,
                    requiredCheckIds=['rank.order'], deadline=int(clock.time()*1000)+120000,
                    limits=dict(cpus=2, memoryMiB=512, pids=128, seconds=120, logBytes=1048576, writableMiB=256))

    artifact = b'{"files":{"index.mjs":"eA=="}}'
    result_record = {'result': {'protocolVersion': 1, 'outcome': 'passed'}, 'signature': 'A'*86}

    def run_request(self, **over):
        request = dict(version=1, operation='run', leaseId=self.request['leaseId'], job=self.job())
        request.update(over)
        return request

    def staged(self):
        staged = self.root / 'staging' / (self.request['jobId'] + '.bin')
        staged.write_bytes(self.artifact)
        return staged

    def test_run_rejects_noncanonical_requests(self):
        self.execute(self.request)
        for request in [
            self.run_request(extra='x'),
            {k: v for k, v in self.run_request().items() if k != 'job'},
            self.run_request(job={**self.job(), 'command': 'evil'}),
            self.run_request(job={**self.job(), 'jobId': '../escape'}),
            self.run_request(job={**self.job(), 'limits': {**self.job()['limits'], 'memoryMiB': 1024}}),
            self.run_request(job={**self.job(), 'deadline': 1}),
            self.run_request(job={**self.job(), 'profile': 'host-docker'}),
        ]:
            with self.assertRaises(ValueError):
                self.execute(request)

    def test_run_requires_fresh_lease_and_exact_artifact(self):
        self.execute(self.request)
        with self.assertRaisesRegex(ValueError, 'invalid_artifact'):
            self.execute(self.run_request())
        self.staged().write_bytes(b'wrong bytes')
        with self.assertRaisesRegex(ValueError, 'artifact_mismatch'):
            self.execute(self.run_request())
        self.staged()
        self.running.clear()
        with self.assertRaisesRegex(ValueError, 'guest_not_running'):
            self.execute(self.run_request())

    def test_run_exchanges_envelope_and_returns_only_the_signed_pair(self):
        self.execute(self.request)
        self.staged()
        seen = {}
        def exchange(path, envelope, artifact, deadline_ms):
            seen['path'] = pathlib.Path(str(path))
            seen['envelope'] = envelope
            seen['artifact'] = artifact
            return {**self.result_record, 'observations': {'containment': {'timedOut': False}}}
        with patch.object(broker, 'channel_exchange', exchange):
            out = self.execute(self.run_request())
        self.assertEqual(out, self.result_record)
        self.assertEqual(seen['envelope']['job']['jobId'], self.request['jobId'])
        self.assertEqual(seen['envelope']['leaseId'], self.request['leaseId'])
        self.assertEqual(set(seen['envelope']), {'artifactBytes', 'artifactHash', 'deadline', 'job', 'leaseId'})
        self.assertEqual(seen['envelope']['artifactBytes'], len(self.artifact))
        self.assertEqual(seen['artifact'], self.artifact)
        self.assertEqual(json.loads((self.root / 'leases' / self.request['leaseId'] / 'result-observations.json').read_text()), {'containment': {'timedOut': False}})
        self.assertEqual(json.loads((self.root / 'leases' / self.request['leaseId'] / 'lease.json').read_text())['status'], 'executed')

    def test_run_fault_quarantines_and_run_on_executed_lease_denied(self):
        self.execute(self.request)
        self.staged()
        with patch.object(broker, 'channel_exchange', side_effect=ValueError('guest_channel_unavailable')):
            with self.assertRaisesRegex(ValueError, 'guest_result_invalid'):
                self.execute(self.run_request())
        self.assertEqual(json.loads((self.root / 'leases' / self.request['leaseId'] / 'lease.json').read_text())['status'], 'quarantined')
        with self.assertRaisesRegex(ValueError, 'lease_ownership_mismatch'):
            self.execute(self.run_request())

    def test_run_rejects_lease_not_fresh_or_other_job(self):
        self.execute(self.request)
        self.staged()
        record = self.root / 'leases' / self.request['leaseId'] / 'lease.json'
        record.write_text(json.dumps({**json.loads(record.read_text()), 'status': 'destroyed'}))
        with self.assertRaisesRegex(ValueError, 'lease_ownership_mismatch'):
            self.execute(self.run_request())
        record.write_text(json.dumps({**json.loads(record.read_text()), 'status': 'fresh', 'jobId': str(uuid.uuid4())}))
        with self.assertRaisesRegex(ValueError, 'lease_ownership_mismatch'):
            self.execute(self.run_request())

if __name__ == '__main__':
    unittest.main(verbosity=2)
