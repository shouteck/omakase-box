#!/usr/bin/env python3
# BT12 demo rig — the terminal a fresh agent drives. One real pseudo-terminal
# (pywinpty on this host; a POSIX pty elsewhere) running a shell inside the
# demo's clean clone with the demo's own environment. A driver talks to it
# over a small TCP control surface with two verbs and nothing more:
#
#   {"verb": "read"}                      -> {"screen": "<screen as text>"}
#   {"verb": "type", "keys": "ls -l\n"}   -> {"ok": true}
#
# Everything the terminal shows is rendered by the tiny emulator below into
# the same grid a glass terminal would show — what `read` returns is what a
# person leaning over the screen would see. Every verb and the screen that
# prompted it is appended to <run>/actions.jsonl (the action log the wave
# keeps); raw bytes go to <run>/pty-raw.log.
#
#   python pty_host.py --cwd <folder> --run <folder> [--cols 100] [--rows 30]
#       [--shell <program>] [--env-file <json>] [--port-file <name>]
#
# The port the host listens on is written to <run>/port. Nothing else prints.
import argparse, json, os, re, socketserver, sys, threading
from pathlib import Path

COLS, ROWS = 100, 30

class Screen:
    """The smallest terminal a shell session needs: a fixed grid, a cursor,
    scrolling, and the CSI sequences a shell actually emits (positions,
    erases, insert/delete char). SGR is parsed and dropped — `read` is text,
    not ink."""
    def __init__(self, cols=COLS, rows=ROWS):
        self.cols, self.rows = cols, rows
        self.grid = [[' '] * cols for _ in range(rows)]
        self.x = self.y = 0
        self.saved = (0, 0)

    def _scroll(self, n=1):
        for _ in range(n):
            self.grid.pop(0)
            self.grid.append([' '] * self.cols)
        self.y = self.rows - 1

    def feed(self, data):
        i = 0
        while i < len(data):
            ch = data[i]
            if ch == '\x1b':
                if i + 1 < len(data) and data[i + 1] == '[':
                    m = re.match(r'\x1b\[([0-9;?]*)((?:[!$" ]*)([@-~]))', data[i:])
                    if m:
                        i += len(m.group(0))
                        params = m.group(1).lstrip('?')
                        parts = params.split(';') if params else []
                        self._csi(parts[0] if parts else '', parts[1] if len(parts) > 1 else '', m.group(3))
                        continue
                    i += 1
                    continue
                if i + 1 < len(data) and data[i + 1] == ']':
                    j = i + 2
                    while j < len(data) and not (data[j] == '\x07' or (data[j] == '\\' and j > i and data[j - 1] == '\x1b')):
                        j += 1
                    i = j + 1
                    continue
                i += 2 if i + 1 < len(data) and data[i + 1] in '()#=>78' else 1
                continue
            if ch == '\x07':
                i += 1; continue
            if ch == '\r':
                self.x = 0; i += 1; continue
            if ch in '\n\x0b\x0c':
                self.y += 1
                if self.y >= self.rows: self._scroll()
                i += 1; continue
            if ch == '\x08':
                self.x = max(0, self.x - 1); i += 1; continue
            if ch == '\t':
                self.x = min(self.cols - 1, (self.x // 8 + 1) * 8); i += 1; continue
            if ord(ch) < 0x20 or ch == '\x7f':
                i += 1; continue
            if self.x >= self.cols:
                self.x = 0; self.y += 1
                if self.y >= self.rows: self._scroll()
            self.grid[self.y][self.x] = ch
            self.x += 1
            i += 1

    def _csi(self, a, b, final):
        n = lambda v, d=1: int(v) if v else d
        if final in 'mhlrq':
            return
        if final in 'Hf':
            self.y = min(self.rows - 1, max(0, n(a) - 1)); self.x = min(self.cols - 1, max(0, n(b) - 1))
        elif final == 'A': self.y = max(0, self.y - n(a))
        elif final == 'B': self.y = min(self.rows - 1, self.y + n(a))
        elif final == 'C': self.x = min(self.cols - 1, self.x + n(a))
        elif final == 'D': self.x = max(0, self.x - n(a))
        elif final == 'E': self.y = min(self.rows - 1, self.y + n(a)); self.x = 0
        elif final == 'F': self.y = max(0, self.y - n(a)); self.x = 0
        elif final == 'G': self.x = min(self.cols - 1, max(0, n(a) - 1))
        elif final == 'd': self.y = min(self.rows - 1, max(0, n(a) - 1))
        elif final == 's': self.saved = (self.y, self.x)
        elif final == 'u': self.y, self.x = self.saved
        elif final == 'J':
            mode = n(a, 0)
            if mode >= 2:
                self.grid = [[' '] * self.cols for _ in range(self.rows)]
            elif mode == 0:
                for x in range(self.x, self.cols): self.grid[self.y][x] = ' '
                for y in range(self.y + 1, self.rows): self.grid[y] = [' '] * self.cols
            elif mode == 1:
                for y in range(0, self.y): self.grid[y] = [' '] * self.cols
                for x in range(0, self.x + 1): self.grid[self.y][x] = ' '
        elif final == 'K':
            mode = n(a, 0)
            if mode == 0:
                for x in range(self.x, self.cols): self.grid[self.y][x] = ' '
            elif mode == 1:
                for x in range(0, self.x + 1): self.grid[self.y][x] = ' '
            elif mode == 2:
                self.grid[self.y] = [' '] * self.cols
        elif final == 'P':
            for x in range(self.x, self.cols - n(a)): self.grid[self.y][x] = self.grid[self.y][x + n(a)]
            for x in range(self.cols - n(a), self.cols): self.grid[self.y][x] = ' '
        elif final == '@':
            for x in range(self.cols - 1, self.x + n(a) - 1, -1): self.grid[self.y][x] = self.grid[self.y][x - n(a)]
            for x in range(self.x, min(self.cols, self.x + n(a))): self.grid[self.y][x] = ' '
        elif final == 'X':
            for x in range(self.x, min(self.cols, self.x + n(a))): self.grid[self.y][x] = ' '

    def text(self):
        lines = [''.join(row).rstrip() for row in self.grid]
        while lines and lines[-1] == '':
            lines.pop()
        return '\n'.join(lines)


def start_pty(cwd, shell_args, env):
    if os.name == 'nt':
        from winpty import PtyProcess
        return PtyProcess.spawn(shell_args, cwd=cwd, dimensions=(ROWS, COLS), env=env)
    import pty, subprocess
    master, slave = pty.openpty()
    proc = subprocess.Popen(shell_args, cwd=cwd, env=env, stdin=slave, stdout=slave, stderr=slave, close_fds=True)
    os.close(slave)
    class Posix:
        def read(self, n=65536):
            return os.read(master, n).decode('utf-8', 'replace')
        def write(self, s):
            os.write(master, s.encode('utf-8'))
        def isalive(self):
            return proc.poll() is None
    return Posix()


def main():
    global COLS, ROWS
    ap = argparse.ArgumentParser()
    ap.add_argument('--cwd', required=True)
    ap.add_argument('--run', required=True)
    ap.add_argument('--cols', type=int, default=COLS)
    ap.add_argument('--rows', type=int, default=ROWS)
    ap.add_argument('--shell', default=None)
    ap.add_argument('--env-file', default=None)
    ap.add_argument('--port-file', default='port')
    args = ap.parse_args()
    run = Path(args.run); run.mkdir(parents=True, exist_ok=True)
    COLS, ROWS = args.cols, args.rows

    # --env-file gives the demo its clean environment: "set" replaces the
    # whole inherited environment; "keep" names inherited keys to carry
    # (PATH for the machine's own Node/Git is passed explicitly by the rig,
    # never as the host's whole PATH).
    if args.env_file:
        spec = json.loads(Path(args.env_file).read_text(encoding='utf-8'))
        env = dict(spec.get('set', {}))
        for key in spec.get('keep', []):
            if key in os.environ: env[key] = os.environ[key]
    else:
        env = dict(os.environ)

    shell = args.shell or (os.environ.get('COMSPEC', 'cmd.exe') if os.name == 'nt' else '/bin/bash -i')
    shell_args = shell if isinstance(shell, list) else shell.split(' ') if ' -i' in shell else [shell]
    pty = start_pty(args.cwd, shell_args, env)
    screen = Screen(COLS, ROWS)
    actions = open(run / 'actions.jsonl', 'a', buffering=1, encoding='utf-8')
    raw = open(run / 'pty-raw.log', 'ab', buffering=0)
    lock = threading.Lock()
    alive = [True]

    def pump():
        try:
            while True:
                data = pty.read(65536)
                if data in ('', None): break
                raw.write(data.encode('utf-8', 'replace'))
                with lock:
                    screen.feed(data)
        except Exception:
            pass
        alive[0] = False
    threading.Thread(target=pump, daemon=True).start()

    def record(verb, detail, screen_text):
        actions.write(json.dumps({'verb': verb, 'detail': detail, 'screen': screen_text}, ensure_ascii=False) + '\n')

    class Handler(socketserver.StreamRequestHandler):
        def handle(self):
            for raw_line in self.rfile:
                try:
                    call = json.loads(raw_line.decode('utf-8'))
                except Exception:
                    self.wfile.write(json.dumps({'error': 'not json'}).encode() + b'\n'); continue
                verb = call.get('verb')
                if verb == 'read':
                    with lock:
                        text = screen.text()
                    record('read', None, text)
                    self.wfile.write(json.dumps({'screen': text, 'alive': alive[0]}).encode() + b'\n')
                elif verb == 'type':
                    keys = call.get('keys', '')
                    try:
                        pty.write(keys)
                        with lock:
                            text = screen.text()
                        record('type', keys, text)
                        self.wfile.write(json.dumps({'ok': True}).encode() + b'\n')
                    except Exception as error:
                        self.wfile.write(json.dumps({'error': str(error)}).encode() + b'\n')
                elif verb == 'status':
                    self.wfile.write(json.dumps({'alive': alive[0]}).encode() + b'\n')
                else:
                    self.wfile.write(json.dumps({'error': 'the control surface has two verbs: read and type'}).encode() + b'\n')

    server = socketserver.ThreadingTCPServer(('127.0.0.1', 0), Handler)
    server.daemon_threads = True
    (run / args.port_file).write_text(str(server.server_address[1]))
    try:
        server.serve_forever()
    finally:
        actions.close(); raw.close()


if __name__ == '__main__':
    main()
