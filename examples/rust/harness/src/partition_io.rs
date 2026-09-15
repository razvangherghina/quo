// SPDX-License-Identifier: Apache-2.0
//! Reading and writing a partition file, section 5 of `HARNESS.md`. The
//! kit's `Partition` goes to values and comes back from them; this module
//! only puts those values in a file and takes them out again.
//!
//! A cell holds a value of depth up to sixty-four, so the partition around
//! it nests deeper than the value rule reads in one piece. The file writes
//! each cell, and each field of the ward's two records, as its own JSON text,
//! and reads each back as a value on its own.

use quo_kit::value::{Map, Value};
use quo_kit::ward::{Partition, WARD_KEYS};

pub fn load(text: &str) -> Result<Partition, String> {
    let value = Value::parse(text).map_err(|e| e.to_string())?;
    let mut root = obj(&value)?.clone();
    let mut beings = Map::new();
    for (name, saved) in obj(root.get("beings").unwrap_or(&Value::Object(Map::new())))?.iter() {
        beings.insert(name, cells_from_file(saved)?);
    }
    root.insert("beings", Value::Object(beings));
    Partition::from_value(&Value::Object(root)).map_err(|e| e.to_string())
}

pub fn save(partition: &Partition) -> String {
    let mut root = match partition.to_value() {
        Value::Object(m) => m,
        _ => unreachable!("a partition is an object"),
    };
    let mut beings = Map::new();
    for (name, cells) in root.get("beings").and_then(Value::as_object).into_iter().flat_map(|m| m.iter()) {
        let mut out = Map::new();
        for (key, value) in cells.as_object().into_iter().flat_map(|m| m.iter()) {
            if WARD_KEYS.contains(&key) {
                let mut records = Map::new();
                for (id, record) in value.as_object().into_iter().flat_map(|m| m.iter()) {
                    let mut fields = Map::new();
                    for (field, v) in record.as_object().into_iter().flat_map(|m| m.iter()) {
                        fields.insert(field, v.to_json());
                    }
                    records.insert(id, Value::Object(fields));
                }
                out.insert(key, Value::Object(records));
            } else {
                out.insert(key, value.to_json());
            }
        }
        beings.insert(name, Value::Object(out));
    }
    root.insert("beings", Value::Object(beings));
    Value::Object(root).to_json()
}

/// One being's cells as the file holds them, each text read back as a value.
fn cells_from_file(saved: &Value) -> Result<Value, String> {
    let parse = |t: &Value| Value::parse(&text(t)?).map_err(|e| e.to_string());
    let mut cells = Map::new();
    for (key, value) in obj(saved)?.iter() {
        if WARD_KEYS.contains(&key) {
            let mut records = Map::new();
            for (id, fields) in obj(value)?.iter() {
                let mut record = Map::new();
                for (field, t) in obj(fields)?.iter() {
                    record.insert(field, parse(t)?);
                }
                records.insert(id, Value::Object(record));
            }
            cells.insert(key, Value::Object(records));
        } else {
            cells.insert(key, parse(value)?);
        }
    }
    Ok(Value::Object(cells))
}

fn obj(v: &Value) -> Result<&Map, String> {
    v.as_object().ok_or_else(|| "not an object".to_owned())
}

fn text(v: &Value) -> Result<String, String> {
    v.as_str().map(str::to_owned).ok_or_else(|| "not a string".to_owned())
}
