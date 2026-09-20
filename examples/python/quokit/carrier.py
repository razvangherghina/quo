"""Quo over TCP: the frames, a listener, and a dialer."""

import os
import socket
import struct
import threading

ASK, REPLY, NOTHING = 0, 1, 2
LARGEST = 1048645


class NotAFrame(Exception):
    pass


def frame(kind, fid, rest=b""):
    body = bytes([kind]) + struct.pack(">I", fid) + rest
    return struct.pack(">I", len(body)) + body


def _exactly(sock, n):
    out = bytearray()
    while len(out) < n:
        chunk = sock.recv(n - len(out))
        if not chunk:
            return None
        out += chunk
    return bytes(out)


def read_frame(sock):
    """(kind, id, rest), or None when the stream closes; NotAFrame on bytes that are no frame."""
    head = _exactly(sock, 4)
    if head is None:
        return None
    length = struct.unpack(">I", head)[0]
    if length > LARGEST or length < 5:
        raise NotAFrame()
    body = _exactly(sock, length)
    if body is None:
        return None
    kind, fid, rest = body[0], struct.unpack(">I", body[1:5])[0], body[5:]
    if kind > NOTHING:
        raise NotAFrame()
    if kind == ASK and len(rest) < 64:
        raise NotAFrame()
    if kind == NOTHING and rest:
        raise NotAFrame()
    return kind, fid, rest


def _close(sock):
    try:
        sock.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass
    sock.close()


class Listener:
    """Answers asks for the wards `door(pk)` finds. `door(pk)` returns a
    function from a box to a reply box or None, or None for no such ward."""

    def __init__(self, door, log):
        self.door, self.log = door, log
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.bind(("127.0.0.1", 0))
        self.sock.listen(64)
        host, port = self.sock.getsockname()
        self.at = "tcp://%s:%d" % (host, port)
        threading.Thread(target=self._accept, daemon=True).start()

    def _accept(self):
        while True:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                return
            threading.Thread(target=self._serve, args=(conn,), daemon=True).start()

    def _serve(self, conn):
        wlock = threading.Lock()
        try:
            while True:
                f = read_frame(conn)
                if f is None:
                    break
                kind, fid, rest = f
                if kind != ASK:
                    continue
                threading.Thread(target=self._answer, args=(conn, wlock, fid, rest), daemon=True).start()
        except NotAFrame:
            self.log("listener: not a frame, closing")
        except OSError:
            pass
        _close(conn)

    def _answer(self, conn, wlock, fid, rest):
        arrive = self.door(rest[:64].hex())
        reply = arrive(rest[64:]) if arrive is not None else None
        out = frame(NOTHING, fid) if reply is None else frame(REPLY, fid, reply)
        try:
            with wlock:
                conn.sendall(out)
        except OSError:
            pass


def dial(at, ward_pk, box, wait):
    """Carry one ask to a tcp Address. Returns the reply box, or None for nothing."""
    fid = struct.unpack(">I", os.urandom(4))[0]
    try:
        sock = socket.create_connection((at.host, at.port), timeout=wait)
    except (OSError, ValueError):
        return None
    try:
        sock.settimeout(wait)
        sock.sendall(frame(ASK, fid, ward_pk + box))
        while True:
            f = read_frame(sock)
            if f is None:
                return None
            kind, got, rest = f
            if kind == ASK or got != fid:
                continue
            return rest if kind == REPLY else None
    except (OSError, NotAFrame):
        return None
    finally:
        _close(sock)
