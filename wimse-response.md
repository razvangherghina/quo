# On draft-reece-wimse-cross-org-delegation-00: R3 and R7 are jointly satisfiable, and here is what it costs

_A response to the WIMSE working group, for <wimse@ietf.org>. Razvan Gherghina,
author of the Quo protocol. Not a proposal to adopt anything._

Section 4 of the draft closes on this sentence: no widely deployed mechanism
today lets a relying party in one organization verify, locally and without
a callback, a recursively attenuated delegation chain that originated in
another organization, while supporting cross-domain revocation. I want to
offer the working group one data point on the requirements themselves,
from a protocol that was built without reference to this draft and that
happens to satisfy some of its requirements exactly and to refuse others
deliberately. The value of the data point is not the protocol. It is that
it shows where the nine requirements pull against each other, and what has
to be given up to make three of them hold at once.

## The claim

**R3 and R7 are jointly satisfiable with no residual staleness at all, and
R4 with them.** The construction is running code in five languages
(JavaScript, Go, Python, Rust, Zig), each written from one published text
and none from another's source, driven through one conformance suite that pins both the
bytes on the wire and the resulting authorization state, and published
under Apache-2.0 at <https://github.com/razvangherghina/quo>. Anyone may run
it against their own implementation.

The construction is simple to state. Every party runs a **warden**: one
door, one keypair that is its name, one encryption key every message to it
is sealed with. Authority is a **standing**: a row in the warden's own
record saying that a particular signing key may reach a particular object
behind that door. A standing is created by the door that will judge it,
never by anyone else, and it is handed to the holder as a keypair, not as a
token. Every message arriving at the door is signed by the holder's key,
sealed to the door's encryption key, and carries a per-key sequence number
that only rises. The door judges each message against its own record,
locally, and answers or is silent.

Against the requirements:

- **R3 (no runtime callback).** The relying party is the door, and the
  door's record is the only authorization material there is. There is no
  originating organization to call back to, because the door that judges is
  the one that granted. There is no cached trust or revocation material,
  because there is nothing to cache: the record is local by construction.
- **R7 (authentic, bounded-staleness revocation).** Revocation is the door
  editing its own record. The next message on that standing meets silence.
  Staleness is zero at the door that matters, and authenticity is not a
  question, because no revocation information travels anywhere to be
  authenticated. The draft's fail-safe bound is never reached because there
  is no information that can age.
- **R4 (proof of possession).** Every message is a signature by the
  holder's own key over a payload that names the door, and the sequence
  number spends it once. A captured message is not replayable and a relayed
  one is not usable by another key.
- **R1 (recursive attenuation), by construction rather than by
  verification.** The draft asks that a relying party verify, from conveyed
  authority alone, that no hop exceeds its predecessor. In this design no
  authority is conveyed along a chain. When A calls B and B calls C on A's
  behalf, C judges B's own standing at C's door, and nothing of A's reaches
  C. A hop cannot exceed its predecessor because a hop carries nothing but
  itself. What does travel along the chain is a **leash**: a time budget and
  a hop count that every door reduces before handing onward and that no door
  may widen; a door judges the leash on what arrived, and the budget is a
  running balance spent by each door's own measured dwell, not a ceiling set
  at delegation time. That is R1's aim met at zero verification cost, and
  it is a narrower thing than R1's letter, which I want the working group to
  see clearly rather than take on trust.

## The price

The same construction refuses four requirements, and it refuses them for
the same reason it satisfies the three above. I list them because a
requirements document is more useful when it knows which of its
requirements are in tension.

- **R2 (verification without a bilateral agreement).** A standing is a
  bilateral grant, nothing else. There are no trust anchors, no
  organizational roots, and no way for a door to accept authority it did not
  itself grant. A stranger holding only a door's public name and address is
  judged as a stranger and sees only what the door shows strangers. R2 as
  written presumes that authority can originate under one anchor and be
  verified under another; this design has no anchors.
- **R5 (principal binding along the chain).** Each hop acts as itself. The
  on-behalf-of principal is not conveyed, so no relying party can verify it
  was not altered, because it was never sent. If a working group wants R5,
  it wants conveyed authority, and then R3 and R7 return to tension.
- **R6 (dual-axis authorization).** Follows from R5's absence. A door judges
  the caller's standing and nothing about a principal behind it.
- **R8 (composable audit).** The design has no third party that sees the
  relation, and it makes that a feature: the record of who may reach whom
  lives only at the two ends. An end-to-end account of provenance across
  organizations is exactly the register this design was built to make
  unnecessary. Each door can keep its own log; nothing composes them, and
  nothing is meant to.

On **R9**, the common carriage is one HTTP POST of a sealed body to a
published URL, with nothing in headers, paths or status codes carrying
meaning, so it rides over what workloads already run; it does not express
itself in existing token formats, and I do not think it can.

## What I think this says about the draft

R3 and R7, taken together, ask for a relying party that decides locally and
learns of revocation without staleness. For any mechanism that conveys
authority away from its issuer, those two are a trade: the further the
authority travels from the party that can withdraw it, the staler the
relying party's view must be, and the bound in R7 is the size of that
trade. The tension disappears when the party that judges is the party that
granted. But that identity is precisely what R2, R5 and R8 forbid, since
each of them requires authority to be meaningful somewhere other than where
it was issued.

So the nine requirements contain, I believe, two mutually exclusive
designs. One conveys authority and accepts bounded staleness; the draft's
Section 4 correctly observes that nobody has shipped its cross-domain,
recursive form. The other keeps authority at its issuer, gets R3, R4 and R7
for free, and gives up R2, R5, R6 and R8. The draft would be stronger if it
said which of the two it is asking for, or that it is asking for the first
and is prepared to state R7's bound as a cost rather than a property.

## What can be checked

The protocol text is at <https://quo.systems/constitution/> and in the
repository above. The five implementations, their test suites, and the
conformance suite are in the same repository; the conformance kit runs
with Node against any implementation that answers a nine-verb JSON-lines
contract, and reports per field where an implementation diverges. The
chain behaviour described under R1 has been run across three machines on
the public internet with a Go door in the middle, and the leash arithmetic
closes exactly with no clock ever compared between doors.

I am not asking the group to consider the protocol. I am offering it as an
existence proof for three of its requirements and as a counterexample to
the joint satisfiability of all nine, and I would welcome being shown where
the mapping above is wrong.
