// SPDX-License-Identifier: Apache-2.0
//! The unsealed ask: method and args in, and what the ward is asked for.
//! Judgment, catching and the three answers are not skipped on it, and an
//! ask the ward cannot answer is silence.

use super::*;

pub(super) fn ask(core: &Rc<Core>, method: Option<&str>, args: Option<&Map>) -> Answer {
    let empty = Map::new();
    let args = args.unwrap_or(&empty);
    let text = |field: &str| args.get(field).and_then(Value::as_str);
    let object = |field: &str| args.get(field).and_then(Value::as_object);
    match method {
        None => describe(core),
        Some("boot") => match (text("key"), text("class")) {
            (Some(key), Some(class)) => match core.make(class, key) {
                Some(key) => Answer::Value(key.into()),
                None => Answer::Silence,
            },
            _ => Answer::Silence,
        },
        Some("public") => match args.get("key") {
            Some(Value::Null) => {
                core.partition.borrow_mut().public = None;
                Answer::Value(Value::Null)
            }
            Some(Value::String(key)) if core.being(key).is_some() => {
                core.partition.borrow_mut().public = Some(key.clone());
                Answer::Value(key.as_str().into())
            }
            _ => Answer::Silence,
        },
        Some("invite") => match (text("being"), text("id")) {
            (Some(being), Some(id)) => match core.invite(being, id, args.get("notes").cloned()) {
                Some(invitation) => Answer::Value(invitation),
                None => Answer::Silence,
            },
            _ => Answer::Silence,
        },
        Some("knock") => {
            let (Some(being), Some(id), Some(invitation)) = (text("being"), text("id"), args.get("invitation")) else {
                return Answer::Silence;
            };
            if core.being(being).is_none() {
                return Answer::Silence;
            }
            match send::knock(core, being, invitation, text("method"), object("args"), Core::allowance(object("wanted"))) {
                Answer::Value(object) => {
                    let mut map = Map::new();
                    map.insert("taken", core.take(being, id, invitation));
                    map.insert("answer", object);
                    Answer::Value(Value::Object(map))
                }
                other => other,
            }
        }
        Some("remove") => match (text("being"), text("id")) {
            (Some(being), Some(id)) if core.partition.borrow().beings.contains_key(being) => Answer::Value(if core.remove(being, id) { Value::from(id) } else { Value::Null }),
            _ => Answer::Silence,
        },
        // The root asks a being it names, as the root: the ward speaking to
        // her on behalf of whoever holds its unsealed ask.
        Some("ask") => match text("being").and_then(|k| core.being(k)) {
            Some(being) => door::dispatch(&being, &Asker::Root, text("method"), object("args")),
            None => Answer::Silence,
        },
        Some(_) => Answer::Silence,
    }
}

fn describe(core: &Rc<Core>) -> Answer {
    let names = ["boot", "public", "invite", "knock", "remove", "ask"];
    let asks = names
        .iter()
        .map(|name| {
            let mut input = Map::new();
            input.insert("type", "object");
            let mut ask = Map::new();
            ask.insert("name", *name);
            ask.insert("input", input);
            Value::Object(ask)
        })
        .collect::<Vec<_>>();
    // Read the rows first: a describe may read her cells again.
    let (rows, public) = {
        let p = core.partition.borrow();
        let rows: Vec<(String, Option<String>)> = p.beings.keys().map(|k| (k.clone(), p.classes.get(k).cloned())).collect();
        (rows, p.public.clone())
    };
    let mut beings = Map::new();
    for (key, class) in &rows {
        let mut row = Map::new();
        row.insert("class", class.clone());
        row.insert("public", public.as_deref() == Some(key.as_str()));
        match core.being(key) {
            Some(being) => {
                row.insert("digest", door::describe(&being, &Asker::Root));
            }
            None => {
                row.insert("digest", Value::Null);
                row.insert("absent", true);
            }
        }
        beings.insert(key.as_str(), row);
    }
    let mut notes = Map::new();
    notes.insert("pk", core.pk.to_string());
    notes.insert("beings", beings);
    let mut map = Map::new();
    map.insert("asks", asks);
    map.insert("notes", notes);
    Answer::Value(Value::Object(map))
}
