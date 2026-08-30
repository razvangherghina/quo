# Security

Quo is a protocol for proving authority, and the kits here do real
cryptography. If you find a way to defeat either, tell the author before you
tell anyone else.

## Reporting

Email **<info@factcurier.ro>** with what you found and how to reproduce it. You
will get an acknowledgement within three working days.

Please do not open a public issue for anything that lets a message be forged,
read, replayed or attributed to the wrong voice.

## What is in scope

- **The constitution** — a passage whose two honest readings produce two
  implementations that cannot speak, or that let a warden accept what it should
  refuse. A silence in the law is a real finding here, not a documentation bug.
- **The kits** — a failure of a guarantee the constitution names: a forged
  signature accepted, a seal opened by the wrong recipient, standing spent twice
  or surviving its own release, a refusal that leaks which lock it was.

## What is not

- Denial of service by volume against a door. A door's size limit is the host's
  to set, and exhausting a host is not a protocol failure.
- Anything requiring the attacker to already hold the voice's private keys.
- Weaknesses in the platform primitives themselves — the arithmetic is
  WebCrypto and Go's standard library, and a break there belongs upstream.

## Pre-1.0

Nothing here carries a compatibility promise before 1.0.0. A finding that
requires the law to move will move it, and the kits follow.
