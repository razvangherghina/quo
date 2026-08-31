//! The common carriage over a real socket. A door is bound on an ephemeral
//! loopback port, driven, and dropped when the case ends — nothing here is
//! faked and nothing outlives the suite.

#[path = "../../support/hex.rs"]
mod hex;

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

use hex::key;
use quo_carriage as carriage;
use quo_envelope::{Allowance, Answer, Message, Method, Say};

const VOICE_SECRET: &str = "2ebd74bd564a8771fa628b28308c588588f5c0d0db17ae06b045b896d8218ad7";
const DOOR_PADLOCK_SECRET: &str =
    "1f2ebd74bd564a8771fa628b28308c588588f5c0d0db17ae06b045b896d8218a";
const CALLER_PADLOCK_SECRET: &str =
    "7dbcdb3088339c02378f46525bff3fe2b84515973e28f5814301a99f386e20b1";
const EPHEMERAL: &str = "fcfabee71b7a33993cca5579e6a273ffd1c62cc1749cbf1c9049f599e44f6477";
const OTHER_EPHEMERAL: &str = "3d33d3f6044552ecd30503ba772b3d4f69544da0b3a4a46bfa63b056bb191833";

fn an_ask() -> Vec<u8> {
    let voice = quo_arithmetic::signing_pk(&key(VOICE_SECRET));
    let door = quo_arithmetic::sealing_pk(&key(DOOR_PADLOCK_SECRET));
    let mine = quo_arithmetic::sealing_pk(&key(CALLER_PADLOCK_SECRET));
    let say = Say {
        voice,
        recipient: door,
        commitment: None,
        seq: 7,
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
    let answer = Answer {
        warden,
        seq: say.seq,
        data: Some(b"two items".to_vec()),
    };
    quo_envelope::seal(
        &key(VOICE_SECRET),
        &key(OTHER_EPHEMERAL),
        &say.padlock,
        &Message::Answer(answer),
    )
    .expect("a sealed answer")
}

// **One POST, bytes in and bytes out. The response body is the sealed
// answer.**

#[test]
fn article_iii_one_post_carries_a_sealed_ask_and_the_body_carries_the_answer() {
    let door = carriage::Door::bind("127.0.0.1:0").expect("a loopback port");
    let hint = door.hint().expect("a hint");
    let ask = an_ask();

    let serving = thread::spawn(move || {
        door.serve_one(|body| {
            let say = quo_envelope::open_at_door(&key(DOOR_PADLOCK_SECRET), body).ok()?;
            Some(an_answer_to(&say))
        })
        .expect("one post carried");
    });

    let back = carriage::post(&hint, &ask).expect("an answer");
    serving.join().expect("the door served");

    let answer =
        quo_envelope::open_at_caller(&key(CALLER_PADLOCK_SECRET), &back).expect("an answer");
    assert_eq!(answer.seq, 7);
    assert_eq!(answer.data, Some(b"two items".to_vec()));
}

// **An empty body is silence's wire form.**

#[test]
fn article_iii_a_door_that_answers_nothing_answers_an_empty_body() {
    let door = carriage::Door::bind("127.0.0.1:0").expect("a loopback port");
    let hint = door.hint().expect("a hint");
    let serving = thread::spawn(move || door.serve_one(|_| None).expect("one post carried"));
    let back = carriage::post(&hint, &an_ask()).expect("silence");
    serving.join().expect("the door served");
    assert!(back.is_empty(), "silence carries no bytes");
}

// **Anything that is not a POST of a sealed body carries no unsealable bytes
// and meets the same silence as any malformed message** — and no verb is
// checked, so it is not the verb that makes it silence: it is that there is
// nothing in it.

#[test]
fn article_iii_a_request_that_is_not_a_post_of_a_sealed_body_meets_the_same_silence() {
    for request in [
        "GET / HTTP/1.1\r\nHost: x\r\n\r\n",
        "PUT / HTTP/1.1\r\nHost: x\r\nContent-Length: 3\r\n\r\nabc",
        "nonsense\r\n\r\n",
    ] {
        let door = carriage::Door::bind("127.0.0.1:0").expect("a loopback port");
        let at = door.listener().local_addr().expect("an address");
        let serving = thread::spawn(move || {
            door.serve_one(|body| {
                quo_envelope::open_at_door(&key(DOOR_PADLOCK_SECRET), body).ok()?;
                Some(b"never".to_vec())
            })
            .expect("one request carried");
        });

        let mut stream = TcpStream::connect(at).expect("a connection");
        stream.write_all(request.as_bytes()).expect("sent");
        stream.flush().expect("sent");
        let mut raw = Vec::new();
        stream.read_to_end(&mut raw).expect("an answer");
        serving.join().expect("the door served");

        let body = carriage::answer_body(&raw).expect("a body");
        assert!(
            body.is_empty(),
            "{request:?} met something other than silence"
        );
    }
}

// **No status code carries meaning** — over a real socket, not only in the
// parser.

#[test]
fn article_iii_a_body_under_a_five_hundred_is_read_like_any_other() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
    let at = listener.local_addr().expect("an address");
    let serving = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("a caller");
        let mut swallow = [0u8; 512];
        let _ = stream.read(&mut swallow);
        stream
            .write_all(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 6\r\n\r\nsealed")
            .expect("answered");
        stream.flush().expect("answered");
    });
    let back = carriage::post(&format!("http://{at}/"), b"ask").expect("a body");
    serving.join().expect("the road served");
    assert_eq!(back, b"sealed".to_vec());
}

// **Posted to exactly as given** — the request that actually leaves the
// socket, byte for byte.

#[test]
fn article_iii_the_request_that_leaves_the_socket_is_posted_exactly_as_given() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("a loopback port");
    let at = listener.local_addr().expect("an address");
    let listening = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("a caller");
        let mut raw = vec![0u8; 4];
        let mut seen = Vec::new();
        loop {
            let read = stream.read(&mut raw).expect("read");
            if read == 0 {
                break;
            }
            seen.extend_from_slice(&raw[..read]);
            if seen.windows(4).any(|four| four == b"\r\n\r\n") && seen.ends_with(b"sealed") {
                break;
            }
        }
        stream
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n")
            .expect("answered");
        seen
    });

    let hint = format!("http://{at}/quo?door=one");
    carriage::post(&hint, b"sealed").expect("silence");
    let seen = listening.join().expect("the road heard");
    let text = String::from_utf8_lossy(&seen).into_owned();
    assert!(
        text.starts_with(&format!("POST /quo?door=one HTTP/1.1\r\nHost: {at}\r\n")),
        "{text}"
    );
    assert!(text.ends_with("\r\n\r\nsealed"), "{text}");
}

// **Many wardens may stand behind one hint**, since the recipient is named
// inside the signed payload and only its own door can unseal a message.

#[test]
fn article_iii_many_wardens_may_stand_behind_one_hint() {
    let door = carriage::Door::bind("127.0.0.1:0").expect("a loopback port");
    let hint = door.hint().expect("a hint");
    let elsewhere = key(EPHEMERAL);
    let serving = thread::spawn(move || {
        door.serve_one(move |body| {
            // The hint reached this process; the seal decides whose door it is.
            if quo_envelope::open_at_door(&elsewhere, body).is_ok() {
                return Some(b"the wrong door read it".to_vec());
            }
            quo_envelope::open_at_door(&key(DOOR_PADLOCK_SECRET), body).ok()?;
            Some(b"the right door read it".to_vec())
        })
        .expect("one post carried")
    });
    let back = carriage::post(&hint, &an_ask()).expect("an answer");
    serving.join().expect("the door served");
    assert_eq!(back, b"the right door read it".to_vec());
}
