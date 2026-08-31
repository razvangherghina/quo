//! The notation: a blueprint's canonical text, its digest, and what it refuses.
//!
//! Constitution, Article IV. A blueprint is one canonical text and its digest is
//! SHA-256 over that text as UTF-8. A text that is not already canonical is not
//! canonicalised — it is refused.

use sha2::{Digest, Sha256};

/// The closed types, which no blueprint declares and no record may be named.
pub const CLOSED: [&str; 8] = [
    "bool",
    "int",
    "text",
    "bytes",
    "b32",
    "being",
    "invitation",
    "card",
];

/// A type as it is written: a base name under any stack of combinators.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Type {
    Base(String),
    Many(Box<Type>),
    Maybe(Box<Type>),
}

impl Type {
    fn base(&self) -> &str {
        match self {
            Type::Base(name) => name,
            Type::Many(inner) | Type::Maybe(inner) => inner.base(),
        }
    }

    fn write(&self, out: &mut String) {
        match self {
            Type::Base(name) => out.push_str(name),
            Type::Many(inner) => {
                out.push('[');
                inner.write(out);
                out.push(']');
            }
            Type::Maybe(inner) => {
                inner.write(out);
                out.push('?');
            }
        }
    }
}

/// One argument of a class field: a name and its type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Argument {
    pub name: String,
    pub ty: Type,
}

/// A field of the class block: a name, its arguments, and what it answers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Field {
    pub name: String,
    pub arguments: Vec<Argument>,
    pub answers: Option<Type>,
}

/// A field of a record block: a name and its type. Never parentheses.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Member {
    pub name: String,
    pub ty: Type,
}

/// A record shape the blueprint declares.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Record {
    pub name: String,
    pub members: Vec<Member>,
}

/// A parsed blueprint: a class name, its fields, and the records they use.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Blueprint {
    pub name: String,
    pub fields: Vec<Field>,
    pub records: Vec<Record>,
}

/// Why a text is not a blueprint. The reason is for a reader; the refusal is the fact.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refused(pub String);

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "refused: {}", self.0)
    }
}

impl std::error::Error for Refused {}

type Judged<T> = Result<T, Refused>;

fn refuse<T>(why: &str) -> Judged<T> {
    Err(Refused(why.to_string()))
}

impl Blueprint {
    /// The one canonical text of this blueprint.
    pub fn canonical(&self) -> String {
        let mut out = String::new();
        out.push_str(&self.name);
        out.push('\n');
        for field in &self.fields {
            out.push_str("  ");
            out.push_str(&field.name);
            out.push('(');
            for (index, argument) in field.arguments.iter().enumerate() {
                if index > 0 {
                    out.push_str(", ");
                }
                out.push_str(&argument.name);
                out.push(' ');
                argument.ty.write(&mut out);
            }
            out.push(')');
            if let Some(answers) = &field.answers {
                out.push(' ');
                answers.write(&mut out);
            }
            out.push('\n');
        }
        for record in &self.records {
            out.push('\n');
            out.push_str(&record.name);
            out.push('\n');
            for member in &record.members {
                out.push_str("  ");
                out.push_str(&member.name);
                out.push(' ');
                member.ty.write(&mut out);
                out.push('\n');
            }
        }
        out
    }

    /// The digest: SHA-256 over the canonical text as UTF-8.
    pub fn digest(&self) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(self.canonical().as_bytes());
        hasher.finalize().into()
    }
}

/// Read a blueprint from its text, or refuse it.
pub fn parse(text: &str) -> Judged<Blueprint> {
    let blueprint = read(text)?;
    if blueprint.canonical() != text {
        return refuse("the text is not the canonical text of what it declares");
    }
    Ok(blueprint)
}

/// The digest of a text, which is refused unless it is a canonical blueprint.
pub fn digest(text: &str) -> Judged<[u8; 32]> {
    Ok(parse(text)?.digest())
}

/// The canonical text as hex-free bytes, for a caller that wants what is hashed.
pub fn canonical_bytes(text: &str) -> Judged<Vec<u8>> {
    Ok(parse(text)?.canonical().into_bytes())
}

fn read(text: &str) -> Judged<Blueprint> {
    if text.starts_with('\u{feff}') {
        return refuse("a byte order mark");
    }
    if text.contains('\r') {
        return refuse("a carriage return");
    }
    if text.is_empty() {
        return refuse("an empty text");
    }
    if !text.ends_with('\n') {
        return refuse("no final newline");
    }

    let body = &text[..text.len() - 1];
    let lines: Vec<&str> = body.split('\n').collect();

    let mut blocks: Vec<Vec<&str>> = Vec::new();
    let mut current: Vec<&str> = Vec::new();
    for line in lines {
        if line.is_empty() {
            if current.is_empty() {
                return refuse("a blank line where no block stands");
            }
            blocks.push(std::mem::take(&mut current));
        } else {
            current.push(line);
        }
    }
    if current.is_empty() {
        return refuse("a trailing blank line");
    }
    blocks.push(current);

    let (class, records) = blocks.split_first().expect("at least one block");

    let name = block_name(class)?;
    if CLOSED.contains(&name.as_str()) {
        return refuse("a class wearing the name of a closed type");
    }
    let mut fields: Vec<Field> = Vec::new();
    for line in &class[1..] {
        let field = read_field(indented(line)?)?;
        if fields.iter().any(|kept| kept.name == field.name) {
            return refuse("a field named twice in one block");
        }
        fields.push(field);
    }
    if fields.is_empty() {
        return refuse("an empty block");
    }

    let mut shapes: Vec<Record> = Vec::new();
    for block in records {
        let record_name = block_name(block)?;
        if CLOSED.contains(&record_name.as_str()) {
            return refuse("a record wearing the name of a closed type");
        }
        if record_name == name {
            return refuse("a record wearing the class's own name");
        }
        if shapes.iter().any(|kept| kept.name == record_name) {
            return refuse("a record block declared twice");
        }
        let mut members: Vec<Member> = Vec::new();
        for line in &block[1..] {
            let member = read_member(indented(line)?)?;
            if members.iter().any(|kept| kept.name == member.name) {
                return refuse("a field named twice in one block");
            }
            members.push(member);
        }
        if members.is_empty() {
            return refuse("an empty block");
        }
        shapes.push(Record {
            name: record_name,
            members,
        });
    }

    let blueprint = Blueprint {
        name,
        fields,
        records: shapes,
    };
    check_records(&blueprint)?;
    Ok(blueprint)
}

fn block_name(block: &[&str]) -> Judged<String> {
    let header = block[0];
    if header.starts_with(' ') || header.starts_with('\t') {
        return refuse("a block header that is indented");
    }
    identifier(header)?;
    Ok(header.to_string())
}

fn indented(line: &str) -> Judged<&str> {
    match line.strip_prefix("  ") {
        Some(rest) if !rest.starts_with(' ') && !rest.is_empty() => Ok(rest),
        _ => refuse("a line that is not indented by exactly two spaces"),
    }
}

fn identifier(word: &str) -> Judged<()> {
    let mut bytes = word.bytes();
    match bytes.next() {
        Some(first) if first.is_ascii_alphabetic() => {}
        _ => return refuse("an identifier that does not start with an ASCII letter"),
    }
    if word.bytes().any(|byte| !byte.is_ascii_alphanumeric()) {
        return refuse("an identifier that is not ASCII letters and digits");
    }
    Ok(())
}

fn read_field(line: &str) -> Judged<Field> {
    let open = match line.find('(') {
        Some(at) => at,
        None => return refuse("a class field written without parentheses"),
    };
    let name = &line[..open];
    identifier(name)?;

    let close = match line.find(')') {
        Some(at) => at,
        None => return refuse("a field whose parentheses do not close"),
    };
    if close < open {
        return refuse("a field whose parentheses do not close");
    }
    let inside = &line[open + 1..close];
    let mut arguments: Vec<Argument> = Vec::new();
    if !inside.is_empty() {
        for piece in inside.split(", ") {
            let mut words = piece.split(' ');
            let argument_name = words.next().unwrap_or("");
            let written = match words.next() {
                Some(written) => written,
                None => return refuse("an argument that is a name with no type"),
            };
            if words.next().is_some() {
                return refuse("an argument written with more than two tokens");
            }
            identifier(argument_name)?;
            let ty = read_type(written)?;
            if arguments.iter().any(|kept| kept.name == argument_name) {
                return refuse("an argument named twice in one list");
            }
            arguments.push(Argument {
                name: argument_name.to_string(),
                ty,
            });
        }
    }

    let tail = &line[close + 1..];
    let answers = if tail.is_empty() {
        None
    } else {
        match tail.strip_prefix(' ') {
            Some(written) => Some(read_type(written)?),
            None => return refuse("a field whose answer is not one space from its parentheses"),
        }
    };

    Ok(Field {
        name: name.to_string(),
        arguments,
        answers,
    })
}

fn read_member(line: &str) -> Judged<Member> {
    if line.contains('(') || line.contains(')') {
        return refuse("a record field written with parentheses");
    }
    let mut words = line.split(' ');
    let name = words.next().unwrap_or("");
    let written = match words.next() {
        Some(written) => written,
        None => return refuse("a record field with no type"),
    };
    if words.next().is_some() {
        return refuse("a record field written with more than two tokens");
    }
    identifier(name)?;
    Ok(Member {
        name: name.to_string(),
        ty: read_type(written)?,
    })
}

fn read_type(written: &str) -> Judged<Type> {
    if let Some(inner) = written.strip_suffix('?') {
        if inner.is_empty() {
            return refuse("a combinator with nothing under it");
        }
        return Ok(Type::Maybe(Box::new(read_type(inner)?)));
    }
    if written.starts_with('[') {
        let inner = match written.strip_suffix(']') {
            Some(inner) => &inner[1..],
            None => return refuse("a many that does not close"),
        };
        if inner.is_empty() {
            return refuse("a combinator with nothing under it");
        }
        return Ok(Type::Many(Box::new(read_type(inner)?)));
    }
    identifier(written)?;
    Ok(Type::Base(written.to_string()))
}

/// Every record is used, none reaches itself, and the blocks stand in the
/// derived order: first use, depth-first through the fields.
fn check_records(blueprint: &Blueprint) -> Judged<()> {
    let mut derived: Vec<String> = Vec::new();
    let mut stack: Vec<String> = Vec::new();
    for field in &blueprint.fields {
        for argument in &field.arguments {
            walk(blueprint, argument.ty.base(), &mut derived, &mut stack)?;
        }
        if let Some(answers) = &field.answers {
            walk(blueprint, answers.base(), &mut derived, &mut stack)?;
        }
    }

    let declared: Vec<&str> = blueprint.records.iter().map(|r| r.name.as_str()).collect();
    if derived.len() != declared.len() {
        return refuse("a record nothing uses");
    }
    for (derived_name, declared_name) in derived.iter().zip(declared.iter()) {
        if derived_name != declared_name {
            return refuse("a record block written out of the derived order");
        }
    }
    Ok(())
}

fn walk(
    blueprint: &Blueprint,
    name: &str,
    derived: &mut Vec<String>,
    stack: &mut Vec<String>,
) -> Judged<()> {
    if CLOSED.contains(&name) {
        return Ok(());
    }
    if stack.iter().any(|open| open == name) {
        return refuse("a record that reaches itself");
    }
    let record = match blueprint.records.iter().find(|r| r.name == name) {
        Some(record) => record,
        None => return refuse("a type no block declares"),
    };
    if derived.iter().any(|kept| kept == name) {
        return Ok(());
    }
    derived.push(name.to_string());
    stack.push(name.to_string());
    for member in &record.members {
        walk(blueprint, member.ty.base(), derived, stack)?;
    }
    stack.pop();
    Ok(())
}
