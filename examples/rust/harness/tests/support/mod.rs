// SPDX-License-Identifier: Apache-2.0
//! A driver over `stand`'s own root channel, `HARNESS.md` section 2,
//! shared by every test in this crate: spawn it, read `ward` and `ready`,
//! send a request, read its answer.

use quo_kit::seal::Payload;
use quo_kit::value::Map;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

pub struct Stand {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next: u64,
}

impl Stand {
    pub fn spawn(args: &[&str]) -> Stand {
        watchdog();
        let mut child = Command::new(env!("CARGO_BIN_EXE_stand")).args(args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit()).spawn().expect("stand runs");
        let stdin = child.stdin.take().expect("piped stdin");
        let stdout = BufReader::new(child.stdout.take().expect("piped stdout"));
        Stand { child, stdin, stdout, next: 1 }
    }

    pub fn line(&mut self) -> String {
        let mut s = String::new();
        self.stdout.read_line(&mut s).expect("a line");
        assert!(!s.is_empty(), "stand closed stdout early");
        s.trim_end().to_owned()
    }

    /// Reads the `ward` lines up to `ready`, and the pk and address each
    /// named, in order.
    pub fn boot_lines(&mut self, wards: usize) -> Vec<(String, String)> {
        let mut out = Vec::new();
        for _ in 0..wards {
            let line = self.line();
            let mut parts = line.split(' ');
            assert_eq!(parts.next(), Some("ward"), "line: {line:?}");
            let pk = parts.next().expect("a pk").to_owned();
            assert_eq!(pk.len(), 128, "a pk is 128 hex: {pk}");
            let at = parts.next().expect("an address").to_owned();
            out.push((pk, at));
        }
        assert_eq!(self.line(), "ready");
        out
    }

    pub fn request(&mut self, ward: &str, method: &str, args: serde_json::Value) -> serde_json::Value {
        self.request_at(ward, None, method, args)
    }

    pub fn request_at(&mut self, ward: &str, at: Option<&str>, method: &str, args: serde_json::Value) -> serde_json::Value {
        let id = self.next.to_string();
        self.next += 1;
        let mut request = serde_json::json!({ "id": id, "ward": ward, "method": method, "args": args });
        if let Some(at) = at {
            request["at"] = serde_json::Value::String(at.to_owned());
        }
        let reply = self.raw(&request.to_string());
        assert_eq!(reply["id"], id, "reply: {reply}");
        reply
    }

    /// Writes one line as it stands and reads the next answer.
    pub fn raw(&mut self, line: &str) -> serde_json::Value {
        self.send_raw(line);
        self.answer()
    }

    /// Writes one line as it stands, reading nothing.
    #[allow(dead_code)]
    pub fn send_raw(&mut self, line: &str) {
        writeln!(self.stdin, "{line}").expect("stand reads its stdin");
        self.stdin.flush().ok();
    }

    /// Reads the next answer, whichever request it answers.
    pub fn answer(&mut self) -> serde_json::Value {
        let line = self.line();
        serde_json::from_str(&line).unwrap_or_else(|e| panic!("{e}: {line}"))
    }

    pub fn finish(mut self) {
        drop(self.stdin);
        let status = self.child.wait().expect("stand exits");
        assert!(status.success(), "stand exited {status:?}");
    }
}

/// `stand.request(...)["object"]["error"]`, when there is one.
#[allow(dead_code)]
pub fn error_of(reply: &serde_json::Value) -> Option<&str> {
    reply["object"]["error"].as_str()
}

/// A public ask (`to: None`), signed by a key this test mints itself, the
/// way a hand mints its own per `HARNESS.md` section 3: it holds keys it
/// minted itself and knocks with invitations the driver obtained through
/// the root, so no key is ever exported from a kit. The public being
/// admits any self-consistent signature, so no invitation and no seq
/// bookkeeping is needed to reach her. One key does double duty, as the
/// seal's own ephemeral X25519 secret and as the ed25519 secret `by`
/// names: the two algorithms read the same thirty-two bytes as two
/// unrelated scalars, and a hand minting one key for both still mints its
/// own.
#[allow(dead_code)]
pub fn public_ask(method: &str, args: Map) -> ([u8; 32], Vec<u8>) {
    let key = quo_kit::arithmetic::sha256(format!("hand-key-{method}-{:?}", args).as_bytes());
    let by = quo_kit::arithmetic::signing_pk(&key);
    let payload = Payload { to: None, by, next: None, seq: 1, time: 5_000, method: Some(method.to_owned()), args: Some(args) };
    let body = payload.to_json();
    (key, body.into_bytes())
}

/// The deadline every harness test binary runs under: a stand that hangs
/// ends the run, failed. Armed once per process, by every spawn.
pub fn watchdog() {
    static ARMED: std::sync::Once = std::sync::Once::new();
    ARMED.call_once(|| {
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_secs(300));
            eprintln!("watchdog: the harness's tests ran past 300 seconds");
            std::process::exit(124);
        });
    });
}
