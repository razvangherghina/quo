//! The third carriage: distance zero.
//!
//! Constitution, Article III — *at distance zero the carriage is a call — two
//! houses in one device or one process handing envelope bytes as bytes —
//! which is a private carriage like any other, needing no naming because no
//! wire exists to disagree about.* There is nothing to parse here, no hint to
//! read, no framing to get right and no connection to fail, which is why this
//! crate is the smallest road in the kit.
//!
//! **What is law is this: distance zero waives no step of the judgment.** The
//! seal and the signature are what make two houses two, and a ground that
//! strips them for being local has rebuilt the ambient permission the law
//! exists to end. So this road hands over the sealed envelope exactly as it
//! was handed in, and the far ground judges it exactly as it judges an
//! envelope that crossed a continent. Nothing in this crate can shorten a
//! judgment, because nothing in this crate can look inside one.
//!
//! **This crate is a road, and a road is not the core.** Unlike the other two
//! it reaches no host at all — there is no socket at distance zero — so the
//! separation this kit asserts holds here by having nothing to assert.
//!
//! **Within one house there is no carriage at all**, because there are no
//! strangers. This road is for two houses that happen to share a process, not
//! for one house talking to itself.

/// A ground at the other end of a call: envelope bytes in, the sealed answer
/// out, or `None` for silence.
///
/// This is the whole of what a road may know about a ground. It never learns
/// which step refused, because every failure is the same failure.
pub trait Ground {
    fn arrive(&self, envelope: &[u8]) -> Option<Vec<u8>>;
}

impl<F> Ground for F
where
    F: Fn(&[u8]) -> Option<Vec<u8>>,
{
    fn arrive(&self, envelope: &[u8]) -> Option<Vec<u8>> {
        self(envelope)
    }
}

/// How much of an envelope a door will take in before it stops. Article II
/// leaves how an end guards itself to the warden; this is a default, not law,
/// and it is the common carriage's default so that the same message is
/// carried or dropped whichever road it took.
pub const DEFAULT_BODY_CAP: usize = 1 << 20;

/// A door at distance zero: the ground on the other side of the call, and the
/// most this end will take in.
pub struct Door<G: Ground> {
    far: G,
    body_cap: usize,
}

impl<G: Ground> Door<G> {
    pub fn new(far: G) -> Door<G> {
        Door {
            far,
            body_cap: DEFAULT_BODY_CAP,
        }
    }

    /// How much of an envelope this door will take in. Delivery's, under
    /// Article II.
    pub fn with_body_cap(mut self, body_cap: usize) -> Door<G> {
        self.body_cap = body_cap;
        self
    }

    /// Hand an envelope over as bytes and take back what came back.
    ///
    /// An empty answer is silence, exactly as an empty body is silence on the
    /// common carriage — the road says nothing about why, because it knows
    /// nothing about why. An envelope past this door's cap is not taken in,
    /// so it is not judged, and that too is silence.
    ///
    /// **What is handed over is the envelope and nothing else.** Two houses
    /// sharing a process are still two houses: this road adds no framing, no
    /// header and no naming, reads no byte of what it carries, and hands the
    /// far ground a view it cannot write through.
    pub fn post(&self, envelope: &[u8]) -> Vec<u8> {
        if envelope.len() > self.body_cap {
            return Vec::new();
        }
        self.far.arrive(envelope).unwrap_or_default()
    }
}
