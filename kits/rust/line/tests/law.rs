//! What Article III promises about the line, asserted without a socket: the
//! frame, the cap, and the hint. Every case is read from the law and named
//! for the clause it pins.

use std::io::Cursor;

use quo_line as line;
use quo_line::{Arrival, DEFAULT_CAP};

// **A frame is a length written the way the wire encoding writes an `int`,
// then that many envelope bytes, and nothing else — and the length does not
// count itself.**

#[test]
fn article_iii_a_frame_is_a_length_then_that_many_envelope_bytes() {
    let envelope = [0xabu8; 5];
    let framed = line::frame(&envelope, DEFAULT_CAP).expect("a frame");
    assert_eq!(
        framed,
        vec![0, 0, 0, 0, 0, 0, 0, 5, 0xab, 0xab, 0xab, 0xab, 0xab]
    );
}

#[test]
fn article_iii_the_length_does_not_count_itself() {
    let envelope = vec![7u8; 300];
    let framed = line::frame(&envelope, DEFAULT_CAP).expect("a frame");
    assert_eq!(framed.len(), 300 + line::LENGTH);
    assert_eq!(&framed[..line::LENGTH], &300i64.to_be_bytes());
}

#[test]
fn article_iii_the_length_is_written_the_way_the_wire_writes_an_int() {
    // Eight bytes, most significant first — Article V, and the one spelling
    // in the kit, so this is the wire's own encoder answering.
    let framed = line::frame(&[0u8; 258], DEFAULT_CAP).expect("a frame");
    assert_eq!(&framed[..8], &[0, 0, 0, 0, 0, 0, 1, 2]);
}

#[test]
fn article_iii_a_frame_carries_nothing_else() {
    let envelope = b"sealed bytes";
    let framed = line::frame(envelope, DEFAULT_CAP).expect("a frame");
    assert_eq!(&framed[line::LENGTH..], envelope);
}

// **Silence has no wire form on a line. A zero-length frame is malformed
// here, though a zero length is a legal value everywhere else in the
// encoding.**

#[test]
fn article_iii_silence_has_no_wire_form_so_a_zero_length_frame_is_refused() {
    assert!(line::frame(b"", DEFAULT_CAP).is_err());
    let mut on_the_wire = Cursor::new(0i64.to_be_bytes().to_vec());
    assert!(line::read_frame(&mut on_the_wire, DEFAULT_CAP).is_err());
}

#[test]
fn article_iii_a_length_at_or_below_zero_is_a_framing_fault() {
    for length in [0i64, -1, i64::MIN] {
        let mut on_the_wire = Cursor::new(length.to_be_bytes().to_vec());
        assert!(
            line::read_frame(&mut on_the_wire, DEFAULT_CAP).is_err(),
            "a length of {length} is a framing fault"
        );
    }
}

// **A bare `tcp://` hint promises the default: that end accepts envelopes to
// 16,384 bytes.**

#[test]
fn article_iii_the_default_cap_is_sixteen_thousand_three_hundred_and_eighty_four() {
    assert_eq!(DEFAULT_CAP, 16_384);
    assert_eq!(
        line::read_hint("tcp://ground.example:9000")
            .expect("a hint")
            .cap,
        16_384
    );
}

#[test]
fn article_iii_a_sender_stays_at_or_under_the_cap_the_far_road_promised() {
    let at_the_cap = vec![0u8; DEFAULT_CAP as usize];
    assert!(line::frame(&at_the_cap, DEFAULT_CAP).is_ok());
    let one_over = vec![0u8; DEFAULT_CAP as usize + 1];
    assert!(
        line::frame(&one_over, DEFAULT_CAP).is_err(),
        "an over-cap send is refused in the sender's own kit"
    );
}

#[test]
fn article_iii_a_length_above_this_ends_cap_is_a_framing_fault() {
    let mut over = 65i64.to_be_bytes().to_vec();
    over.extend_from_slice(&[0u8; 65]);
    let mut on_the_wire = Cursor::new(over);
    assert!(line::read_frame(&mut on_the_wire, 64).is_err());
}

#[test]
fn article_iii_a_frame_at_the_cap_is_read_whole() {
    let mut at = 64i64.to_be_bytes().to_vec();
    at.extend_from_slice(&[9u8; 64]);
    let mut on_the_wire = Cursor::new(at);
    assert_eq!(
        line::read_frame(&mut on_the_wire, 64).expect("a frame"),
        Arrival::Frame(vec![9u8; 64])
    );
}

// **A body the connection ends before delivering is the fault having already
// happened** — and a close between frames is weather, not a fault.

#[test]
fn article_iii_a_body_the_connection_ended_before_delivering_is_the_fault() {
    let mut cut = 10i64.to_be_bytes().to_vec();
    cut.extend_from_slice(b"only four");
    let mut on_the_wire = Cursor::new(cut);
    assert!(line::read_frame(&mut on_the_wire, DEFAULT_CAP).is_err());
}

#[test]
fn article_iii_a_close_between_frames_is_weather_and_not_a_fault() {
    let mut nothing = Cursor::new(Vec::new());
    assert_eq!(
        line::read_frame(&mut nothing, DEFAULT_CAP).expect("a clean close"),
        Arrival::Closed
    );
}

#[test]
fn article_iii_a_length_the_connection_ended_in_the_middle_of_is_a_fault() {
    let mut half = Cursor::new(vec![0, 0, 0]);
    assert!(line::read_frame(&mut half, DEFAULT_CAP).is_err());
}

#[test]
fn article_iii_frames_ride_one_after_another_on_the_one_connection() {
    let mut both = line::frame(b"first", DEFAULT_CAP).expect("a frame");
    both.extend_from_slice(&line::frame(b"second", DEFAULT_CAP).expect("a frame"));
    let mut on_the_wire = Cursor::new(both);
    assert_eq!(
        line::read_frame(&mut on_the_wire, DEFAULT_CAP).expect("one"),
        Arrival::Frame(b"first".to_vec())
    );
    assert_eq!(
        line::read_frame(&mut on_the_wire, DEFAULT_CAP).expect("two"),
        Arrival::Frame(b"second".to_vec())
    );
    assert_eq!(
        line::read_frame(&mut on_the_wire, DEFAULT_CAP).expect("the close"),
        Arrival::Closed
    );
}

// **Its hint is `tcp://host:port` — the host a literal address or a name, an
// IPv6 literal in brackets, the port always written — optionally followed by
// `?cap=` and the door's cap in decimal bytes, and nothing after that.**

#[test]
fn article_iii_the_hint_is_tcp_host_port() {
    let read = line::read_hint("tcp://ground.example:9000").expect("a hint");
    assert_eq!(read.host, "ground.example");
    assert_eq!(read.port, 9000);
}

#[test]
fn article_iii_an_ipv6_literal_stands_in_brackets() {
    let read = line::read_hint("tcp://[2001:db8::1]:9000").expect("a hint");
    assert_eq!(read.host, "2001:db8::1");
    assert_eq!(read.port, 9000);
    assert_eq!(
        line::write_hint("2001:db8::1", 9000, quo_line::DEFAULT_CAP),
        "tcp://[2001:db8::1]:9000"
    );
}

#[test]
fn article_iii_a_door_with_a_different_appetite_declares_its_cap_in_its_hint() {
    let read = line::read_hint("tcp://ground.example:9000?cap=65536").expect("a hint");
    assert_eq!(read.cap, 65_536);
    assert_eq!(
        line::write_hint("ground.example", 9000, 65_536),
        "tcp://ground.example:9000?cap=65536"
    );
    let small = line::read_hint("tcp://ground.example:9000?cap=512").expect("a hint");
    assert_eq!(small.cap, 512);
}

#[test]
fn article_iii_the_port_is_always_written() {
    assert!(line::read_hint("tcp://ground.example").is_err());
    assert!(line::read_hint("tcp://[2001:db8::1]").is_err());
}

/// A port of zero names a door nothing can be sent to, exactly as a cap of
/// zero names one nothing can be framed for. Neither is a road.
#[test]
fn article_iii_a_port_of_zero_is_no_road() {
    assert!(line::read_hint("tcp://ground.example:0").is_err());
    assert!(line::read_hint("tcp://[2001:db8::1]:0").is_err());
    assert!(line::read_hint("tcp://ground.example:0?cap=1024").is_err());
    assert!(
        line::read_hint("tcp://ground.example:1").is_ok(),
        "and the first real port is a road"
    );
}

#[test]
fn article_iii_nothing_stands_after_the_cap() {
    for hint in [
        "tcp://ground.example:9000?cap=1024&more=1",
        "tcp://ground.example:9000?cap=1024/",
        "tcp://ground.example:9000?limit=1024",
        "tcp://ground.example:9000?cap=",
        "tcp://ground.example:9000?cap=0x400",
        "tcp://ground.example:9000?cap=-1",
        "tcp://ground.example:9000?cap=0",
        "tcp://ground.example:9000/door",
        "tcp://:9000",
        "tcp://ground.example:door",
        "https://ground.example:9000",
        "ground.example:9000",
    ] {
        assert!(
            line::read_hint(hint).is_err(),
            "{hint} is not a line's hint"
        );
    }
}

// **A warden whose published `limit` is under the default and whose hint
// declares no cap does not offer the line.**

#[test]
fn article_iii_a_warden_under_the_default_with_no_declared_cap_does_not_offer_the_line() {
    assert!(!line::offers_line(4_096, "tcp://ground.example:9000"));
    assert!(line::offers_line(
        4_096,
        "tcp://ground.example:9000?cap=4096"
    ));
    assert!(line::offers_line(DEFAULT_CAP, "tcp://ground.example:9000"));
    assert!(line::offers_line(1 << 20, "tcp://ground.example:9000"));
    assert!(!line::offers_line(1 << 20, "https://ground.example/door"));
}
