"""Native-client protocol checks; mocked socket, never drives Resolve."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('native_actions',Path(__file__).parents[1]/'scripts/gprime-actions.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Transport:
    def __init__(self,body):self.body=body;self.sent=[];self.calls=0
    def __enter__(self):return self
    def __exit__(self,*_):pass
    def settimeout(self,value):pass
    def connect(self,path):self.calls+=1
    def sendall(self,data):self.sent.append(json.loads(data))
    def recv(self,n):value=self.body[:n];self.body=self.body[n:];return value

class NativeIPC(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.directory=Path(self.temp.name)
        self.socket=self.directory/'test.sock';self.socket.touch(mode=0o600)
        self.endpoint=self.directory/'endpoint.json'
        self.endpoint.write_text(json.dumps({'schema':1,'bundleID':'com.vidarandersen.ghettoscopez','socket':str(self.socket),'token':'test-token'}));self.endpoint.chmod(0o600)
    def tearDown(self):self.temp.cleanup()
    def call(self,action,transport):
        with patch.object(module.stat,'S_ISSOCK',return_value=True),patch.object(module.socket,'socket',return_value=transport):
            return module.native_request(action,self.directory)
    def test_fixed_action_token_and_result_no_shell(self):
        transport=Transport(b'{"ok":true,"result":{"transport":"native-ax"}}\n')
        self.assertEqual(self.call('next',transport),{'transport':'native-ax'})
        self.assertEqual(transport.sent,[{'action':'next','token':'test-token'}]);self.assertEqual(transport.calls,1)
    def test_denied_action_is_visible_and_never_retried(self):
        transport=Transport(b'{"ok":false,"error":"Allow Galaxy Scopez"}\n')
        with self.assertRaisesRegex(ValueError,'Allow Galaxy Scopez'):self.call('fullscreen',transport)
        self.assertEqual(transport.calls,1)
    def test_public_or_symlink_endpoint_is_rejected_before_connect(self):
        transport=Transport(b'')
        self.endpoint.chmod(0o644)
        with self.assertRaisesRegex(ValueError,'private'):self.call('next',transport)
        self.assertEqual(transport.calls,0)
    def test_unknown_action_and_external_socket_are_rejected(self):
        transport=Transport(b'')
        with self.assertRaisesRegex(ValueError,'Unknown'):self.call('execute-script',transport)
        description=json.loads(self.endpoint.read_text());description['socket']='/tmp/not-the-gs-app.sock';self.endpoint.write_text(json.dumps(description))
        with self.assertRaisesRegex(ValueError,'Invalid native'):self.call('next',transport)
        self.assertEqual(transport.calls,0)
    def test_truncated_response_does_not_repeat_command(self):
        transport=Transport(b'{"ok":true')
        with self.assertRaisesRegex(ValueError,'closed'):self.call('next',transport)
        self.assertEqual(transport.calls,1)

if __name__=='__main__':unittest.main()
