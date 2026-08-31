//! What Article III promises about the common carriage, asserted without a
//! socket: how a hint is read, what the one POST looks like on the wire, and
//! what the carriage does and does not say back. Every case here is read from
//! the law rather than from any implementation, and each is named for the
//! clause it pins.

use quo_carriage as carriage;

// **The hint a warden published is the URL, posted to exactly as given.**

#[test]
fn article_iii_the_hint_is_the_url_and_the_target_is_what_it_carried() {
    let read = carriage::read_hint("https://warden.example/quo/door").expect("a hint");
    assert_eq!(read.scheme, "https");
    assert_eq!(read.host, "warden.example");
    assert_eq!(read.port, 443);
    assert_eq!(read.target, "/quo/door");
}

#[test]
fn article_iii_a_hint_with_a_query_keeps_the_query_it_carried() {
    let read = carriage::read_hint("https://warden.example/door?who=me").expect("a hint");
    assert_eq!(read.target, "/door?who=me");
}

#[test]
fn article_iii_no_path_is_appended_and_no_query_is_added() {
    let read = carriage::read_hint("http://127.0.0.1:8080/one").expect("a hint");
    let request = carriage::request_bytes(&read, b"body");
    let text = String::from_utf8(request).expect("ascii head");
    assert!(text.starts_with("POST /one HTTP/1.1\r\n"), "{text}");
    assert!(!text.contains("/one/"), "nothing is appended: {text}");
    assert!(!text.contains('?'), "nothing is added: {text}");
}

#[test]
fn article_iii_a_hint_with_no_path_posts_to_the_root() {
    let read = carriage::read_hint("http://warden.example").expect("a hint");
    assert_eq!(read.target, "/");
    assert_eq!(read.port, 80);
}

#[test]
fn article_iii_an_ipv6_literal_is_read_in_its_brackets() {
    let read = carriage::read_hint("http://[::1]:9000/door").expect("a hint");
    assert_eq!(read.host, "::1");
    assert_eq!(read.port, 9000);
    let request = String::from_utf8(carriage::request_bytes(&read, b"")).expect("ascii");
    assert!(request.contains("Host: [::1]:9000\r\n"), "{request}");
}

#[test]
fn article_iii_a_hint_the_carriage_does_not_speak_is_refused() {
    for hint in [
        "tcp://warden.example:9000",
        "ftp://warden.example/door",
        "warden.example/door",
        "http://",
        "http://[::1/door",
        "http://warden.example:door/",
        "http://warden.example:99999/",
        "http://who@warden.example/",
    ] {
        assert!(
            carriage::read_hint(hint).is_err(),
            "{hint} is not a hint on the common carriage"
        );
    }
}

// **One POST, bytes in and bytes out.**

#[test]
fn article_iii_the_one_post_carries_the_body_and_says_its_length() {
    let read = carriage::read_hint("http://127.0.0.1:4000/door").expect("a hint");
    let request = carriage::request_bytes(&read, &[1, 2, 3, 4, 5]);
    let text = String::from_utf8_lossy(&request).into_owned();
    assert!(text.starts_with("POST /door HTTP/1.1\r\n"), "{text}");
    assert!(text.contains("Content-Length: 5\r\n"), "{text}");
    assert_eq!(&request[request.len() - 5..], &[1, 2, 3, 4, 5]);
}

// **No status code carries meaning.**

#[test]
fn article_iii_no_status_code_carries_meaning() {
    let under_a_500 = b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 3\r\n\r\nabc";
    let under_a_200 = b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\n\r\nabc";
    assert_eq!(
        carriage::answer_body(under_a_500).expect("a body"),
        carriage::answer_body(under_a_200).expect("a body")
    );
}

#[test]
fn article_iii_an_empty_body_is_silences_wire_form() {
    let silence = b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n";
    assert_eq!(carriage::answer_body(silence).expect("silence"), Vec::new());
}

#[test]
fn article_iii_a_body_the_connection_ended_before_delivering_is_refused() {
    let cut = b"HTTP/1.1 200 OK\r\nContent-Length: 9\r\n\r\nabc";
    assert!(carriage::answer_body(cut).is_err());
}

#[test]
fn article_iii_a_response_that_is_not_http_is_refused() {
    assert!(carriage::answer_body(b"NOPE\r\n\r\nbody").is_err());
    assert!(carriage::answer_body(b"HTTP/1.1 200 OK\r\nno end to the head").is_err());
}

// **TLS is redundant crypto Quo relies on for no guarantee** — and this kit
// carries no TLS crate, so it refuses to pretend rather than dialling plain.

#[test]
fn article_iii_an_https_hint_is_refused_rather_than_dialled_in_the_clear() {
    let refused = carriage::post("https://warden.example/door", b"sealed").expect_err("refused");
    assert!(refused.0.contains("TLS"), "{}", refused.0);
}
