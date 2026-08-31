//! The line over a real socket. Every case binds a listener on an ephemeral
//! loopback port and drops it when the case ends — nothing here is faked and
//! nothing outlives the suite.

#[path = "../../support/hex.rs"]
mod hex;

use std::io::Write;
use std::net::TcpStream;
use std::thread;
use std::time::Duration;

use hex::key;
use quo_envelope::{Allowance, Answer, Message, Method, Say};
use quo_line as line;
use quo_line::{Arrival, Line, Listener, DEFAULT_CAP};

const VOICE_SECRET: &str = "2ebd74bd564a8771fa628b28308c588588f5c0d0db17ae06b045b896d8218ad7";
const DOOR_PADLOCK_SECRET: &str =
    "1f2ebd74bd564a8771fa628b28308c588588f5c0d0db17ae06b045b896d8218a";
const CALLER_PADLOCK_SECRET: &str =
    "7dbcdb3088339c02378f46525bff3fe2b84515973e28f5814301a99f386e20b1";
const EPHEMERAL: &str = "fcfabee71b7a33993cca5579e6a273ffd1c62cc1749cbf1c9049f599e44f6477";
const OTHER_EPHEMERAL: &str = "3d33d3f6044552ecd30503ba772b3d4f69544da0b3a4a46bfa63b056bb191833";

fn an_ask(seq: i64) -> Vec<u8> {
    let voice = quo_arithmetic::signing_pk(&key(VOICE_SECRET));
    let door = quo_arithmetic::sealing_pk(&key(DOOR_PADLOCK_SECRET));
    let mine = quo_arithmetic::sealing_pk(&key(CALLER_PADLOCK_SECRET));
    let say = Say {
        voice,
        recipient: door,
        commitment: None,
        seq,
        padlock: mine,
        hints: Vec::new(),
        allowance: Allowance {
            time: 30_000,
            hops: 8,
        },
        being: None,
        method: Some(Method {
            name: "items".to_string(),
            args: Vec::new(),
        }),
    };
    quo_envelope::seal(
        &key(VOICE_SECRET),
        &key(EPHEMERAL),
        &door,
        &Message::Say(say),
    )
    .expect("a sealed ask")
}

fn an_answer_to(say: &Say) -> Vec<u8> {
    let warden = quo_arithmetic::signing_pk(&key(VOICE_SECRET));
    quo_envelope::seal(
        &key(VOICE_SECRET),
        &key(OTHER_EPHEMERAL),
        &say.padlock,
        &Message::Answer(Answer {
            warden,
            seq: say.seq,
            data: Some(format!("answer to {}", say.seq).into_bytes()),
        }),
    )
    .expect("a sealed answer")
}

fn listening(cap: i64) -> (Listener, String) {
    let listener = Listener::bind("127.0.0.1:0", cap).expect("a loopback port");
    let hint = listener.hint().expect("a hint");
    (listener, hint)
}

// **Framed envelopes over one persistent TCP connection.**

#[test]
fn article_iii_a_sealed_envelope_rides_a_frame_and_the_answer_rides_back() {
    let (listener, hint) = listening(DEFAULT_CAP);
    let door = thread::spawn(move || {
        let mut held = listener.accept().expect("a line");
        let Arrival::Frame(envelope) = held.receive().expect("a frame") else {
            panic!("the line closed before the ask");
        };
        let say = quo_envelope::open_at_door(&key(DOOR_PADLOCK_SECRET), &envelope).expect("an ask");
        held.send(&an_answer_to(&say)).expect("an answer sent");
        // An answer returns on the line its ask arrived on.
        held
    });

    let mut mine = Line::dial(&hint).expect("a line");
    mine.send(&an_ask(4)).expect("an ask sent");
    let Arrival::Frame(back) = mine.receive().expect("a frame") else {
        panic!("the line closed before the answer");
    };
    let held = door.join().expect("the door served");
    assert_eq!(
        held.stream().local_addr().expect("an address").port(),
        mine.stream().peer_addr().expect("an address").port(),
        "the answer returned on the line its ask arrived on"
    );

    let answer =
        quo_envelope::open_at_caller(&key(CALLER_PADLOCK_SECRET), &back).expect("an answer");
    assert_eq!(answer.seq, 4);
    assert_eq!(answer.data, Some(b"answer to 4".to_vec()));
}

// **Either end may originate an ask, which is what lets a ground that cannot
// be called dial out and be asked down the line it holds.**

#[test]
fn article_iii_either_end_may_originate_an_ask_down_the_one_line() {
    let (listener, hint) = listening(DEFAULT_CAP);
    let dialled = thread::spawn(move || {
        let mut mine = Line::dial(&hint).expect("a line");
        // The dialer never asks; it is asked, down the line it opened.
        let Arrival::Frame(envelope) = mine.receive().expect("a frame") else {
            panic!("the line closed before the ask");
        };
        let say = quo_envelope::open_at_door(&key(DOOR_PADLOCK_SECRET), &envelope).expect("an ask");
        mine.send(&an_answer_to(&say)).expect("an answer sent");
    });

    let mut held = listener.accept().expect("a line");
    held.send(&an_ask(11)).expect("an ask sent");
    let Arrival::Frame(back) = held.receive().expect("a frame") else {
        panic!("the line closed before the answer");
    };
    dialled.join().expect("the dialer answered");
    let answer =
        quo_envelope::open_at_caller(&key(CALLER_PADLOCK_SECRET), &back).expect("an answer");
    assert_eq!(answer.seq, 11);
}

// **Answers return in whatever order the work finishes**, and correlation
// lives inside the seal — the seq read against the asks awaiting.

#[test]
fn article_iii_answers_return_in_whatever_order_the_work_finishes() {
    let (listener, hint) = listening(DEFAULT_CAP);
    let door = thread::spawn(move || {
        let mut held = listener.accept().expect("a line");
        let mut asks = Vec::new();
        for _ in 0..3 {
            let Arrival::Frame(envelope) = held.receive().expect("a frame") else {
                panic!("the line closed early");
            };
            asks.push(
                quo_envelope::open_at_door(&key(DOOR_PADLOCK_SECRET), &envelope).expect("an ask"),
            );
        }
        // The work finished backwards, and nothing on the road minds.
        for say in asks.iter().rev() {
            held.send(&an_answer_to(say)).expect("an answer sent");
        }
    });

    let mut mine = Line::dial(&hint).expect("a line");
    for seq in [1, 2, 3] {
        mine.send(&an_ask(seq)).expect("an ask sent");
    }
    let mut seen = Vec::new();
    for _ in 0..3 {
        let Arrival::Frame(back) = mine.receive().expect("a frame") else {
            panic!("the line closed early");
        };
        let answer =
            quo_envelope::open_at_caller(&key(CALLER_PADLOCK_SECRET), &back).expect("an answer");
        seen.push(answer.seq);
    }
    door.join().expect("the door served");
    assert_eq!(seen, vec![3, 2, 1]);
}

// **Each end reads while it writes** — a peer that stops reading to finish
// writing has made a deadlock, and the deadlock is its own. Enough bytes here
// to fill any socket buffer, so an end that wrote everything before reading
// anything would hang rather than pass.

#[test]
fn article_iii_each_end_reads_while_it_writes() {
    // The dialer publishes nothing and so promises the default, which is what
    // both ends may send: 20 frames each way is far past any socket buffer.
    let (listener, hint) = listening(DEFAULT_CAP);
    let bulk = vec![0x5au8; 16_000];
    let theirs = bulk.clone();

    let far = thread::spawn(move || {
        let held = listener.accept().expect("a line");
        let (mut reading, mut writing) = held.split().expect("two halves");
        let sending = thread::spawn(move || {
            for _ in 0..20 {
                writing.send(&theirs).expect("a frame sent");
            }
        });
        let mut read = 0;
        for _ in 0..20 {
            let Arrival::Frame(frame) = reading.receive().expect("a frame") else {
                panic!("the line closed early");
            };
            read += frame.len();
        }
        sending.join().expect("sent");
        let _ = held.stream().shutdown(std::net::Shutdown::Both);
        read
    });

    let mine = Line::dial(&hint).expect("a line");
    let (mut reading, mut writing) = mine.split().expect("two halves");
    let sending = thread::spawn(move || {
        for _ in 0..20 {
            writing.send(&bulk).expect("a frame sent");
        }
    });
    let mut read = 0;
    for _ in 0..20 {
        let Arrival::Frame(frame) = reading.receive().expect("a frame") else {
            panic!("the line closed early");
        };
        read += frame.len();
    }
    sending.join().expect("sent");
    assert_eq!(read, 20 * 16_000);
    assert_eq!(far.join().expect("the far end read"), 20 * 16_000);
}

// **A sender stays at or under the cap the far road promised**, and the
// refusal happens in the sender's own kit rather than at the far door.

#[test]
fn article_iii_an_over_cap_send_is_refused_in_the_senders_own_kit() {
    let (listener, hint) = listening(64);
    assert!(hint.ends_with("?cap=64"), "{hint}");
    let door = thread::spawn(move || {
        let mut held = listener.accept().expect("a line");
        held.receive()
    });

    let mut mine = Line::dial(&hint).expect("a line");
    assert_eq!(mine.far_cap(), 64);
    assert!(
        mine.send(&[0u8; 65]).is_err(),
        "one byte over the promised cap never leaves"
    );
    mine.send(&[3u8; 64]).expect("at the cap it goes");
    let arrived = door.join().expect("the door read");
    assert_eq!(arrived.expect("a frame"), Arrival::Frame(vec![3u8; 64]));
}

// **Only a framing fault ends the connection — a length at or below zero, or
// a length above the receiving end's cap — and it ends without a word.**

#[test]
fn article_iii_a_length_above_the_cap_ends_the_connection_without_a_word() {
    for head in [(-1i64), 0, 65] {
        let (listener, hint) = listening(64);
        let door = thread::spawn(move || {
            let mut held = listener.accept().expect("a line");
            let fault = held.receive();
            assert!(fault.is_err(), "a framing fault: {fault:?}");
            // No word goes back, and the connection is already shut.
        });

        let read = line::read_hint(&hint).expect("a hint");
        let mut raw = TcpStream::connect((read.host.as_str(), read.port)).expect("a connection");
        let mut frame = head.to_be_bytes().to_vec();
        frame.extend_from_slice(&[0u8; 65]);
        let _ = raw.write_all(&frame);
        let _ = raw.flush();
        door.join().expect("the door faulted");

        raw.set_read_timeout(Some(Duration::from_secs(5)))
            .expect("a timeout");
        let mut adopted = Line::adopt(raw, DEFAULT_CAP, DEFAULT_CAP);
        assert_eq!(
            adopted.receive().expect("the connection ended"),
            Arrival::Closed,
            "the connection ended without a word after a length of {head}"
        );
    }
}

// **A well-formed frame whose envelope fails the judgment is ordinary
// silence, and the line lives on.**

#[test]
fn article_iii_a_frame_that_fails_the_judgment_is_silence_and_the_line_lives_on() {
    let (listener, hint) = listening(DEFAULT_CAP);
    let door = thread::spawn(move || {
        let mut held = listener.accept().expect("a line");
        let mut answered = 0;
        for _ in 0..2 {
            let Arrival::Frame(envelope) = held.receive().expect("a frame") else {
                panic!("the line closed early");
            };
            // Silence has no wire form here: a failed judgment sends nothing.
            if let Ok(say) = quo_envelope::open_at_door(&key(DOOR_PADLOCK_SECRET), &envelope) {
                held.send(&an_answer_to(&say)).expect("an answer sent");
                answered += 1;
            }
        }
        answered
    });

    let mut mine = Line::dial(&hint).expect("a line");
    mine.send(b"a well-formed frame that opens to nothing")
        .expect("sent");
    mine.send(&an_ask(2)).expect("sent");
    let Arrival::Frame(back) = mine.receive().expect("a frame") else {
        panic!("the line did not live on");
    };
    assert_eq!(door.join().expect("the door served"), 1);
    let answer =
        quo_envelope::open_at_caller(&key(CALLER_PADLOCK_SECRET), &back).expect("an answer");
    assert_eq!(
        answer.seq, 2,
        "the second ask was answered on the same line"
    );
}

// **Only the listening end has a road to publish**, and **an end that
// publishes nothing — the dialing end always — promises the default.**

#[test]
fn article_iii_the_dialing_end_publishes_nothing_and_promises_the_default() {
    let (listener, hint) = listening(1024);
    assert_eq!(
        hint,
        format!(
            "tcp://{}?cap=1024",
            listener.tcp().local_addr().expect("an address")
        )
    );
    let dialled = thread::spawn(move || {
        let mine = Line::dial(&hint).expect("a line");
        assert_eq!(mine.far_cap(), 1024);
        assert_eq!(mine.cap(), DEFAULT_CAP);
        mine
    });
    let held = listener.accept().expect("a line");
    assert_eq!(
        held.far_cap(),
        DEFAULT_CAP,
        "the dialer published nothing, so it promised the default"
    );
    assert_eq!(held.cap(), 1024);
    drop(dialled.join().expect("dialled"));
}

// **Generosity above the cap is learned by asking `limit`.**

#[test]
fn article_iii_generosity_above_the_promised_cap_is_learned_not_negotiated() {
    let (listener, hint) = listening(1 << 17);
    let door = thread::spawn(move || {
        let mut held = listener.accept().expect("a line");
        held.receive()
    });
    // The dialer knows only what a bare hint promises, whatever the far end
    // can actually take.
    let bare = hint.split('?').next().expect("a hint").to_string();
    let mut mine = Line::dial(&bare).expect("a line");
    assert_eq!(mine.far_cap(), DEFAULT_CAP);
    let big = vec![1u8; 20_000];
    assert!(
        mine.send(&big).is_err(),
        "above the promised cap, the sender's own kit refuses"
    );
    // Learned by asking `limit` — off the wire, not negotiated on it.
    mine.learned_far_cap(1 << 17);
    assert!(mine.send(&big).is_ok());
    let arrived = door.join().expect("the door read");
    assert_eq!(arrived.expect("a frame"), Arrival::Frame(big));
}

// **A warden offers as many roads as it has and a caller tries them.** Choosing
// among them is the caller's whole job, and nothing at a call site says which
// road was taken. It matters most in this kit: it speaks no TLS by ruling, so a
// peer offering `https://` beside `tcp://` was offering it the one road it can
// speak, and a caller that did not walk the hints would refuse a house standing
// right there.
#[test]
fn article_iii_a_caller_takes_the_road_it_can_speak() {
    let listener = Listener::bind("127.0.0.1:0", DEFAULT_CAP).expect("a listener");
    let hint = listener.hint().expect("a hint");
    let door = thread::spawn(move || {
        let mut held = listener.accept().expect("a line");
        let Arrival::Frame(arrived) = held.receive().expect("a frame") else {
            panic!("the line closed before it carried");
        };
        held.send(&arrived).expect("the answer rode back");
    });

    // The house stands on both roads and ranks neither. The `https://` hint is
    // one this kit refuses by its own ruling, so the caller walks past it and
    // takes the line — never told to, and never handed an option.
    let hints = vec!["https://ground.example/door".to_string(), hint];
    let mut caller = line::Caller::new();
    let back = caller
        .send(&hints, b"hello")
        .expect("a road carried")
        .expect("bytes came back");
    assert_eq!(back, b"hello");
    door.join().expect("the door answered");
    caller.hang_up();
}

// A road this caller cannot speak is not a road that failed. Nothing was sent
// down it, so no door spoke and no road broke: it is neither silence nor
// weather, and it is never the fault handed back at the end.
#[test]
fn article_iii_a_road_the_caller_cannot_speak_is_not_a_road_that_failed() {
    let mut caller = line::Caller::new();

    // Nothing but roads it cannot speak is no road tried at all, which is not
    // weather either: there is no fault to report the road of.
    assert_eq!(
        caller
            .send(&["https://ground.example/door".to_string()], b"hello")
            .expect("skipping is not weather"),
        None
    );

    // And where one road is weather, the weather is what comes back — never
    // the skip.
    assert!(caller
        .send(
            &[
                "https://ground.example/door".to_string(),
                "http://127.0.0.1:1/".to_string()
            ],
            b"hello"
        )
        .is_err());
}
