// SPDX-License-Identifier: Apache-2.0
// Every record of vectors/tcp.json, byte for byte.

use std::io::{Cursor, ErrorKind};

use quo_kit::hex::hex;
use quo_kit::wire::{read_frame, Frame};
use serde_json::Value as Json;

fn corpus() -> Json {
    let path = format!("{}/../../vectors/tcp.json", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn unhex(s: &str) -> Vec<u8> {
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

/// The frame's bytes, with the fill after them where the record has one.
fn bytes_of(r: &Json) -> Vec<u8> {
    let mut out = unhex(r["frame"].as_str().unwrap());
    if let Some(fill) = r.get("fill") {
        let byte = unhex(fill["byte"].as_str().unwrap())[0];
        out.resize(out.len() + fill["count"].as_u64().unwrap() as usize, byte);
    }
    out
}

#[test]
fn every_record() {
    let c = corpus();
    let records = c["vectors"].as_array().unwrap();
    assert!(!records.is_empty());
    for r in records {
        let name = r["name"].as_str().unwrap();
        let bytes = bytes_of(r);
        let is_frame = r["frame?"].as_bool().unwrap();
        let closed = r["closed"].as_bool().unwrap();

        // What read_frame makes of the stream, and Frame::decode of the whole.
        let read = read_frame(&mut Cursor::new(&bytes));
        assert_eq!(read.is_err(), closed, "{name}: closed");
        assert_eq!(Frame::decode(&bytes).is_some(), is_frame, "{name}: decode");
        let frame = match read {
            Err(e) => {
                assert!(!is_frame, "{name}");
                assert_eq!(e.kind(), ErrorKind::InvalidData, "{name}: not a frame");
                continue;
            }
            Ok(frame) => frame,
        };
        assert!(is_frame, "{name}");

        let id = r["id"].as_u64().unwrap() as u32;
        let box_len = r["box"].as_u64().unwrap() as usize;
        let at = r["at"].as_str().unwrap();
        let (kind, fid, ward, len) = match &frame {
            Frame::Ask { id, pk, bytes } => ("00", *id, Some(hex(pk)), bytes.len()),
            Frame::Reply { id, bytes } => ("01", *id, None, bytes.len()),
            Frame::Nothing { id } => ("02", *id, None, 0),
        };
        assert_eq!(kind, r["kind"].as_str().unwrap(), "{name}: kind");
        assert_eq!(fid, id, "{name}: id");
        assert_eq!(ward.as_deref(), r.get("ward").and_then(|w| w.as_str()), "{name}: ward");
        assert_eq!(len, box_len, "{name}: box");

        // The listener carries an ask, the dialer a reply or a nothing.
        let carried = if at == "listener" { kind == "00" } else { kind != "00" };
        assert_eq!(carried, r["carried"].as_bool().unwrap(), "{name}: carried");

        assert_eq!(frame.encode(), bytes, "{name}: encode");
    }
}

mod harness;

#[test]
fn the_watchdog_stands() {
    harness::watchdog();
}
