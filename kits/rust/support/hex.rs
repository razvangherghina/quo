//! The corpus is written in hex, so the bench reads and writes it. Beside the
//! crates rather than inside one, for the same reason the JSON reader is.

#![allow(dead_code)]

pub fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

pub fn bytes(written: &str) -> Vec<u8> {
    assert!(written.len().is_multiple_of(2), "hex comes in pairs");
    (0..written.len())
        .step_by(2)
        .map(|at| u8::from_str_radix(&written[at..at + 2], 16).expect("a hex pair"))
        .collect()
}

pub fn key(written: &str) -> [u8; 32] {
    let read = bytes(written);
    read.try_into().expect("thirty-two bytes")
}

pub fn signature(written: &str) -> [u8; 64] {
    let read = bytes(written);
    read.try_into().expect("sixty-four bytes")
}
