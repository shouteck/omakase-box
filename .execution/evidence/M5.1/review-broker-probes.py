import importlib.util
import io
import json
import time
import types
import unittest
from unittest.mock import Mock, patch
spec=importlib.util.spec_from_file_location('reviewed_broker','infra/runner/broker.py')
broker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(broker)
class QuietStream(io.BytesIO):
    def __init__(self,value):
        super().__init__(value)
        self.first=True
    def read(self,size=-1):
        if self.first:
            self.first=False
            time.sleep(1.2)
        return super().read(size)
class IndependentBrokerChecks(unittest.TestCase):
    def test_quiet_fixed_operation_survives_one_second_without_output(self):
        process=types.SimpleNamespace(stdout=QuietStream(b'ok'),stderr=QuietStream(b''),wait=lambda timeout:0,poll=lambda:0,kill=Mock())
        with patch.object(broker.subprocess,'Popen',return_value=process):
            started=time.monotonic()
            self.assertEqual(broker.call('/usr/bin/virsh',['list']),'ok')
            self.assertGreaterEqual(time.monotonic()-started,1.1)
        process.kill.assert_not_called()
    def test_deadline_kills_operation_without_treating_stdout_as_success(self):
        process=types.SimpleNamespace(stdout=io.BytesIO(),stderr=io.BytesIO(),wait=lambda timeout:0,poll=lambda:None,kill=Mock())
        with patch.object(broker.subprocess,'Popen',return_value=process),patch.object(broker.time,'monotonic',side_effect=[0,21]):
            with self.assertRaisesRegex(ValueError,'timeout'):
                broker.call('/usr/bin/virsh',['list'])
        process.kill.assert_called_once()
    def test_stdout_and_stderr_combined_budget_is_enforced(self):
        process=types.SimpleNamespace(stdout=io.BytesIO(b'a'*40000),stderr=io.BytesIO(b'b'*40000),wait=lambda timeout:0,poll=lambda:None,kill=Mock())
        with patch.object(broker.subprocess,'Popen',return_value=process):
            with self.assertRaisesRegex(ValueError,'output_limit'):
                broker.call('/usr/bin/virsh',['list'])
        process.kill.assert_called_once()
    def test_nonzero_exit_never_becomes_success(self):
        process=types.SimpleNamespace(stdout=io.BytesIO(b'passed'),stderr=io.BytesIO(),wait=lambda timeout:7,poll=lambda:7,kill=Mock())
        with patch.object(broker.subprocess,'Popen',return_value=process):
            with self.assertRaisesRegex(ValueError,'failed'):
                broker.call('/usr/bin/virsh',['list'])
if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(IndependentBrokerChecks))
    print(json.dumps(dict(assurance='tested' if result.wasSuccessful() else 'unverified',scope='independent injected broker streaming quiet/deadline/output/exit probes',reviewer='/root/contracts_review',testsRun=result.testsRun,actualKvm=False,actualCandidateExecution=False)))
    raise SystemExit(0 if result.wasSuccessful() else 1)
