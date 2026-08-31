//! The warden: the door, and the judgment everything arriving at it is put
//! through.
//!
//! Constitution, Article IX — the warden is a being and here is its blueprint
//! — with Article VII for the two records it keeps, Article VIII for the seq
//! and the leash, Article X for the three describes, and Article XII for the
//! judgment's eight steps in their order.
//!
//! **Every failure is the same failure**: the door answers with silence and
//! never says which step it was. A [`Refused`] carries a reason for a reader
//! and for nobody on the wire.
//!
//! **This crate is the door's judgment, not the road.** Nothing here opens a
//! socket, reads a clock or draws a random number: the arrival reading, the
//! onward reading and every key minted arrive as arguments, which is what
//! lets a whole judgment be reproduced rather than merely exercised.

pub mod shape;

use quo_arithmetic::commitment;
use quo_envelope::{Answer, Message, Method, Say};
use quo_wire::Value;

pub use quo_envelope::{Allowance, Answer as SealedAnswer, Method as Field};
/// The five things a holder holds. It is `remember`'s one argument, so a
/// caller of this crate never has to reach for the wire crate itself.
pub use quo_wire::Invitation;
pub use shape::{
    warden_blueprint, warden_digest, Cargo, Class, Estate, Held, Relation, Sketch, Standing, Word,
    WARDEN_BLUEPRINT,
};

/// A key is 32 bytes, as it is everywhere in the kit.
pub const KEY: usize = quo_arithmetic::KEY;

/// Why a message is not judged, or a describe is not answered. On the wire
/// every one of these is the same silence; the reason is for a reader alone.
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

/// A being this warden holds: the being's name, the digest of its blueprint,
/// its heir commitment, and its own cells.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resident {
    pub being: [u8; KEY],
    pub digest: [u8; KEY],
    pub commitment: [u8; KEY],
    pub cells: Vec<u8>,
}

/// One inbound row as the door keeps it. It is not the `standing` record:
/// the record is what travels in a cargo, and a door's row carries one thing
/// more than the record does today.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Inbound {
    pub voice: [u8; KEY],
    pub commitment: [u8; KEY],
    /// The door name this heir commitment was hashed under. **Every
    /// commitment was hashed with the door's name inside it**, so a door that
    /// succeeded its name keeps verifying an older standing's heir at the
    /// name it was minted at, and mints new commitments under the new one —
    /// Article XIV.
    pub minted_at: [u8; KEY],
    pub beings: Vec<[u8; KEY]>,
    pub mark: i64,
    pub spent: Vec<i64>,
    pub padlock: Option<[u8; KEY]>,
    pub hints: Vec<String>,
}

impl Inbound {
    /// The row a `standing` record becomes when it arrives in a cargo. The
    /// name each commitment was minted at travels with the record, so a
    /// standing that arrives still rotates at the name it was granted under
    /// rather than at the taking door's.
    pub fn from_standing(standing: &Standing) -> Inbound {
        Inbound {
            voice: standing.voice,
            commitment: standing.commitment,
            minted_at: standing.name,
            beings: standing.beings.clone(),
            mark: standing.mark,
            spent: standing.spent.clone(),
            padlock: standing.padlock,
            hints: standing.hints.clone(),
        }
    }

    /// The record this row travels as.
    pub fn standing(&self) -> Standing {
        Standing {
            voice: self.voice,
            commitment: self.commitment,
            name: self.minted_at,
            beings: self.beings.clone(),
            mark: self.mark,
            spent: self.spent.clone(),
            padlock: self.padlock,
            hints: self.hints.clone(),
        }
    }
}

/// One outbound row as the door keeps it: the invitation whole, and **two
/// counters, because one field cannot be two counters** — what this door has
/// sent that peer, and the mark it keeps against that peer's news.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outbound {
    pub warden: [u8; KEY],
    pub commitment: [u8; KEY],
    pub padlock: [u8; KEY],
    pub voice: [u8; KEY],
    pub secret: [u8; KEY],
    pub heir: [u8; KEY],
    pub heir_secret: [u8; KEY],
    /// The count kept against that far door for what this door sends.
    pub seq: i64,
    /// The mark kept for that far warden's news — Article XIV.
    pub news: i64,
    pub hints: Vec<String>,
}

impl Outbound {
    /// The row a `relation` record becomes when it arrives in a cargo. Both
    /// counters travel, so a peer's numbers stay spent across the move rather
    /// than coming round again at the new door.
    pub fn from_relation(relation: &Relation) -> Outbound {
        Outbound {
            warden: relation.warden,
            commitment: relation.commitment,
            padlock: relation.padlock,
            voice: relation.voice,
            secret: relation.secret,
            heir: relation.heir,
            heir_secret: relation.heir_secret,
            seq: relation.seq,
            news: 0,
            hints: relation.hints.clone(),
        }
    }

    /// The record this row travels as.
    pub fn relation(&self) -> Relation {
        Relation {
            warden: self.warden,
            commitment: self.commitment,
            padlock: self.padlock,
            voice: self.voice,
            secret: self.secret,
            heir: self.heir,
            heir_secret: self.heir_secret,
            seq: self.seq,
            news: self.news,
            hints: self.hints.clone(),
        }
    }
}

/// Where the voice was found, which is the whole of what a message's kind is.
/// **Nothing in the message marks it**; the kind is read off the voice.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Placement {
    /// Found as a current holder in the inbound record.
    Ask { standing: usize },
    /// Not found there, but its hash matched a standing's heir commitment.
    /// The standing has already changed hands by the time this is returned.
    Rotation { standing: usize },
    /// Found in the outbound record, as a warden this door holds a relation
    /// with or as the heir it committed.
    News { relation: usize, by_heir: bool },
    /// Nowhere: a standing at nothing.
    Stranger,
}

/// Where step seven sends the call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Route {
    /// Neither being nor method: the warden describes the estate, which means
    /// what that voice may reach.
    Estate,
    /// A being and no method: the warden describes that one being.
    Sketch { being: [u8; KEY] },
    /// The warden's own being answers. It answers to two addresses — named,
    /// and omitted — and nothing here can diverge between them.
    Warden { method: Method },
    /// The being is invoked and answers. That answer is not the warden's.
    Being { being: [u8; KEY], method: Method },
}

/// What the first seven steps produced. Steps one through six are the
/// warden's alone, and the being never learns that any of them happened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Verdict {
    pub say: Say,
    pub place: Placement,
    pub route: Route,
    /// The leash as it was judged: what arrived, which is what step six spent.
    pub leash: Allowance,
    /// The arrival reading, kept so the onward leash can be computed against
    /// the reading taken when the call is handed onward.
    pub arrival: i64,
}

/// A door: one warden, its beings, and its two records.
#[derive(Debug, Clone)]
pub struct Warden {
    /// The warden's name, which is also its public being's pk.
    pub name: [u8; KEY],
    /// The secret half of the name, which signs every answer.
    pub name_secret: [u8; KEY],
    /// The padlock every message to this ground is sealed with.
    pub padlock: [u8; KEY],
    /// The secret that opens what arrives.
    pub padlock_secret: [u8; KEY],
    /// The largest message this door will accept, counted in bytes of the
    /// whole envelope as the carriage delivers it.
    pub limit: i64,
    /// How many numbers below the mark this door remembers. How wide the
    /// window is, is the warden's own.
    pub window: i64,
    pub beings: Vec<Resident>,
    /// The blueprint texts this door holds, which is what `blueprint` hands
    /// back and what `receive` is judged against.
    pub blueprints: Vec<String>,
    /// Which voices may reach which of its beings.
    pub inbound: Vec<Inbound>,
    /// Which of its beings may spend which relation.
    pub outbound: Vec<Outbound>,
    /// The successions this door published for beings that have moved. The
    /// old door only points.
    pub moved: Vec<([u8; KEY], Word)>,
}

impl Warden {
    /// A door with its public being standing and nothing else. The public
    /// being's pk is the warden's own name, and the two are one key.
    pub fn new(
        name_secret: [u8; KEY],
        padlock_secret: [u8; KEY],
        own_commitment: [u8; KEY],
        limit: i64,
        window: i64,
    ) -> Self {
        let name = quo_arithmetic::signing_pk(&name_secret);
        Warden {
            name,
            name_secret,
            padlock: quo_arithmetic::sealing_pk(&padlock_secret),
            padlock_secret,
            limit,
            window,
            beings: vec![Resident {
                being: name,
                digest: warden_digest(),
                commitment: own_commitment,
                cells: Vec::new(),
            }],
            blueprints: vec![WARDEN_BLUEPRINT.to_string()],
            inbound: Vec::new(),
            outbound: Vec::new(),
            moved: Vec::new(),
        }
    }

    fn resident(&self, being: &[u8; KEY]) -> Option<&Resident> {
        self.beings.iter().find(|held| &held.being == being)
    }

    /// Whether this voice may reach this being. **The public being is
    /// reachable by everyone, holders included**, and being public is not a
    /// flag on anything — it is this one identity.
    pub fn reaches(&self, voice: &[u8; KEY], being: &[u8; KEY]) -> bool {
        if being == &self.name {
            return true;
        }
        self.inbound
            .iter()
            .find(|row| &row.voice == voice)
            .is_some_and(|row| row.beings.contains(being))
    }

    // ---- Article X, the describe -------------------------------------

    /// Every being this voice may reach, in the derived order. **A stranger's
    /// estate is the warden's own public being**, which falls out of
    /// reachability rather than being a case of its own.
    pub fn estate_for(&self, voice: &[u8; KEY]) -> Estate {
        let mut reachable: Vec<&Resident> = vec![self
            .resident(&self.name)
            .expect("the public being always stands")];
        if let Some(row) = self.inbound.iter().find(|row| &row.voice == voice) {
            for being in &row.beings {
                if being == &self.name {
                    continue;
                }
                if let Some(held) = self.resident(being) {
                    reachable.push(held);
                }
            }
        }

        let mut classes: Vec<Class> = Vec::new();
        for held in reachable {
            let entry = Held {
                being: held.being,
                commitment: held.commitment,
            };
            match classes.iter_mut().find(|class| class.digest == held.digest) {
                Some(class) => class.beings.push(entry),
                None => classes.push(Class {
                    digest: held.digest,
                    beings: vec![entry],
                }),
            }
        }
        order(Estate { classes })
    }

    /// The describe of one being. Silence for what this voice may not reach;
    /// absence is a legal answer about a being it reaches and this door no
    /// longer holds.
    pub fn sketch_for(&self, voice: &[u8; KEY], being: &[u8; KEY]) -> Judged<Option<Sketch>> {
        if !self.reaches(voice, being) {
            return refuse("a sketch of a being this voice may not reach");
        }
        Ok(self.resident(being).map(|held| Sketch {
            being: held.being,
            digest: held.digest,
            commitment: held.commitment,
        }))
    }

    /// A blueprint, asked for by its digest, and answered only if the asker
    /// already reaches a being of that class or the warden's own public being
    /// declares it. Otherwise silence.
    pub fn blueprint_for(&self, voice: &[u8; KEY], digest: &[u8; KEY]) -> Judged<Option<String>> {
        let allowed = digest == &warden_digest()
            || self
                .beings
                .iter()
                .any(|held| &held.digest == digest && self.reaches(voice, &held.being));
        if !allowed {
            return refuse("a blueprint of a class this voice reaches nothing of");
        }
        Ok(self
            .blueprints
            .iter()
            .find(|text| {
                &quo_notation::digest(text).expect("a blueprint this door holds") == digest
            })
            .cloned())
    }

    /// The old door's pointer. **Absence is a legal answer** — nothing has
    /// moved — but only about a being this voice may reach; a door that
    /// answered absent about a being you do not reach would be a door
    /// confirming that being exists.
    pub fn moved_for(&self, voice: &[u8; KEY], being: &[u8; KEY]) -> Judged<Option<Word>> {
        if !self.reaches(voice, being) {
            return refuse("a pointer for a being this voice may not reach");
        }
        Ok(self
            .moved
            .iter()
            .find(|(moved, _)| moved == being)
            .map(|(_, word)| word.clone()))
    }

    // ---- Article XII, the judgment -----------------------------------

    /// Steps one through seven, in order. The arrival reading is taken at the
    /// first step, before anything is unsealed, and is handed in here.
    pub fn judge(&mut self, envelope: &[u8], arrival: i64) -> Judged<Verdict> {
        // The one fact this law makes a warden publish about itself is the
        // largest message it will accept, counted in bytes of the whole
        // envelope. A message beyond it is not accepted, so it is not judged.
        if i64::try_from(envelope.len()).is_err() || envelope.len() as i64 > self.limit {
            return refuse("an envelope beyond the limit this door publishes");
        }

        // 1 and 2. Unseal, decode, and verify the signature over the payload
        // using the voice the payload carries. At a door the leading byte
        // must say `say`.
        let say = quo_envelope::open_at_door(&self.padlock_secret, envelope)
            .map_err(|why| Refused(why.0))?;

        // 3. Check the recipient, here and not later: a payload addressed
        // elsewhere must never touch this house's records.
        if say.recipient != self.name && say.recipient != self.padlock {
            return refuse("a message addressed to another door");
        }

        // 4. Place the voice, in the two records and in that order.
        let place = self.place(&say)?;

        // 5. Spend the seq. Honoured means consumed, and nothing later gives
        // it back — which is why this stands before the leash and the route.
        self.spend_seq(&say, place)?;

        // The way back is refreshed here, between the seq and the leash: the
        // padlock and hints the payload carried replace what the row held. Not
        // earlier, because a replayed message would otherwise rewrite a live
        // way back with a retired one, and the seq is what tells a replay from
        // a call. Not later, because a message refused for its leash still
        // arrived and still spent its number — a door that refreshed only what
        // it went on to route would slowly lose the way back to any peer whose
        // calls it keeps refusing, and news is what that peer would stop
        // receiving.
        if let Placement::Ask { standing } | Placement::Rotation { standing } = place {
            self.remember_way_back(standing, &say);
        }

        // 6. Spend the leash, judged on what arrived.
        spend_leash(&say.allowance)?;

        // 7. Route.
        let route = self.route(&say)?;

        Ok(Verdict {
            say: say.clone(),
            place,
            route,
            leash: say.allowance,
            arrival,
        })
    }

    fn place(&mut self, say: &Say) -> Judged<Placement> {
        // Found as a current holder in the inbound record: an ask. A plain
        // ask carrying a commitment is refused — Article XI.
        if let Some(at) = self.inbound.iter().position(|row| row.voice == say.voice) {
            if say.commitment.is_some() {
                return refuse("a plain ask carrying a commitment");
            }
            return Ok(Placement::Ask { standing: at });
        }

        // Not found there, but its hash matches a standing's heir commitment:
        // a rotation, and the standing changes hands before anything else is
        // judged.
        //
        // Hashed against the name that row's commitment was minted under,
        // never this door's current name: after a name succession an older
        // standing must still be able to rotate. New commitments are filed
        // under the name the door has now, so the rotation after this one
        // matches at the new name.
        if let Some(at) = self
            .inbound
            .iter()
            .position(|row| commitment(&row.minted_at, &say.voice) == row.commitment)
        {
            let Some(next) = say.commitment else {
                // Every rotation carries a fresh commitment, or a standing
                // could be taken over once and never again.
                return refuse("a rotation carrying no fresh commitment");
            };
            let name = self.name;
            let row = &mut self.inbound[at];
            row.voice = say.voice;
            row.commitment = next;
            row.minted_at = name;
            // A rotation starts the mark fresh.
            row.mark = 0;
            row.spent.clear();
            return Ok(Placement::Rotation { standing: at });
        }

        // Found in the outbound record — as a warden this door holds a
        // relation with, or as the heir it committed — is news.
        if let Some(at) = self.outbound.iter().position(|row| row.warden == say.voice) {
            return Ok(Placement::News {
                relation: at,
                by_heir: false,
            });
        }
        if let Some(at) = self
            .outbound
            .iter()
            .position(|row| commitment(&row.warden, &say.voice) == row.commitment)
        {
            return Ok(Placement::News {
                relation: at,
                by_heir: true,
            });
        }

        // Nowhere: the stranger's case, which is a standing at nothing.
        Ok(Placement::Stranger)
    }

    /// An inbound row keeps a way back and not only a permission, and the way
    /// back is refreshed by every call that arrives. **An empty hints list
    /// means the road did not change, never an erasure**: a dialing end
    /// publishes nothing by nature, and a door that erased on that would
    /// destroy its own way back to that peer on the peer's first ask.
    fn remember_way_back(&mut self, at: usize, say: &Say) {
        let row = &mut self.inbound[at];
        row.padlock = Some(say.padlock);
        if !say.hints.is_empty() {
            row.hints = say.hints.clone();
        }
    }

    fn spend_seq(&mut self, say: &Say, place: Placement) -> Judged<()> {
        match place {
            Placement::Ask { standing } | Placement::Rotation { standing } => {
                let window = self.window;
                spend(&mut self.inbound[standing], say.seq, window)
            }
            Placement::News { relation, .. } => {
                // News is counted too, against the mark kept for that far
                // warden — which is its own counter and never the one this
                // door sends by. That mark is one number and no spent set, so
                // a number that does not rise is silence.
                let row = &mut self.outbound[relation];
                if say.seq < 1 || say.seq <= row.news {
                    return refuse("a news number that does not rise");
                }
                row.news = say.seq;
                Ok(())
            }
            // A stranger spends nothing: it has no row, so no mark is kept
            // for it and its numbers are not counted.
            Placement::Stranger => Ok(()),
        }
    }

    fn route(&self, say: &Say) -> Judged<Route> {
        let voice = say.voice;
        match (say.being, say.method.clone()) {
            // Being and method: the being is invoked and answers — unless the
            // being named is the warden's own, which answers to two
            // addresses.
            (Some(being), Some(method)) => {
                if being == self.name {
                    return Ok(Route::Warden { method });
                }
                if !self.reaches(&voice, &being) {
                    return refuse("a being this voice may not reach");
                }
                // The old door only points: it answers `moved` with the
                // succession and every other ask meets silence. An answer's
                // data is the field's declared answer type, and a succession
                // is not that type, so the word cannot be put where the caller
                // asked for the work. A peer that never asks `moved` learns by
                // news.
                if self.moved.iter().any(|(gone, _)| *gone == being) {
                    return refuse("a being that has moved: the old door only points");
                }
                Ok(Route::Being { being, method })
            }
            // Being, no method: the warden describes that one being.
            (Some(being), None) => {
                if !self.reaches(&voice, &being) {
                    return refuse("a being this voice may not reach");
                }
                Ok(Route::Sketch { being })
            }
            // Method, no being: the warden's own being answers. This is where
            // news arrives, as `tell`.
            (None, Some(method)) => Ok(Route::Warden { method }),
            // Neither: the warden describes the estate, which for a voice
            // with no standing anywhere is its own public being.
            (None, None) => Ok(Route::Estate),
        }
    }

    /// Step seven's answer, for everything the warden answers itself. A route
    /// to a being is not the warden's to answer and is refused here.
    ///
    /// `mint` is the key `receive` commits to — the one the destination
    /// minted and the origin never saw. Every draw is an argument in this
    /// kit, and this is the only field that takes one.
    pub fn answer(
        &mut self,
        verdict: &Verdict,
        mint: Option<&[u8; KEY]>,
    ) -> Judged<Option<Vec<u8>>> {
        let voice = verdict.say.voice;
        match &verdict.route {
            Route::Estate => {
                let field = shape::field("describe")?;
                shape::write_answer(field, Some(self.estate_for(&voice).value()))
            }
            Route::Sketch { being } => {
                let field = shape::field("sketch")?;
                let sketch = self.sketch_for(&voice, being)?;
                shape::write_answer(
                    field,
                    Some(Value::Maybe(sketch.map(|s| Box::new(s.value())))),
                )
            }
            Route::Warden { method } => self.answer_own(verdict, method, mint),
            Route::Being { .. } => refuse("a being's answer is never the warden's"),
        }
    }

    fn answer_own(
        &mut self,
        verdict: &Verdict,
        method: &Method,
        mint: Option<&[u8; KEY]>,
    ) -> Judged<Option<Vec<u8>>> {
        let voice = verdict.say.voice;
        let field = shape::field(&method.name)?;
        let args = shape::read_args(field, &method.args)?;

        match method.name.as_str() {
            "describe" => shape::write_answer(field, Some(self.estate_for(&voice).value())),
            "limit" => shape::write_answer(field, Some(Value::Int(self.limit))),
            "sketch" => {
                let being = read_key(args.as_ref())?;
                let sketch = self.sketch_for(&voice, &being)?;
                shape::write_answer(
                    field,
                    Some(Value::Maybe(sketch.map(|s| Box::new(s.value())))),
                )
            }
            "blueprint" => {
                let digest = read_key(args.as_ref())?;
                let text = self.blueprint_for(&voice, &digest)?;
                shape::write_answer(
                    field,
                    Some(Value::Maybe(text.map(|text| Box::new(Value::Text(text))))),
                )
            }
            "moved" => {
                let being = read_key(args.as_ref())?;
                let word = self.moved_for(&voice, &being)?;
                shape::write_answer(
                    field,
                    Some(Value::Maybe(word.map(|word| Box::new(word.value())))),
                )
            }
            "tell" => {
                let word = shape::as_word(
                    args.as_ref()
                        .ok_or_else(|| Refused("a tell with no word".to_string()))?,
                )?;
                self.believe(verdict.place, &word)?;
                shape::write_answer(field, None)
            }
            "receive" => {
                let cargo = shape::as_cargo(
                    args.as_ref()
                        .ok_or_else(|| Refused("a receive with no cargo".to_string()))?,
                )?;
                let Some(mint) = mint else {
                    return refuse("a receive with no key minted for it");
                };
                let answered = self.receive(&cargo, mint)?;
                shape::write_answer(field, Some(Value::B32(answered)))
            }
            _ => refuse("a field the warden's blueprint does not declare"),
        }
    }

    /// Step eight. Sealed to the return padlock the payload carried, and
    /// signed by the warden's own name. **The answer names the ask by its
    /// seq, and that is the whole of it.**
    pub fn reply(
        &self,
        say: &Say,
        data: Option<Vec<u8>>,
        ephemeral_secret: &[u8; KEY],
    ) -> Judged<Vec<u8>> {
        let answer = Answer {
            warden: self.name,
            seq: say.seq,
            data,
        };
        quo_envelope::seal(
            &self.name_secret,
            ephemeral_secret,
            &say.padlock,
            &Message::Answer(answer),
        )
        .map_err(|why| Refused(why.0))
    }

    // ---- Article XIV, the news ---------------------------------------

    /// Believe a word, or refuse it. **A peer believes it by a key it already
    /// holds, and there are only two**: a signing key succeeded is believed
    /// by the heir it committed, and a padlock replaced is believed by the
    /// name, which has not moved. Anything else is silence.
    ///
    /// **Believed news rewrites the outbound row entire**, one for one off
    /// the word's own fields; an empty hints list means the road did not
    /// change, never an erasure.
    pub fn believe(&mut self, place: Placement, word: &Word) -> Judged<()> {
        let Placement::News { relation, by_heir } = place else {
            return refuse("a word from a voice that is not a peer this door holds");
        };

        let succession = word.successor.is_some() || word.commitment.is_some();
        if succession {
            // A succession carries the successor and the next commitment;
            // fields that mean nothing in a case are absent, not filled.
            if word.successor.is_none() || word.commitment.is_none() {
                return refuse("a succession missing its successor or its next commitment");
            }
            if !by_heir {
                return refuse("a succession not signed by the heir that was committed");
            }
            if word.being == Some(self.outbound[relation].warden) {
                // The name and the public being are one key, so this word
                // would be a second spelling of the name's own succession.
                return refuse("a word naming the announcing warden's own pk as a being");
            }
        } else {
            if word.padlock.is_none() {
                return refuse("a word that announces nothing a peer's record is wrong about");
            }
            if by_heir {
                return refuse("a padlock replacement not signed by the name");
            }
        }

        let row = &mut self.outbound[relation];
        if let Some(successor) = word.successor {
            row.warden = successor;
        }
        if let Some(name) = word.name {
            row.warden = name;
        }
        if let Some(next) = word.commitment {
            row.commitment = next;
        }
        if let Some(padlock) = word.padlock {
            row.padlock = padlock;
        }
        if !word.hints.is_empty() {
            row.hints = word.hints.clone();
        }
        // A name succession keeps that mark, because the house persisted and
        // only its key changed; a being's succession starts it fresh.
        if word.being.is_some() {
            row.news = 0;
        }
        Ok(())
    }

    /// A migration's state transfer. **The digest identifies rather than
    /// delivers**: a destination that does not already hold that class
    /// refuses the cargo in silence, and there is nobody it may ask.
    ///
    /// The answer is the commitment of the key the destination minted and the
    /// origin never saw, hashed under the destination's own name.
    pub fn receive(&mut self, cargo: &Cargo, minted_heir: &[u8; KEY]) -> Judged<[u8; KEY]> {
        let holds = self.blueprints.iter().any(|text| {
            quo_notation::digest(text).expect("a blueprint this door holds") == cargo.digest
        });
        if !holds {
            return refuse("a cargo of a class this door does not hold");
        }
        let sealed = commitment(&self.name, minted_heir);
        self.beings.retain(|held| held.being != cargo.being);
        self.beings.push(Resident {
            being: cargo.being,
            digest: cargo.digest,
            commitment: sealed,
            cells: cargo.cells.clone(),
        });
        // Cells and both records of standings travel with the being — the
        // replay record whole, the mark and the spent numbers beneath it.
        self.inbound
            .extend(cargo.standings.iter().map(Inbound::from_standing));
        self.outbound
            .extend(cargo.relations.iter().map(Outbound::from_relation));
        Ok(sealed)
    }

    // ---- Article XIV, the name's own succession ----------------------

    /// Move the warden's own name. The heir the founding committed to is the
    /// only key that may spend, `heir_commitment` is what the new name
    /// commits to next, and the public being's pk is the warden's name, so it
    /// moves with it.
    ///
    /// **Every standing stays where it was.** Each row keeps the name its
    /// commitment was minted at, so an older standing still rotates; the
    /// rotation it carries is filed under the new name, and the one after
    /// that will not match until the holder has heard the news.
    pub fn succeed(&mut self, name_secret: [u8; KEY], heir_commitment: [u8; KEY]) -> Judged<()> {
        let successor = quo_arithmetic::signing_pk(&name_secret);
        let public = self
            .resident(&self.name)
            .expect("the public being always stands");
        if commitment(&self.name, &successor) != public.commitment {
            return refuse("a name that is not the heir the founding committed to");
        }
        let was = self.name;
        for held in &mut self.beings {
            if held.being == was {
                held.being = successor;
                held.commitment = heir_commitment;
            }
        }
        self.name = successor;
        self.name_secret = name_secret;
        Ok(())
    }

    // ---- the caller side -------------------------------------------------

    /// Keep an invitation as a relation: the outbound row everything this
    /// ground later says to that house is composed out of. The row's index is
    /// what a caller holds, because the record is a `Vec` and a reference
    /// into it does not survive the next push.
    ///
    /// Nothing has been spent yet, so the voice this row speaks with is the
    /// heir it was handed, until the first ask rotates it.
    pub fn remember(&mut self, invitation: &Invitation) -> usize {
        self.outbound.push(Outbound {
            warden: invitation.warden,
            commitment: invitation.commitment,
            padlock: invitation.padlock,
            voice: invitation.heir,
            secret: invitation.heir_secret,
            heir: invitation.heir,
            heir_secret: invitation.heir_secret,
            seq: 0,
            news: 0,
            hints: invitation.hints.clone(),
        });
        self.outbound.len() - 1
    }

    /// Compose one utterance to a far door. The number it spends comes back
    /// with it, because an answer is paired to this house by that number and
    /// it never travels outside a seal.
    ///
    /// The ephemeral secret is an argument, as every draw of randomness in
    /// this kit is: nothing here reaches for a random number generator.
    pub fn ask(
        &mut self,
        at: usize,
        ephemeral_secret: &[u8; KEY],
        reach: &Reach,
    ) -> Judged<(Vec<u8>, i64)> {
        let Some(row) = self.outbound.get(at) else {
            return refuse("a relation this door does not hold");
        };
        let signer = row.secret;
        self.ask_signed(at, ephemeral_secret, &signer, reach)
    }

    /// The composing itself, told which key signs. An ordinary ask is signed
    /// by the voice that holds the standing; **a rotation is signed by the
    /// heir**, because the heir is the only key the far door will take the
    /// standing over for. The two are different keys the moment a standing
    /// has been rotated once, which is why this is a parameter rather than
    /// always the row's voice.
    fn ask_signed(
        &mut self,
        at: usize,
        ephemeral_secret: &[u8; KEY],
        signer_secret: &[u8; KEY],
        reach: &Reach,
    ) -> Judged<(Vec<u8>, i64)> {
        let padlock = self.padlock;
        let Some(row) = self.outbound.get_mut(at) else {
            return refuse("a relation this door does not hold");
        };
        row.seq += 1;
        let say = Say {
            voice: quo_arithmetic::signing_pk(signer_secret),
            recipient: row.warden,
            commitment: reach.next.map(|next| commitment(&row.warden, &next)),
            seq: row.seq,
            padlock,
            hints: reach.hints.clone(),
            allowance: reach.allowance,
            being: reach.being,
            method: reach.method.clone(),
        };
        let seq = row.seq;
        let sealed = quo_envelope::seal(
            signer_secret,
            ephemeral_secret,
            &row.padlock,
            &Message::Say(say),
        )
        .map_err(|why| Refused(why.0))?;
        Ok((sealed, seq))
    }

    /// Whoever minted a voice has seen its keys, so a holder's first act is a
    /// rotation to a key nobody else has ever seen. `next_secret` is that key,
    /// handed in rather than drawn here.
    ///
    /// The composing and the moving of the keys are one act, so the two can
    /// never be seen apart: the row ends standing on the key that just signed
    /// and committing to `next_secret` beside it.
    pub fn rotate(
        &mut self,
        at: usize,
        ephemeral_secret: &[u8; KEY],
        next_secret: &[u8; KEY],
        reach: &Reach,
    ) -> Judged<(Vec<u8>, i64)> {
        let Some(row) = self.outbound.get(at) else {
            return refuse("a relation this door does not hold");
        };
        // Signed by the heir, never by the voice. On the first rotation the
        // two are the same key, because an invitation hands one out as both;
        // on every rotation after it they differ, and signing with the voice
        // would present a standing's current holder as its own heir.
        let heir_secret = row.heir_secret;
        let next = quo_arithmetic::signing_pk(next_secret);
        let mut reaching = reach.clone();
        reaching.next = Some(next);
        let composed = self.ask_signed(at, ephemeral_secret, &heir_secret, &reaching)?;

        let row = &mut self.outbound[at];
        row.voice = row.heir;
        row.secret = row.heir_secret;
        row.heir = next;
        row.heir_secret = *next_secret;
        Ok(composed)
    }

    /// Open an answer sealed to this ground's own padlock, verified against
    /// the `warden` its own record carries and matched to the door that was
    /// asked — the two checks Article XII keeps separate.
    pub fn hear(&self, at: usize, reply: &[u8]) -> Judged<Answer> {
        let Some(row) = self.outbound.get(at) else {
            return refuse("a relation this door does not hold");
        };
        quo_envelope::read_answer(&self.padlock_secret, reply, &row.warden)
            .map_err(|why| Refused(why.0))
    }

    /// Accept an invitation, whole — Razvan's ruling, 2026-08-31.
    ///
    /// **An invitation is spent, not held.** Whoever minted it has seen both
    /// the voice and the heir behind it, so a holder standing on either is a
    /// holder the granter can still speak as at the granter's own door. Only
    /// a key this ground generated ends that, and reaching one costs **two**
    /// rotate-and-asks. Forgetting the second is the mistake this helper
    /// exists to make unmakeable.
    ///
    /// The first is signed by the invitation's heir — the only key the
    /// granting door will take the standing over for — and commits to a fresh
    /// voice nobody else has seen. The second is signed by that voice,
    /// commits to a fresh heir, and carries the caller's own ask. After it,
    /// every key the granter ever held for this standing is dead.
    ///
    /// **Nothing here is wire.** It is `remember` and `rotate` composed, and
    /// that raw path stays open: a caller that wants the steps takes them.
    pub fn accept(
        &mut self,
        invitation: &Invitation,
        accepting: &Accepting,
        mut send: impl FnMut(&[u8]) -> Option<Vec<u8>>,
    ) -> Judged<Accepted> {
        let at = self.remember(invitation);
        let reach = Reach {
            allowance: accepting.allowance,
            hints: accepting.hints.clone(),
            ..Reach::default()
        };

        let (first, _) =
            self.rotate(at, &accepting.ephemeral[0], &accepting.voice_secret, &reach)?;
        let opening = send(&first);

        let (second, seq) = self.rotate(
            at,
            &accepting.ephemeral[1],
            &accepting.heir_secret,
            &Reach {
                being: accepting.being,
                method: accepting.method.clone(),
                ..reach
            },
        )?;
        let answer = send(&second);

        let row = &self.outbound[at];
        Ok(Accepted {
            at,
            far: invitation.warden,
            voice: row.voice,
            heir: row.heir,
            commitment: commitment(&row.warden, &row.heir),
            opening,
            answer,
            seq,
        })
    }
}

/// What one utterance reaches for. `next` is the pk this ask commits to,
/// present on a rotation and on nothing else.
#[derive(Debug, Clone)]
pub struct Reach {
    pub being: Option<[u8; KEY]>,
    pub method: Option<Method>,
    pub next: Option<[u8; KEY]>,
    /// What this call is willing to spend. The default is a starting point
    /// and not a rule — the law names no number, and a leash is the caller's
    /// own statement about how far its work may travel.
    pub allowance: Allowance,
    /// The roads this ground publishes, which every say it composes carries.
    /// A ground that publishes none is reachable only down a line it opened.
    pub hints: Vec<String>,
}

impl Default for Reach {
    fn default() -> Reach {
        Reach {
            being: None,
            method: None,
            next: None,
            allowance: Allowance {
                time: 5_000,
                hops: 8,
            },
            hints: Vec::new(),
        }
    }
}

/// The keys accepting an invitation costs, all four handed in.
#[derive(Debug, Clone)]
pub struct Accepting {
    /// The voice this ground will stand on, which the granter has never seen.
    pub voice_secret: [u8; KEY],
    /// The heir it commits to beside that voice.
    pub heir_secret: [u8; KEY],
    /// One ephemeral per envelope, and there are two.
    pub ephemeral: [[u8; KEY]; 2],
    pub being: Option<[u8; KEY]>,
    pub method: Option<Method>,
    pub allowance: Allowance,
    pub hints: Vec<String>,
}

/// What spending an invitation whole leaves the holder standing on.
#[derive(Debug, Clone)]
pub struct Accepted {
    pub at: usize,
    pub far: [u8; KEY],
    pub voice: [u8; KEY],
    pub heir: [u8; KEY],
    pub commitment: [u8; KEY],
    pub opening: Option<Vec<u8>>,
    pub answer: Option<Vec<u8>>,
    pub seq: i64,
}

fn read_key(args: Option<&Value>) -> Judged<[u8; KEY]> {
    match args {
        Some(Value::B32(key)) | Some(Value::Being(key)) => Ok(*key),
        _ => refuse("a field whose one argument is not a key"),
    }
}

// ---- Article X, the derived order ------------------------------------

/// **The order is derived, never chosen: classes by their digest bytes
/// ascending, beings under each by their pk bytes ascending**, so two wardens
/// describing one estate produce one byte sequence.
pub fn order(estate: Estate) -> Estate {
    let mut classes = estate.classes;
    for class in &mut classes {
        class.beings.sort_by(|a, b| a.being.cmp(&b.being));
    }
    classes.sort_by(|a, b| a.digest.cmp(&b.digest));
    Estate { classes }
}

/// The estate as it crosses: the record by the notation's own rules.
pub fn encode_estate(estate: &Estate) -> Judged<Vec<u8>> {
    shape::write_record("estate", &estate.value())
}

/// Read an estate back from the whole of these bytes.
pub fn decode_estate(bytes: &[u8]) -> Judged<Estate> {
    shape::as_estate(&shape::read_record("estate", bytes)?)
}

// ---- Article VIII, the seq and the leash -----------------------------

/// **The door keeps a window, not a line.** Above the mark is honoured and
/// moves the mark; inside the window is honoured once and never again; below
/// the window is silence. The first legal number is one, and a fresh
/// standing's mark of zero says nothing honoured yet.
pub fn spend(standing: &mut Inbound, seq: i64, window: i64) -> Judged<()> {
    if seq < 1 {
        return refuse("a number below the first legal one");
    }
    if seq > standing.mark {
        let was = standing.mark;
        standing.mark = seq;
        if was >= 1 {
            standing.spent.push(was);
        }
        let floor = standing.mark - window;
        standing.spent.retain(|number| *number >= floor);
        return Ok(());
    }
    if seq == standing.mark || standing.spent.contains(&seq) {
        return refuse("a number already honoured");
    }
    if seq < standing.mark - window {
        return refuse("a number below the window");
    }
    standing.spent.push(seq);
    Ok(())
}

/// **The leash is judged on what arrived**: a time budget at or below zero,
/// or a hop count below zero, is silence. A hop count of zero is a legal
/// leash for a call that goes no further — what it forbids is onward.
pub fn spend_leash(allowance: &Allowance) -> Judged<()> {
    if allowance.time <= 0 {
        return refuse("a time budget at or below zero");
    }
    if allowance.hops < 0 {
        return refuse("a hop count below zero");
    }
    Ok(())
}

/// The leash an onward ask carries: the arriving hop count less one, and the
/// arriving budget less this door's dwell — the difference between the two
/// readings of one clock, the road never counted. Where either would fall
/// below zero, or the budget to zero, **the onward ask is not made** and the
/// work already routed stands.
pub fn onward(arrived: &Allowance, arrival: i64, handed_onward: i64) -> Option<Allowance> {
    let dwell = handed_onward - arrival;
    let time = arrived.time.checked_sub(dwell)?;
    let hops = arrived.hops.checked_sub(1)?;
    if time <= 0 || hops < 0 {
        return None;
    }
    Some(Allowance { time, hops })
}
