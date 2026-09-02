# Brief for an independent cryptographic review of Quo

_For a named reviewer, commissioned before 1.0. The report is published
beside the law, whatever it finds._

## What is being reviewed

Quo is a protocol for proving by whose authority a message was sent. The
whole of what binds an implementation is one text, the constitution, at
<https://github.com/razvangherghina/quo/blob/main/constitution.md>. Five
implementations written from that text, in JavaScript, Go, Python, Rust and
Zig, sit beside it in the same repository with their test suites, and a
conformance suite drives all five through pinned scenarios. The review is
of the **construction as the text fixes it**, with the implementations as
evidence of what the text means where it is ambiguous. Where the text and
an implementation disagree, the text is the defect and the implementation
is the symptom; both are findings.

The suite is fixed and never negotiated: Ed25519 signs, X25519 agrees,
SHA-256 commits, AES-256-GCM encrypts under a key from HKDF-SHA-256. No
message names its algorithms. Changing the suite is a different protocol,
so the review is of this suite and this composition, not of alternatives.

## The construction, as the text states it

A **warden** has a signing pair that is its name, and an X25519 pair, the
**padlock**, that every message to it is sealed with. A **voice** is a
signing pair a warden has granted a **standing** at one of its objects; each
voice has an **heir**, committed in advance as `SHA-256(warden pk || heir
pk)`. Rotation is the heir's key signing a message: the door matches the
signer's hash against the commitment it holds, the standing changes hands,
the old key dies, and the message carries a fresh commitment to the next
heir.

A message on the wire is an ephemeral X25519 public key followed by one
AES-256-GCM box. The key and nonce come from one HKDF-SHA-256 call over the
raw thirty-two-byte X25519 shared secret with an empty salt and the fixed
info `quo-seal`, forty-four bytes drawn: thirty-two of key then twelve of
nonce. The nonce has no randomness of its own because the key is fresh per
message. The tag is sixteen bytes, last in the box. The **additional
authenticated data is the ephemeral public key**, and nothing else is
outside the seal.

Inside the box: one byte naming the record (zero for an ask, one for an
answer), the record in Quo's own canonical notation, and an Ed25519
signature over byte and record as the last sixty-four bytes. An ask names
the signer's public key, the recipient (the door's name or its padlock), an
optional commitment, a per-voice sequence number, the caller's own padlock
and hints for the way back, a leash of time and hops, and the target. An
answer names the answering warden, the sequence number it answers, and data.

The door judges an arriving ask in a fixed order: unseal; verify the
signature with the key the payload carries; check the recipient is this
door; place the signer in its records, where a match against an heir
commitment is a rotation that lands before anything further is judged;
spend the sequence number against a per-voice window; spend the leash;
route; answer sealed to the padlock the ask named. Every failure is the
same silence. Before any Ed25519 verification, a public key that is all
zeros or one of the eight small-order encodings is refused without
examining the signature; an X25519 agreement yielding all zeros is refused
at the agreement.

## The questions

The review is asked to rule on each of these, and to raise anything else it
finds. They are in the order of how much a wrong answer would cost.

1. **The sequence window under restore from backup.** A door keeps, per
   voice, the highest number honoured and which numbers below it are spent,
   and the window's width is the door's own, zero included. A door restored
   from an old backup has rewound its marks and reopened every number spent
   since. The text names this as a real event an operator watches for and
   does nothing else. Is that the right answer? State what an attacker who
   captured messages during the gap can do, whether the damage is bounded
   by the window's width or by the gap's length, and whether the text
   should require anything of persistence rather than leave it to the
   warden. This is now an evidenced failure class rather than a
   hypothetical.
2. **The order of rotation and the sequence check.** The rotation lands at
   the fourth step and the number is judged at the fifth, so a rotation
   refused for its number, its leash or its routing has still taken the
   standing over. The text names this trap and the kits recover from it.
   Assess whether the order is sound: what a captured or replayed rotation
   message can do at each step, whether a refused-later rotation can be
   used to deny a legitimate holder, and whether landing the rotation before
   the number is judged is the right choice or merely the documented one.
3. **The HKDF construction and what the AAD binds.** The shared secret goes
   into HKDF raw, with an empty salt and one fixed info string, and the
   nonce is drawn from the same expansion as the key. The ephemeral public
   key is the only AAD. Rule on the derivation, on the key-and-nonce
   uniqueness argument (which rests entirely on the ephemeral key being
   fresh), and on the binding: the signature inside the box covers neither
   the ephemeral key nor the padlock it was sealed to, and the recipient
   check is on a field inside the payload. State whether a message can be
   re-sealed, redirected, or split from its lid in any way that a door
   cannot detect, and whether the ephemeral key or the recipient's padlock
   belongs under the signature.
4. **Domain separation of what is signed and what is hashed.** The signed
   payload is a leading byte and a canonical record; the commitment is a
   plain SHA-256 over two concatenated keys with no label. Rule on whether
   any signed or hashed bytes in one role can be presented in another, and
   whether the commitment's lack of a domain label matters given that its
   preimage is two public keys.
5. **The small-order pre-check.** Eight encodings are refused before
   verification, in front of whatever Ed25519 verifier the platform
   supplies, so that no two kits disagree about a key that verifies
   anything. Confirm the list is complete for its purpose, state what
   non-canonical encodings the list does not cover and whether a platform
   verifier's differences there can make two kits disagree, and whether the
   X25519 all-zero check is sufficient on the agreement side.
6. **The answer path.** An answer is sealed to the padlock the ask named,
   signed by the answering warden's name, and paired to its ask by the
   padlock, the warden and the sequence number at the caller. Rule on
   whether a door, or anyone on the road, can answer an ask with another
   ask's answer, or answer once and have it accepted twice.

## What is out of scope

- The platform primitives themselves. Ed25519, X25519, SHA-256, AES-GCM and
  HKDF are taken from WebCrypto, Go's standard library, PyCA cryptography,
  the Rust crates each kit names, and Zig's standard library. A break there
  belongs upstream.
- Denial of service by volume against a door. A door's size limit is its
  host's to set.
- Anything that requires the attacker to already hold a voice's secret key
  or the warden's own keys. Key custody is each warden's own by the text's
  Article II, and a separate recipe covers it.
- Delivery: retry, ordering across roads, and what a road does with bytes
  it never opened.

## What is provided

- The constitution, and the papers it cites in the repository.
- The five implementations and their suites, each runnable from its own
  directory with one command stated in the repository README.
- The conformance kit, with the pinned scenarios and the subject contract,
  runnable against any implementation.
- The author, by email, for any question about what the text means. A
  question that the text should have answered is itself a finding.

## What a finding earns

A finding is written as: the passage, the two readings or the attack, and
what it costs. Each confirmed finding earns the constitution a sentence,
named in the commit that adds it. The report is published beside the law
unedited, with the author's responses beside it where he disagrees. A
finding that is a hole in the text rather than in a kit is the more
valuable kind, and the review is asked not to soften those.

## Contact

Razvan Gherghina — <razvan@quo.systems>. Security reports outside this
engagement go by the same address, per the repository's SECURITY.md.
