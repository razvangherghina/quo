use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

struct Stand {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    n: u32,
}

impl Stand {
    fn new() -> Stand {
        let mut child = Command::new(env!("CARGO_BIN_EXE_stand"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let input = child.stdin.take().unwrap();
        let output = BufReader::new(child.stdout.take().unwrap());
        Stand { child, input, output, n: 0 }
    }

    fn raw(&mut self, line: &str) -> String {
        self.input.write_all(line.as_bytes()).unwrap();
        self.input.write_all(b"\n").unwrap();
        self.input.flush().unwrap();
        let mut s = String::new();
        self.output.read_line(&mut s).unwrap();
        s.trim_end().to_string()
    }

    /// Send `{"id":..,<body>}` and return the answer with the id prefix removed.
    fn req(&mut self, body: &str) -> String {
        self.n += 1;
        let id = format!("r{}", self.n);
        let a = self.raw(&format!("{{\"id\":\"{id}\",{body}}}"));
        let p = format!("{{\"id\":\"{id}\",");
        assert!(a.starts_with(&p), "{a}");
        a[p.len()..a.len() - 1].to_string()
    }

    fn close(mut self) -> i32 {
        drop(self.input);
        self.child.wait().unwrap().code().unwrap()
    }
}

fn field(ans: &str, k: &str) -> String {
    // ans is `"k":"value"`-like; take the quoted value after "k":
    let p = format!("\"{k}\":\"");
    let i = ans.find(&p).unwrap() + p.len();
    ans[i..i + ans[i..].find('"').unwrap()].to_string()
}

fn invitation(ans: &str) -> String {
    ans.strip_prefix("\"invitation\":").unwrap().to_string()
}

#[test]
fn part_one() {
    let mut a = Stand::new();
    let mut b = Stand::new();
    let wa = field(&a.req(r#""op":"ward","seed":"alpha""#), "ward");
    assert_eq!(wa.len(), 128);
    let wb = field(&b.req(r#""op":"ward","seed":"beta""#), "ward");
    let inv = invitation(&a.req(&format!(r#""op":"invite","ward":"{wa}","heir":"h1""#)));

    for (method, args, want) in [
        (r#","method":"m""#, r#","args":{"x":1e21, "y" : [true]}"#, r#""read":{"object":{"x":1e21,"y":[true]},"seen":null}"#),
        ("", "", r#""read":{"object":{},"seen":null}"#),
        (r#","method":"m""#, "", r#""read":{"object":{},"seen":null}"#),
    ] {
        let bx = field(&b.req(&format!(r#""op":"ask","ward":"{wb}","invitation":{inv}{method}{args}"#)), "box");
        let rep = field(&a.req(&format!(r#""op":"arrive","ward":"{wa}","box":"{bx}""#)), "reply");
        let r = b.req(&format!(r#""op":"read","ward":"{wb}","invitation":{inv},"reply":"{rep}""#));
        assert_eq!(r, want);
    }
    // nothing
    b.req(&format!(r#""op":"ask","ward":"{wb}","invitation":{inv}"#));
    assert_eq!(b.req(&format!(r#""op":"read","ward":"{wb}","invitation":{inv},"reply":null"#)), r#""read":{"nothing":true}"#);

    // release a spent heir: removed
    assert_eq!(a.req(&format!(r#""op":"release","ward":"{wa}","heir":"h1""#)), r#""released":"h1""#);
    assert_eq!(a.req(&format!(r#""op":"release","ward":"{wa}","heir":"h1""#)), r#""released":null"#);
    let bx = field(&b.req(&format!(r#""op":"ask","ward":"{wb}","invitation":{inv},"method":"m""#)), "box");
    let rep = field(&a.req(&format!(r#""op":"arrive","ward":"{wa}","box":"{bx}""#)), "reply");
    assert_eq!(
        b.req(&format!(r#""op":"read","ward":"{wb}","invitation":{inv},"reply":"{rep}""#)),
        r#""read":{"quo":"removed"}"#
    );

    // marked, null, silent
    for (reach, want) in [
        ("marked", r#""read":{"object":{"k":"v"},"seen":"1"}"#),
        ("null", r#""read":{"object":null,"seen":null}"#),
        ("silent", r#""read":{"silence":true}"#),
    ] {
        let inv = invitation(&a.req(&format!(r#""op":"invite","ward":"{wa}","heir":"{reach}","reach":"{reach}""#)));
        let bx = field(&b.req(&format!(r#""op":"ask","ward":"{wb}","invitation":{inv},"method":"m","args":{{"k":"v"}}"#)), "box");
        let rep = field(&a.req(&format!(r#""op":"arrive","ward":"{wa}","box":"{bx}""#)), "reply");
        assert_eq!(b.req(&format!(r#""op":"read","ward":"{wb}","invitation":{inv},"reply":"{rep}""#)), want);
    }

    // garbage arrives: a reply of silence's length
    let rep = field(&a.req(&format!(r#""op":"arrive","ward":"{wa}","box":"00ff""#)), "reply");
    assert_eq!(rep.len(), 2 * (16 + 112));

    // errors
    assert_eq!(a.raw("[1]"), r#"{"id":null,"error":"bad request"}"#);
    assert_eq!(a.raw(r#"{"op":"ward"}"#), r#"{"id":null,"error":"bad request"}"#);
    assert_eq!(a.raw(r#"{"id":5,"op":"ward"}"#), r#"{"id":null,"error":"bad request"}"#);
    assert_eq!(a.req(r#""op":"fly""#), r#""error":"no such op""#);
    assert_eq!(a.req(r#""op":"ward","seed":"alpha""#), r#""error":"ward stood""#);
    assert_eq!(a.req(r#""op":"ward","seed":"alpha","reach":"zz""#), r#""error":"not reached""#);
    assert_eq!(a.req(r#""op":"ward","seed":null"#), r#""error":"bad request""#);
    assert_eq!(a.req(r#""op":"ward","seed":"g","reach":null"#), r#""error":"bad request""#);
    assert_eq!(a.req(&format!(r#""op":"invite","ward":"{wa}","heir":"marked""#)), r#""error":"name held""#);
    assert_eq!(a.req(&format!(r#""op":"invite","ward":"{wa}","heir":"marked","reach":"zz""#)), r#""error":"not reached""#);
    assert_eq!(a.req(&format!(r#""op":"invite","ward":"{wb}","heir":"x","reach":"zz""#)), r#""error":"no such ward""#);
    assert_eq!(a.req(&format!(r#""op":"invite","ward":"{}","heir":"x""#, wb.to_uppercase())), r#""error":"bad request""#);
    assert_eq!(a.req(&format!(r#""op":"arrive","ward":"{wa}","box":"0""#)), r#""error":"bad request""#);
    assert_eq!(b.req(&format!(r#""op":"ask","ward":"{wb}","invitation":{{"ward":"{wa}"}}"#)), r#""error":"bad request""#);
    assert_eq!(b.req(&format!(r#""op":"ask","ward":"{wb}","invitation":{inv},"args":[]"#)), r#""error":"bad request""#);
    assert_eq!(b.req(&format!(r#""op":"ask","ward":"{wb}","invitation":{inv},"method":null"#)), r#""error":"bad request""#);
    assert_eq!(b.req(&format!(r#""op":"ask","ward":"{wa}","invitation":{inv}"#)), r#""error":"no such ward""#);
    // a released name may be invited again
    assert!(a.req(&format!(r#""op":"invite","ward":"{wa}","heir":"h1""#)).starts_with("\"invitation\""));

    assert_eq!(a.close(), 0);
    assert_eq!(b.close(), 0);
}

#[test]
fn zero_head_reach_on_ward() {
    let mut a = Stand::new();
    let w = field(&a.req(r#""op":"ward","seed":"z","reach":"echo""#), "ward");
    assert_eq!(w.len(), 128);
    assert_eq!(a.close(), 0);
}

#[test]
fn part_two() {
    let mut a = Stand::new();
    let mut b = Stand::new();
    let wa = field(&a.req(r#""op":"ward","seed":"alpha""#), "ward");
    let wb = field(&b.req(r#""op":"ward","seed":"beta""#), "ward");
    let inv = invitation(&a.req(&format!(r#""op":"invite","ward":"{wa}","heir":"h1","reach":"marked""#)));

    // no route: nothing
    assert_eq!(
        b.req(&format!(r#""op":"send","ward":"{wb}","invitation":{inv},"method":"m""#)),
        r#""read":{"nothing":true}"#
    );

    let at = field(&a.req(r#""op":"listen""#), "at");
    assert_eq!(field(&a.req(r#""op":"listen""#), "at"), at);
    assert_eq!(b.req(&format!(r#""op":"route","far":"{wa}","at":"{at}""#)), format!(r#""routed":"{wa}""#));

    for i in 0..4 {
        assert_eq!(
            b.req(&format!(r#""op":"send","ward":"{wb}","invitation":{inv},"method":"m","args":{{"i":{i}}}"#)),
            format!(r#""read":{{"object":{{"i":{i}}},"seen":"1"}}"#)
        );
    }
    assert_eq!(
        b.req(&format!(r#""op":"send","ward":"{wb}","invitation":{inv}"#)),
        r#""read":{"object":{},"seen":null}"#
    );

    // a ward the listener does not stand: 02, read as nothing
    let wc = field(&b.req(r#""op":"ward","seed":"gamma""#), "ward");
    let inv_c = invitation(&b.req(&format!(r#""op":"invite","ward":"{wc}","heir":"c""#)));
    b.req(&format!(r#""op":"route","far":"{wc}","at":"{at}""#));
    assert_eq!(
        b.req(&format!(r#""op":"send","ward":"{wb}","invitation":{inv_c}"#)),
        r#""read":{"nothing":true}"#
    );
    // route it to itself
    let at_b = field(&b.req(r#""op":"listen""#), "at");
    b.req(&format!(r#""op":"route","far":"{wc}","at":"{at_b}""#));
    assert_eq!(
        b.req(&format!(r#""op":"send","ward":"{wb}","invitation":{inv_c},"method":"x"}}"#).trim_end_matches('}')),
        r#""read":{"object":{},"seen":null}"#
    );

    assert_eq!(a.close(), 0);
    assert_eq!(b.close(), 0);
}
