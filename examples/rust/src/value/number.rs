// SPDX-License-Identifier: Apache-2.0
//! A number that is a value: a finite double, never minus zero.

use super::ValueError;
use std::fmt;

/// A finite IEEE double that is not minus zero. Whole or not is a question
/// about the value, never about how its text was spelled.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Number(f64);

const EXACT: f64 = 9_007_199_254_740_992.0; // 2^53

impl Number {
    /// The integer as a value, or `None` when a double would not hold it
    /// exactly.
    pub fn from_u64(u: u64) -> Option<Number> {
        let f = u as f64;
        (f <= EXACT && f as u64 == u).then_some(Number(f))
    }

    /// Whether the value is an integer.
    pub fn is_whole(self) -> bool {
        self.0.fract() == 0.0
    }

    /// The value as an unsigned integer, when it is whole, exact and not
    /// negative.
    pub fn as_u64(self) -> Option<u64> {
        (self.is_whole() && self.0 >= 0.0 && self.0 <= EXACT).then_some(self.0 as u64)
    }

    /// Reads the text of a JSON number, already known to be in JSON's
    /// grammar, by the value rule: a negative zero is refused, and so is any
    /// text naming an integer no double holds exactly, a value past the
    /// doubles, and a non-zero value that rounds to zero. A fraction is held
    /// to the double nearest it.
    pub(crate) fn from_json_text(text: &str) -> Result<Number, ValueError> {
        let negative = text.starts_with('-');
        let body = text.trim_start_matches('-');
        let (mantissa, exponent) = match body.find(['e', 'E']) {
            Some(at) => (&body[..at], &body[at + 1..]),
            None => (body, ""),
        };
        let (int, frac) = match mantissa.find('.') {
            Some(at) => (&mantissa[..at], &mantissa[at + 1..]),
            None => (mantissa, ""),
        };
        let digits: String = format!("{int}{frac}").trim_start_matches('0').to_owned();
        if digits.is_empty() {
            return if negative { Err(ValueError::MinusZero) } else { Ok(Number(0.0)) };
        }
        let refuse = || ValueError::NotDouble(text.to_owned());
        let f: f64 = text.parse().map_err(|_| refuse())?;
        if !f.is_finite() || f == 0.0 {
            return Err(refuse());
        }
        let significant = digits.trim_end_matches('0');
        let trailing = (digits.len() - significant.len()) as i64;
        let exp: i64 = {
            let (sign, mag) = match exponent.strip_prefix('-') {
                Some(m) => (-1, m),
                None => (1, exponent.trim_start_matches('+')),
            };
            let mag = mag.trim_start_matches('0');
            // Past a few thousand the double is already infinite or zero.
            if mag.len() > 6 {
                sign * 1_000_000
            } else {
                sign * mag.parse::<i64>().unwrap_or(0)
            }
        };
        let power = exp - frac.len() as i64 + trailing;
        if power >= 0 {
            if significant.len() as i64 + power > 400 {
                return Err(refuse());
            }
            // The double holds the integer when it is the double's exact
            // value, or the shortest decimal the double is written as, which
            // is how every double is spelled when it is written.
            let (shortest, shortest_power) = shortest_digits(f.abs());
            let named = format!("{significant}{}", "0".repeat(power as usize));
            if (significant, power) != (shortest.as_str(), shortest_power) && named != format!("{:.0}", f.abs()) {
                return Err(refuse());
            }
        }
        Ok(Number(f))
    }
}

/// The double as a value: NaN, an infinity and minus zero are no number.
impl TryFrom<f64> for Number {
    type Error = ValueError;
    fn try_from(f: f64) -> Result<Number, ValueError> {
        if f == 0.0 && f.is_sign_negative() {
            return Err(ValueError::MinusZero);
        }
        if !f.is_finite() {
            return Err(ValueError::NotDouble(f.to_string()));
        }
        Ok(Number(f))
    }
}

/// The number as ECMAScript's Number::toString writes it, which is what
/// RFC 8785 adopts.
impl fmt::Display for Number {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&es_number(self.0))
    }
}

/// The shortest digits that read back to `x`, positive and non-zero, with no
/// trailing zero, and the power of ten they are scaled by.
fn shortest_digits(x: f64) -> (String, i64) {
    let sci = format!("{x:e}");
    let (mantissa, exp) = sci.split_once('e').expect("exponent form");
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let significant = digits.trim_end_matches('0').to_owned();
    let power = exp.parse::<i64>().expect("exponent") - (significant.len() as i64 - 1);
    (significant, power)
}

fn es_number(x: f64) -> String {
    if x == 0.0 {
        return "0".to_owned();
    }
    // The digits are the shortest that read back to the same double, which
    // are the digits ECMAScript writes.
    let sci = format!("{:e}", x.abs());
    let (mantissa, exp) = sci.split_once('e').expect("exponent form");
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i64;
    let n = exp.parse::<i64>().expect("exponent") + 1;
    let mut out = String::new();
    if x < 0.0 {
        out.push('-');
    }
    if k <= n && n <= 21 {
        out.push_str(&digits);
        out.push_str(&"0".repeat((n - k) as usize));
    } else if 0 < n && n <= 21 {
        out.push_str(&digits[..n as usize]);
        out.push('.');
        out.push_str(&digits[n as usize..]);
    } else if -6 < n && n <= 0 {
        out.push_str("0.");
        out.push_str(&"0".repeat((-n) as usize));
        out.push_str(&digits);
    } else {
        let e = n - 1;
        out.push_str(&digits[..1]);
        if k > 1 {
            out.push('.');
            out.push_str(&digits[1..]);
        }
        out.push('e');
        out.push(if e < 0 { '-' } else { '+' });
        out.push_str(&e.abs().to_string());
    }
    out
}
