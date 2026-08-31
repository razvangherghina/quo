//! Refusals Article IV names that the pinned corpus does not carry, and the
//! acceptances the grammar allows beside them.

fn accepted(text: &str) {
    let read = quo_notation::parse(text).unwrap_or_else(|why| panic!("{text:?}: {why}"));
    assert_eq!(read.canonical(), text);
}

fn refused(text: &str) {
    assert!(quo_notation::parse(text).is_err(), "{text:?}");
}

#[test]
fn a_record_may_not_wear_a_closed_type_s_name() {
    refused("Order\n  first() text\n\ntext\n  x int\n");
    refused("Order\n  first() being\n\nbeing\n  x int\n");
}

#[test]
fn a_record_may_not_wear_the_class_s_own_name() {
    refused("Order\n  first() Order\n\nOrder\n  x int\n");
}

#[test]
fn a_record_block_may_not_be_declared_twice() {
    refused("Order\n  first() a\n\na\n  x int\n\na\n  y int\n");
}

#[test]
fn an_argument_may_not_be_named_twice_in_one_list() {
    refused("Small\n  pair(one text, one int) bool\n");
}

#[test]
fn the_combinators_compose_freely() {
    accepted("Small\n  a() [int?]\n  b() [int]?\n  c() [[int]]\n  d() [[int]?]?\n");
}

#[test]
fn a_record_used_twice_is_declared_once_at_its_first_use() {
    accepted("Order\n  first() a\n  second() a\n\na\n  x int\n");
    refused("Order\n  first() a\n  second() a\n\na\n  x int\n\na\n  x int\n");
}

#[test]
fn first_use_within_a_field_runs_arguments_then_the_answer() {
    accepted("Order\n  first(one a) b\n\na\n  x int\n\nb\n  y int\n");
    refused("Order\n  first(one a) b\n\nb\n  y int\n\na\n  x int\n");
}

#[test]
fn a_field_may_answer_nothing_and_a_record_field_may_not() {
    accepted("Quiet\n  tell(word text)\n");
    refused("Order\n  first() a\n\na\n  x\n");
}

#[test]
fn a_blueprint_needs_a_class_block_with_at_least_one_field() {
    refused("");
    refused("\n");
    refused("Order\n\na\n  x int\n");
}

#[test]
fn a_leading_blank_line_is_refused() {
    refused("\nSmall\n  yes() bool\n");
}

#[test]
fn a_combinator_with_nothing_under_it_is_refused() {
    refused("Small\n  yes() []\n");
    refused("Small\n  yes() ?\n");
    refused("Small\n  yes() [int\n");
}
