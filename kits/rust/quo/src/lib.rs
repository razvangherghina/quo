//! Quo is a small, open protocol that answers exactly one question — **by
//! whose authority?** — and refuses every other.
//!
//! This crate is the Rust kit whole: each part of the kit is its own crate,
//! and this one names them all under one dependency so a caller who wants the
//! kit takes `quo` and a caller who wants one part takes that part.
//!
//! It holds one thing of its own, [`host`], because a host is the one part
//! that must know every road by name and so can live under no single road.
//!
//! The core — [`notation`], [`arithmetic`], [`wire`], [`envelope`],
//! [`warden`] — touches no host. The roads — [`carriage`], [`line`],
//! [`zero`] — are the three Article III names, and they are the only parts
//! here that reach one.
//!
//! No vendor owns Quo. Apache-2.0. <https://quo.systems>

pub mod host;

pub use quo_arithmetic as arithmetic;
pub use quo_carriage as carriage;
pub use quo_envelope as envelope;
pub use quo_line as line;
pub use quo_notation as notation;
pub use quo_warden as warden;
pub use quo_wire as wire;
pub use quo_zero as zero;
