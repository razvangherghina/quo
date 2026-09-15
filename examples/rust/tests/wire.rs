// SPDX-License-Identifier: Apache-2.0
// The reference carrier, from chapter 6: the three kinds, the length prefix,
// the bound, what is not a frame, and a listener and a dialer over a loopback
// socket.

mod harness;

use harness::{stream, Probe, SplitMix64, PROBE};
use quo_kit::harbor::MemoryHarbor;
use quo_kit::seal::MAX_BYTES;
use quo_kit::seal::{self, Payload, Reply};
use quo_kit::seal::{being_pk, Seed, WardPk};
use quo_kit::value::{Map, Number, Value, Word};
use quo_kit::ward::{Answer, Asker};
use quo_kit::ward::{Being, Carrier, Ground, Partition, Stance, Thrown, Unmade, Ward};
use quo_kit::wire::*;
use std::cell::RefCell;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::rc::Rc;
use std::sync::Arc;
use std::time::{Duration, Instant};

fn pk64(fill: u8) -> [u8; 64] {
    [fill; 64]
}

#[test]
fn an_ask_is_kind_zero_the_id_the_ward_pk_and_the_box() {
    let frame = Frame::Ask { id: 7, pk: pk64(0xab), bytes: vec![1, 2, 3] };
    let body = frame.body();
    assert_eq!(body[0], 0x00);
    assert_eq!(&body[1..5], &7u32.to_be_bytes());
    assert_eq!(&body[5..69], &pk64(0xab)[..]);
    assert_eq!(&body[69..], &[1, 2, 3]);
    assert_eq!(frame.encode()[..4], (body.len() as u32).to_be_bytes());
    assert_eq!(Frame::decode(&frame.encode()), Some(frame));
}

#[test]
fn a_reply_is_kind_one_the_id_and_the_box() {
    let frame = Frame::Reply { id: 1 << 24, bytes: vec![9; 20] };
    let body = frame.body();
    assert_eq!(body[0], 0x01);
    assert_eq!(&body[1..5], &(1u32 << 24).to_be_bytes());
    assert_eq!(&body[5..], &[9; 20]);
    assert_eq!(Frame::decode(&frame.encode()), Some(frame));
}

#[test]
fn a_nothing_is_kind_two_and_the_id_alone() {
    let frame = Frame::Nothing { id: 0xffff_ffff };
    assert_eq!(frame.body(), vec![0x02, 0xff, 0xff, 0xff, 0xff]);
    assert_eq!(frame.encode(), vec![0, 0, 0, 5, 0x02, 0xff, 0xff, 0xff, 0xff]);
    assert_eq!(Frame::decode(&frame.encode()), Some(frame));
}

#[test]
fn the_length_counts_the_body_and_nothing_else() {
    let frame = Frame::Reply { id: 2, bytes: vec![0; 100] };
    let bytes = frame.encode();
    let length = u32::from_be_bytes(bytes[..4].try_into().unwrap()) as usize;
    assert_eq!(length, 105);
    assert_eq!(bytes.len(), 4 + length);
    // A length that does not count the bytes beside it is no frame.
    let mut short = bytes.clone();
    short[3] -= 1;
    assert_eq!(Frame::decode(&short), None);
    let mut long = bytes;
    long[3] += 1;
    assert_eq!(Frame::decode(&long), None);
}

#[test]
fn the_largest_body_is_one_ask_of_the_one_size() {
    assert_eq!(MAX_BODY, 1_048_645);
    assert_eq!(MAX_BYTES, 1_048_576);
    // An ask's box is `length - 69`, so the largest body carries a box of the
    // one size.
    let largest = Frame::Ask { id: 1, pk: pk64(0), bytes: vec![0; MAX_BYTES] };
    assert_eq!(largest.body().len(), MAX_BODY);
    assert!(Frame::read_body(&largest.body()).is_some());
    let over = Frame::Ask { id: 1, pk: pk64(0), bytes: vec![0; MAX_BYTES + 1] };
    assert_eq!(over.body().len(), MAX_BODY + 1);
    assert_eq!(Frame::read_body(&over.body()), None);
}

#[test]
fn a_body_below_five_is_no_frame() {
    assert_eq!(MIN_BODY, 5);
    for length in 0..MIN_BODY {
        assert_eq!(Frame::read_body(&vec![0x02; length]), None, "{length}");
    }
}

#[test]
fn a_kind_that_is_none_of_the_three_is_no_frame() {
    for kind in [0x03u8, 0x04, 0xff] {
        assert_eq!(Frame::read_body(&[kind, 0, 0, 0, 1]), None, "{kind}");
    }
}

#[test]
fn an_ask_with_fewer_than_sixty_four_bytes_after_its_id_is_no_frame() {
    let short = [[0x00u8, 0, 0, 0, 1].as_slice(), &[0u8; 63]].concat();
    assert_eq!(Frame::read_body(&short), None);
    let exact = [[0x00u8, 0, 0, 0, 1].as_slice(), &[0u8; 64]].concat();
    assert_eq!(Frame::read_body(&exact), Some(Frame::Ask { id: 1, pk: pk64(0), bytes: Vec::new() }));
}

#[test]
fn a_nothing_with_bytes_after_its_id_is_no_frame() {
    assert_eq!(Frame::read_body(&[0x02, 0, 0, 0, 1, 9]), None);
}

#[test]
fn the_frame_a_side_reads_off_a_stream_is_the_frame_the_other_wrote() {
    let frames = [Frame::Ask { id: 1, pk: pk64(3), bytes: vec![7; 200] }, Frame::Reply { id: 2, bytes: vec![8; 5] }, Frame::Nothing { id: 3 }];
    let mut stream = Vec::new();
    for frame in &frames {
        write_frame(&mut stream, frame).unwrap();
    }
    let mut read = stream.as_slice();
    for frame in &frames {
        assert_eq!(&read_frame(&mut read).unwrap(), frame);
    }
}

#[test]
fn a_length_above_the_bound_is_read_as_no_frame() {
    let mut stream = ((MAX_BODY + 1) as u32).to_be_bytes().to_vec();
    stream.extend(vec![0u8; 8]);
    let mut read = stream.as_slice();
    assert_eq!(read_frame(&mut read).unwrap_err().kind(), std::io::ErrorKind::InvalidData);
    let mut stream = 4u32.to_be_bytes().to_vec();
    stream.extend(vec![0u8; 4]);
    let mut read = stream.as_slice();
    assert_eq!(read_frame(&mut read).unwrap_err().kind(), std::io::ErrorKind::InvalidData);
}

/// The harbor a listener stands: the wards it holds, and nothing under any
/// other pk.
struct Harbor(MemoryHarbor);

impl Doors for Harbor {
    fn door(&self, ward: &WardPk, ask: &[u8]) -> Option<Vec<u8>> {
        self.0.door(ward, ask).map(|(reply, _)| reply)
    }
}

/// A world of one ward behind a listener, with a public probe on it.
fn stand_one() -> (MemoryHarbor, WardPk) {
    let harbor = MemoryHarbor::new(stream(&Rc::new(RefCell::new(SplitMix64::new(7)))));
    harbor.hold(PROBE, |stance| Ok(Box::new(Probe::new(stance)) as Box<dyn Being>));
    let ward = harbor.boot(Seed::from_text("listening"));
    let mut args = Map::new();
    args.insert("key", "one");
    args.insert("class", PROBE);
    harbor.ask(&ward, Some("boot"), Some(&args)).expect("the ward is kept");
    let mut public = Map::new();
    public.insert("key", "one");
    harbor.ask(&ward, Some("public"), Some(&public)).expect("the ward is kept");
    (harbor, ward)
}

/// One ask for the public being, sealed to `ward`, and the ephemeral secret
/// that opens its reply.
fn public_ask(ward: &WardPk, seq: u64, method: &str) -> (Vec<u8>, [u8; 32]) {
    let mut stream = SplitMix64::new(seq);
    let signer = stream.key();
    let ephemeral = stream.key();
    let payload = Payload { to: None, by: being_pk(&signer), next: None, seq, time: 30_000, method: Some(method.to_owned()), args: Some(Map::new()) };
    let body = payload.to_json();
    let sealed = seal::seal_ask(ward, &ephemeral, None, &seal::ZERO_EDGE, body.as_bytes(), &signer).expect("a padlock that takes a seal");
    (sealed, ephemeral)
}

#[test]
fn a_dialer_asks_a_listener_over_a_loopback_socket() {
    let listener = Listener::stand(("127.0.0.1", 0)).expect("a loopback port");
    let address = listener.address().expect("a bound address");
    let standing = std::thread::spawn(move || {
        let (harbor, ward) = stand_one();
        let pk = ward;
        listener.serve_one(&Harbor(harbor)).expect("a connection served");
        pk
    });

    // The dialer must know the pk it asks, so it derives the same one: an
    // invitation carries no route and a route carries no invitation.
    let ward = Seed::from_text("listening").ward_pk();
    let mut dialer = Dialer::dial(address).expect("a connection");

    // An ask, answered by the public being as an object.
    let (ask, ephemeral) = public_ask(&ward, 1, "hello");
    let back = dialer.ask(&ward, &ask).expect("a frame back").expect("the door took the bytes");
    let reply = seal::open_reply(&ephemeral, &ward, &back).expect("a reply of one of the three shapes");
    let Reply::Object { object, seen } = reply else { panic!("the public being answered an object") };
    assert_eq!(object.get("hi").map(|v| v.is_null()), Some(true), "a stranger arrives as nobody");
    assert!(seen.is_some(), "a named ask that had a digest carries one");

    // Many asks in flight on the one connection, the ids the dialer's, and the
    // answers found by id whatever order they come in.
    let (first, first_lid) = public_ask(&ward, 2, "hello");
    let (second, second_lid) = public_ask(&ward, 3, "quiet");
    let first_id = dialer.send(&ward, &first).expect("sent");
    let second_id = dialer.send(&ward, &second).expect("sent");
    assert_ne!(first_id, second_id);
    let second_back = dialer.receive(second_id).expect("a frame back").expect("the door took the bytes");
    let first_back = dialer.receive(first_id).expect("a frame back").expect("the door took the bytes");
    assert_eq!(seal::open_reply(&second_lid, &ward, &second_back), Some(Reply::Silence));
    assert!(matches!(seal::open_reply(&first_lid, &ward, &first_back), Some(Reply::Object { .. })));

    // A pk the listener stands no ward under is nothing, and nothing is never
    // said after the door took the bytes.
    let stranger = Seed::from_text("nowhere").ward_pk();
    let (ask, _) = public_ask(&stranger, 4, "hello");
    assert_eq!(dialer.ask(&stranger, &ask).expect("a frame back"), None);

    drop(dialer);
    assert_eq!(standing.join().expect("the listener ended"), ward);
}

#[test]
fn a_reply_to_an_id_nobody_awaits_is_not_read() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("a loopback port");
    let address = listener.local_addr().expect("a bound address");
    let far = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("a connection");
        let Frame::Ask { id, .. } = read_frame(&mut stream).expect("the ask") else { panic!("an ask") };
        // Replies to ids the dialer never sent, then the one it awaits.
        for stray in 1_000..1_100 {
            write_frame(&mut stream, &Frame::Reply { id: stray, bytes: vec![0; 8] }).expect("written");
        }
        write_frame(&mut stream, &Frame::Reply { id, bytes: vec![1; 8] }).expect("written");
    });
    let ward = Seed::from_text("far").ward_pk();
    let mut dialer = Dialer::dial(address).expect("a connection");
    assert_eq!(dialer.ask(&ward, b"box").expect("a frame back"), Some(vec![1; 8]));
    far.join().expect("the far side ended");
    // Nothing was kept for an id nobody awaited: asking for one finds the
    // connection closed and no reply held.
    assert!(dialer.receive(1_000).is_err());
}

/// A being who knocks and says what her ward told her.
struct Knocker {
    stance: Stance,
}

impl Being for Knocker {
    fn answer(&self, _asker: &Asker, method: Option<&str>, args: &Map) -> Result<Answer, Thrown> {
        match method {
            None => Ok(Answer::Value(Probe::blueprint())),
            Some("knock") => {
                let invitation = args.get("invitation").cloned().unwrap_or(Value::Null);
                let wanted = args.get("wanted").and_then(Value::as_object).cloned().unwrap_or_default();
                let mut said = Map::new();
                said.insert(
                    "word",
                    match self.stance.knock(&invitation, Some("hello"), None, Some(&wanted)) {
                        Answer::Word(word) => Value::from(word.as_str()),
                        other => panic!("a quiet far side answered {other:?}"),
                    },
                );
                Ok(Answer::Value(Value::Object(said)))
            }
            Some(_) => Ok(Answer::Silence),
        }
    }
}

/// A ground that makes knockers and hands the ward one carrier.
struct Over {
    carrier: Arc<dyn Carrier>,
    entropy: RefCell<SplitMix64>,
}

impl Ground for Over {
    fn instantiate(&self, class: &str, stance: Stance) -> Result<Box<dyn Being>, Unmade> {
        match class {
            "knocker" => Ok(Box::new(Knocker { stance })),
            _ => Err(Unmade::NoClass),
        }
    }

    fn carrier(&self) -> Option<Arc<dyn Carrier>> {
        Some(self.carrier.clone())
    }

    fn random(&self, count: usize) -> Vec<u8> {
        self.entropy.borrow_mut().bytes(count)
    }
}

/// A ward over a ground whose carrier is `carrier`.
fn over(carrier: impl Carrier + 'static, stream: u64) -> Ward {
    let ground = Rc::new(Over { carrier: Arc::new(carrier), entropy: RefCell::new(SplitMix64::new(stream)) });
    Ward::birth(&Seed::from_text("asking"), Rc::new(RefCell::new(Partition::default())), ground)
}

/// A carrier that takes the bytes and ends without a word, not even nothing.
struct Gone;

impl Carrier for Gone {
    fn carry(&self, _ward: &WardPk, _bytes: &[u8]) -> Option<Vec<u8>> {
        panic!("the carrier ended without a word")
    }
}

/// A carrier that takes the bytes and never returns.
struct Hung;

impl Carrier for Hung {
    fn carry(&self, _ward: &WardPk, _bytes: &[u8]) -> Option<Vec<u8>> {
        loop {
            std::thread::park();
        }
    }
}

/// A carrier of one TCP connection per ask with no read timeout: the ward's
/// allowance alone ends the wait.
struct Loopback {
    address: SocketAddr,
}

/// The root asks being `one` to knock on the public being of a ward nobody
/// stands, with an allowance of 50 ms, and returns the word her ward told her.
fn knocked_late(ward: &Ward) -> Option<String> {
    let mut booted = Map::new();
    booted.insert("key", "one");
    booted.insert("class", "knocker");
    assert!(matches!(ward.ask(Some("boot"), Some(&booted)), Answer::Value(_)));
    let mut wanted = Map::new();
    wanted.insert("time", Value::Number(Number::from_u64(50).expect("a whole number")));
    let mut invitation = Map::new();
    invitation.insert("ward", Seed::from_text("quiet").ward_pk().to_string());
    let mut args = Map::new();
    args.insert("invitation", invitation);
    args.insert("wanted", wanted);
    let mut asked = Map::new();
    asked.insert("being", "one");
    asked.insert("method", "knock");
    asked.insert("args", args);
    match ward.ask(Some("ask"), Some(&asked)) {
        Answer::Value(said) => said.get("word").and_then(Value::as_str).map(str::to_owned),
        other => panic!("the root's ask answered {other:?}"),
    }
}

#[test]
fn a_carrier_that_never_answers_ends_the_wait_as_late_inside_the_allowance() {
    let ward = over(Gone, 13);
    let started = Instant::now();
    assert_eq!(knocked_late(&ward).as_deref(), Some(Word::Late.as_str()));
    assert!(started.elapsed() < Duration::from_millis(1_000));
}

#[test]
fn a_carrier_that_blocks_inside_carry_forever_ends_the_wait_as_late_inside_the_allowance() {
    let ward = over(Hung, 17);
    let started = Instant::now();
    assert_eq!(knocked_late(&ward).as_deref(), Some(Word::Late.as_str()));
    assert!(started.elapsed() < Duration::from_millis(1_000));
}

impl Carrier for Loopback {
    fn carry(&self, ward: &WardPk, bytes: &[u8]) -> Option<Vec<u8>> {
        let mut stream = TcpStream::connect(self.address).ok()?;
        write_frame(&mut stream, &Frame::Ask { id: 1, pk: ward.to_bytes(), bytes: bytes.to_vec() }).ok()?;
        // The bytes left: a frame that never comes is answered nothing at all.
        match read_frame(&mut stream) {
            Ok(Frame::Reply { bytes, .. }) => Some(bytes),
            Ok(Frame::Nothing { .. }) => None,
            _ => loop {
                std::thread::park();
            },
        }
    }
}

#[test]
fn a_far_side_that_never_answers_ends_the_wait_as_late() {
    // A listener that takes the bytes and answers nothing at all: the ask is
    // in flight for as long as anyone waits on it.
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("a loopback port");
    let address = listener.local_addr().expect("a bound address");
    let quiet = std::thread::spawn(move || {
        let (stream, _) = listener.accept().expect("a connection");
        std::thread::sleep(Duration::from_millis(300));
        drop(stream);
    });

    let ward = over(Loopback { address }, 11);
    assert_eq!(knocked_late(&ward).as_deref(), Some(Word::Late.as_str()));
    quiet.join().expect("the quiet side ended");
}
