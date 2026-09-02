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

pub mod ground;
pub mod shape;

use std::collections::{BTreeMap, BTreeSet};

use quo_arithmetic::{commitment, signing_pk};
use quo_envelope::{Answer, Message, Method, Say};
use quo_wire::Value;

pub use ground::{
    as_bool, as_bytes, as_int, as_invitation, as_maybe, as_text, Being, Caller, Carried, Delivery,
    Handle, Holding, Kind, Label, Memory, Nowhere, Opening, Quo, Seeds, Snapshot, Store, Via,
    Warden, Way, DEFAULT_ALLOWANCE,
};
pub use quo_envelope::{Allowance, Answer as SealedAnswer, Method as Field};
/// The address a stranger knocks at, and `stranger`'s one argument.
pub use quo_wire::Card;
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
    /// Which of this ground's beings may spend the relation. **A row that
    /// named none could not travel when that being moves**, and a relation
    /// nobody here owns belongs to the warden itself and travels nowhere.
    pub holder: Option<[u8; KEY]>,
    /// The commitment this door holds for each being it stands at down this
    /// relation, taken from a describe and kept by `note`. **A being's
    /// succession is believed against the being's own commitment, never the
    /// row's**: the row's belongs to the house's name, and a door that hashed
    /// one against the other would let the house's committed heir succeed
    /// every being at it, or let a being's heir take the house.
    ///
    /// It does not travel. A `relation` record carries what the far door
    /// knows about this holder, and what this door has learned about the
    /// beings there is its own reading, re-taken from a describe.
    pub beings: BTreeMap<[u8; KEY], [u8; KEY]>,
    /// The asks put on a road down this relation with no answer heard yet,
    /// each as the padlock the answer will be sealed to and the number the ask
    /// spent. Article XII's fourth check on an answer reads it, so it belongs
    /// in the core: the check is owed whether or not a socket was involved.
    ///
    /// It does not travel. A relation that migrates carries what the far door
    /// knows; an ask still out was put on a road that ends at the old house.
    pub awaiting: BTreeSet<([u8; KEY], i64)>,
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
            // The news mark travels too, or a peer's numbers would all come
            // round again at the new door and every one of them be honoured
            // a second time.
            news: relation.news,
            hints: relation.hints.clone(),
            holder: None,
            beings: BTreeMap::new(),
            awaiting: BTreeSet::new(),
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
    /// with or as an heir committed down it. `being` names which being's
    /// commitment the voice hashed to, and is absent when it hashed to the
    /// house's own — which is what says whose succession this voice may
    /// announce.
    News {
        relation: usize,
        by_heir: bool,
        being: Option<[u8; KEY]>,
    },
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

/// The door: the judgment, the two records, and the keys it is judged with.
///
/// It is the warden's judging half and nothing above it: no clock, no
/// randomness, no socket and no being that is an object. [`Warden`] is the
/// whole thing, and it holds one of these.
#[derive(Debug, Clone)]
pub struct Door {
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
    /// The roads this ground publishes. **A warden does not know where it
    /// stands until something stands it up**, so a road is told to it rather
    /// than fixed at birth, and every mint after that carries the roads that
    /// are true then. A hint is an opaque string this door never parses.
    pub hints: Vec<String>,
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
    /// What the last `receive` took in, until [`Warden::landed`] reads it.
    pub arrived: Option<Arrived>,
}

/// What a `receive` leaves behind for the migration's second news: the name
/// the being wore before, the name this door minted for it, and the voices
/// that arrived with the standings.
///
/// **No key is here.** The two secrets `receive` mints were handed in by the
/// caller, which still holds them, and this kit holds no key it was not
/// founded with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Arrived {
    pub was: [u8; KEY],
    pub being: [u8; KEY],
    pub voices: Vec<[u8; KEY]>,
}

impl Door {
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
        Door {
            name,
            name_secret,
            padlock: quo_arithmetic::sealing_pk(&padlock_secret),
            padlock_secret,
            limit,
            hints: Vec::new(),
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
            arrived: None,
        }
    }

    /// Tell this door a road it can be reached on. Roads accumulate, because a
    /// warden offers as many as it has and none is authoritative; telling it
    /// the same road twice adds nothing.
    pub fn publish(&mut self, hint: &str) {
        if !self.hints.iter().any(|held| held == hint) {
            self.hints.push(hint.to_string());
        }
    }

    /// A road that has stopped carrying is not a road. Retracting one is not
    /// news on its own: it only stops the dead road being minted into
    /// anything new.
    pub fn retract(&mut self, hint: &str) {
        self.hints.retain(|held| held != hint);
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

    // ---- Article VII, amending a standing ----------------------------

    /// Widen a standing: the warden adds a being to a voice's row.
    ///
    /// **A standing is amended, not replaced** — nobody is told, no secret is
    /// minted, and the holder finds it on its next describe.
    ///
    /// The warden is the actor, not the caller. A host reaching into the
    /// record to add a being itself would be widening a standing without
    /// asking the door, which is the ambient permission Quo refuses.
    ///
    /// Two refusals: a voice with no row here, because there is nothing to
    /// amend and a row conjured from a widening would be a grant by another
    /// name; and a being this door does not hold, because a row may only ever
    /// name beings that stand.
    pub fn widen(&mut self, voice: &[u8; KEY], being: &[u8; KEY]) -> Judged<()> {
        if self.resident(being).is_none() {
            return refuse("a being this door does not hold");
        }
        match self.inbound.iter_mut().find(|row| &row.voice == voice) {
            None => refuse("a voice that stands nowhere here"),
            Some(row) => {
                if !row.beings.contains(being) {
                    row.beings.push(*being);
                }
                Ok(())
            }
        }
    }

    /// Narrow a standing: the warden takes a being away.
    ///
    /// **Taking the last being away is release, and there is no separate act
    /// for it.** The row goes, the holder is a stranger at its next call, and
    /// nobody is told. Narrowing a being the row never named is no refusal —
    /// the row already says what the narrowing asks for.
    pub fn narrow(&mut self, voice: &[u8; KEY], being: &[u8; KEY]) -> Judged<()> {
        let Some(at) = self.inbound.iter().position(|row| &row.voice == voice) else {
            return refuse("a voice that stands nowhere here");
        };
        self.inbound[at].beings.retain(|held| held != being);
        if self.inbound[at].beings.is_empty() {
            self.inbound.remove(at);
        }
        Ok(())
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
        Door::classed(reachable)
    }

    /// Every being this door holds, in the same derived order. **It is the
    /// house's own view and never crosses the wire**: under one warden there
    /// are no voices and no strangers, so a being asking what stands beside it
    /// is asking about itself.
    pub fn own_estate(&self) -> Estate {
        Door::classed(self.beings.iter().collect())
    }

    /// The sketch of a being this door holds, taken by the house itself.
    pub fn own_sketch(&self, being: &[u8; KEY]) -> Option<Sketch> {
        self.resident(being).map(|held| Sketch {
            being: held.being,
            digest: held.digest,
            commitment: held.commitment,
        })
    }

    fn classed(reachable: Vec<&Resident>) -> Estate {
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
        let pointer = self
            .moved
            .iter()
            .find(|(moved, _)| moved == being)
            .map(|(_, word)| word.clone());
        // A being this door has moved on is reached by the succession it
        // published and by nothing else: an arriving row names the being by
        // the name the destination minted and by that name alone, so the name
        // it wore before stands in no standing here. If a published pointer
        // were not reach enough, the old door could not point about the one
        // being Article XIII sends every peer behind the news to ask it about.
        // To a holder who reached it before, never to a stranger — and holding
        // a standing at some other being here is not having reached this one.
        // At the old door the standings still name the being that left, which
        // the first test catches; at a destination they name it by the key this
        // house minted, so reaching the successor the published word names is
        // what reached-it-before means there.
        let pointed = pointer
            .as_ref()
            .and_then(|word| word.successor)
            .is_some_and(|successor| self.reaches(voice, &successor));
        // Two ways to earn the answer, and naming them positively is the whole
        // rule: this voice still reaches the being here, or the being has left
        // and this voice reaches where it went.
        let may_ask = self.reaches(voice, being) || pointed;
        if !may_ask {
            return refuse("a pointer for a being this voice may not reach");
        }
        Ok(pointer)
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
        self.judge_say(say, arrival)
    }

    /// Steps three through seven, on a payload already unsealed and verified.
    ///
    /// The seal is opened once and by one party. A caller that has already
    /// opened an envelope to read its record byte — which is what tells an
    /// answer from a say — hands the say here rather than making the door
    /// open the same envelope a second time.
    pub fn judge_say(&mut self, say: Say, arrival: i64) -> Judged<Verdict> {
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
        //
        // Every match is counted before anything moves. Matching more than one
        // standing is silence: no order over the records is law, so a door that
        // took the first it found would have chosen, and the next door would
        // choose differently. A granter that committed one heir at two
        // standings has made its own error.
        let matched: Vec<usize> = self
            .inbound
            .iter()
            .enumerate()
            .filter(|(_, row)| commitment(&row.minted_at, &say.voice) == row.commitment)
            .map(|(at, _)| at)
            .collect();
        if matched.len() > 1 {
            return refuse("a hash matching more than one standing");
        }
        if let Some(&at) = matched.first() {
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
                being: None,
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
                being: None,
            });
        }
        // Or as the heir a being at that house committed, which a describe
        // published and `note` kept. Placed here rather than at the row,
        // because what a voice may announce is decided by which commitment it
        // hashed to.
        for (at, row) in self.outbound.iter().enumerate() {
            if let Some((being, _)) = row
                .beings
                .iter()
                .find(|(_, held)| commitment(&row.warden, &say.voice) == **held)
            {
                return Ok(Placement::News {
                    relation: at,
                    by_heir: true,
                    being: Some(*being),
                });
            }
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
    /// `mint` is the two keys `receive` needs — the name the arriving being
    /// takes here and that name's heir, both minted by the destination and
    /// never seen by the origin. Every draw is an argument in this kit, and
    /// this is the only field that takes one.
    pub fn answer(
        &mut self,
        verdict: &Verdict,
        mint: Option<&[[u8; KEY]; 2]>,
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
        mint: Option<&[[u8; KEY]; 2]>,
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
                self.believe(verdict.place, &verdict.say.voice, &word)?;
                shape::write_answer(field, None)
            }
            "receive" => {
                // An ordinary field spent by an ordinary standing, granted in
                // advance the way anything is: **a door any stranger could
                // push a being into is a door with no gate** (Article IX).
                if !matches!(
                    verdict.place,
                    Placement::Ask { .. } | Placement::Rotation { .. }
                ) {
                    return refuse("a receive spent by no standing at this door");
                }
                let cargo = shape::as_cargo(
                    args.as_ref()
                        .ok_or_else(|| Refused("a receive with no cargo".to_string()))?,
                )?;
                let Some([being, heir]) = mint else {
                    return refuse("a receive with no keys minted for it");
                };
                let answered = self.receive(&cargo, being, heir)?;
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
    pub fn believe(&mut self, place: Placement, voice: &[u8; KEY], word: &Word) -> Judged<()> {
        let Placement::News {
            relation,
            by_heir,
            being: hashed_to,
        } = place
        else {
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
            // The successor signs and the peer hashes. A word naming a
            // successor the signer is not proves nothing about that key: it
            // would let a committed heir hand this relation to a third party
            // it chose.
            if word.successor.as_ref() != Some(voice) {
                return refuse("a succession the successor did not sign");
            }
            if word.being == Some(self.outbound[relation].warden) {
                // The name and the public being are one key, so this word
                // would be a second spelling of the name's own succession.
                return refuse("a word naming the announcing warden's own pk as a being");
            }
            // The commitment the voice hashed to is placed already, so it says
            // what this voice may succeed and nothing else does: a being's
            // heir cannot move the house's name, and the house's heir cannot
            // move a being.
            if word.being != hashed_to {
                return refuse("a succession announced by an heir committed to something else");
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
        match word.being {
            // A being's succession moves the being's own entry: the successor
            // takes the name, and the next commitment is filed against it.
            // The row's own commitment belongs to the house and is untouched.
            Some(being) => {
                row.beings.remove(&being);
                if let (Some(successor), Some(next)) = (word.successor, word.commitment) {
                    row.beings.insert(successor, next);
                }
            }
            // The house's own: the name moves and the commitment with it.
            None => {
                if let Some(successor) = word.successor {
                    row.warden = successor;
                }
                if let Some(next) = word.commitment {
                    row.commitment = next;
                }
            }
        }
        // Believed news rewrites the rest of the row entire, because the
        // relation follows the being: where it now answers, and how it is
        // reached.
        if let Some(name) = word.name {
            row.warden = name;
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
    /// **A destination mints two keys — the one the being is named by here and
    /// that one's heir — and the answer is the commitment of the first**
    /// (Article IX), hashed under the destination's own name. The being's new
    /// name is where the migration's second news moves the being's identity,
    /// and it is what a peer hashes that succession against; a commitment to
    /// the heir instead names a key that signs nothing until the succession
    /// after this one, so the peer disbelieves the news and is left standing at
    /// a house that has stopped answering.
    pub fn receive(
        &mut self,
        cargo: &Cargo,
        minted_being: &[u8; KEY],
        minted_heir: &[u8; KEY],
    ) -> Judged<[u8; KEY]> {
        let holds = self.blueprints.iter().any(|text| {
            quo_notation::digest(text).expect("a blueprint this door holds") == cargo.digest
        });
        if !holds {
            return refuse("a cargo of a class this door does not hold");
        }
        let name = quo_arithmetic::signing_pk(minted_being);
        if name == cargo.being {
            return refuse("a receive minting the name the being already wore");
        }
        self.beings.retain(|held| held.being != cargo.being);
        self.beings.push(Resident {
            being: name,
            digest: cargo.digest,
            // The being's own heir commitment, which is what lets this name be
            // succeeded afterwards like any other.
            commitment: commitment(&self.name, &quo_arithmetic::signing_pk(minted_heir)),
            cells: cargo.cells.clone(),
        });
        // Cells and both records of standings travel with the being — the
        // replay record whole, the mark and the spent numbers beneath it.
        //
        // **An arriving row reaches the being by the name this door minted and
        // by that name alone** (Article XIII), never also by the name the being
        // wore before: a name a door must remember for whoever might still be
        // behind is a name it can never stop remembering, and the peer that is
        // behind is not stranded, because the old door still answers `moved`.
        self.inbound.extend(cargo.standings.iter().map(|one| {
            let mut row = Inbound::from_standing(one);
            row.beings = vec![name];
            row
        }));
        self.outbound.extend(cargo.relations.iter().map(|relation| {
            let mut row = Outbound::from_relation(relation);
            row.holder = Some(name);
            row
        }));
        self.arrived = Some(Arrived {
            was: cargo.being,
            being: name,
            // A standing granted here after the being landed is owed nothing:
            // it never knew the being anywhere else.
            voices: cargo.standings.iter().map(|one| one.voice).collect(),
        });
        Ok(commitment(&self.name, &name))
    }

    // ---- Articles XIII and XIV, migrating a being away ---------------

    /// The rows that stand at one being: **who must be told when that being
    /// moves, and how to reach them**. The padlock and the roads are refreshed
    /// by every call that arrives, so a row read here is the freshest way back
    /// this door has.
    ///
    /// Ordered by the voice's bytes ascending, so a list of who is owed news
    /// does not differ between two readings.
    pub fn peers(&self, being: &[u8; KEY]) -> Vec<Peer> {
        let mut out: Vec<Peer> = self
            .inbound
            .iter()
            .filter(|row| row.beings.contains(being))
            .map(|row| Peer {
                voice: row.voice,
                padlock: row.padlock,
                hints: row.hints.clone(),
            })
            .collect();
        out.sort_by_key(|peer| peer.voice);
        out
    }

    /// Drop the relations a being holds outward, and say how many went. `at`
    /// narrows it to one far warden, which is how a relation re-remembered at
    /// a house supersedes the one it replaces; `None` drops them all, which is
    /// what a being leaving takes with it.
    pub fn forget(&mut self, being: &[u8; KEY], at: Option<&[u8; KEY]>) -> usize {
        let before = self.outbound.len();
        self.outbound.retain(|row| {
            !(row.holder.as_ref() == Some(being) && at.is_none_or(|far| &row.warden == far))
        });
        before - self.outbound.len()
    }

    /// A migration's cargo, read off what this door holds for one being: its
    /// class, its cells, and both records of standings — the inbound one so
    /// its peers keep their standing at it, and the outbound one so it keeps
    /// its standing at theirs.
    ///
    /// `heir` is the being's committed heir, handed in like every other key
    /// this kit works with, and checked against the commitment this door
    /// published for that being. **The cargo is packed under it**, because
    /// migration is one message sent twice: the first moves the being's
    /// identity to that heir, and the second moves it on to the key the
    /// destination minted. A cargo packed under the name the being wears here
    /// would leave the destination composing a succession of a name every peer
    /// has already succeeded past.
    ///
    /// The lists are ordered where the bytes are made, by [`Cargo::value`].
    pub fn pack(&self, being: &[u8; KEY], heir: &[u8; KEY]) -> Judged<Cargo> {
        let Some(held) = self.resident(being) else {
            return refuse("a being this door does not hold");
        };
        if commitment(&self.name, heir) != held.commitment {
            return refuse("a key that is not the heir this being committed to");
        }
        let standings = self
            .inbound
            .iter()
            .filter(|row| row.beings.contains(being))
            .map(|row| {
                let mut record = row.standing();
                // Only the being that moves travels in the row, and under the
                // name the cargo is packed under: what the voice reaches here
                // besides it is this door's affair and stays.
                record.beings = vec![*heir];
                record
            })
            .collect();
        let relations = self
            .outbound
            .iter()
            .filter(|row| row.holder.as_ref() == Some(being))
            .map(Outbound::relation)
            .collect();
        Ok(Cargo {
            being: *heir,
            digest: held.digest,
            cells: held.cells.clone(),
            standings,
            relations,
        })
    }

    /// The origin's half, after the cargo has landed. It publishes the
    /// succession of the being's committed heir — **carrying as its next
    /// commitment the one `receive` answered**, which is the one fact the
    /// origin cannot invent — and stops acting on the being's behalf for good.
    ///
    /// The being itself goes: its cells are its own memory and they travelled,
    /// and **after the double rotation every key the old warden held for it is
    /// dead**, so a door that kept the resident would be keeping state it has
    /// just announced it no longer holds. The standings stay, so a peer still
    /// reaches this door and is pointed; the relations went with the cargo, so
    /// this door can spend nothing on the being's behalf.
    pub fn depart(&mut self, being: &[u8; KEY], departing: &Departing) -> Judged<Departed> {
        let Some(held) = self.resident(being) else {
            return refuse("a being this door does not hold");
        };
        // The peer believes the succession by hashing the successor against
        // the commitment it holds, so a key this door never committed to would
        // compose news nobody can believe.
        if commitment(&self.name, &departing.heir) != held.commitment {
            return refuse("a key that is not the heir this being committed to");
        }
        let word = Word {
            being: Some(*being),
            successor: Some(departing.heir),
            commitment: Some(departing.commitment),
            // Where it answers has changed, so the word says so, and the peer
            // rewrites its row entire from it.
            name: Some(departing.name),
            padlock: Some(departing.padlock),
            hints: departing.hints.clone(),
        };
        let told = self.peers(being);
        self.forget(being, None);
        self.beings.retain(|one| &one.being != being);
        // The pointer stays and answers `moved` alone: every other ask meets
        // silence, and a peer that never asks `moved` learns by the news.
        self.moved.retain(|(gone, _)| gone != being);
        self.moved.push((*being, word.clone()));
        Ok(Departed { word, peers: told })
    }

    /// The destination's half, once a cargo has been taken in: the word the
    /// second news carries, the name this door minted, and the peers that
    /// arrived with the standings.
    ///
    /// The word is composed by the kit and not by the host — a house that had
    /// to invent its own announcement would invent a different one at every
    /// ground — and the roads are handed in, as they are for every other act
    /// this kit composes, because a door does not know where it stands until
    /// something stands it up.
    ///
    /// **The new door points as well** (Article XIII), for the name the being
    /// wore before, so the word a peer hears and the word a peer gets by
    /// asking are the identical bytes.
    pub fn landed(&mut self, hints: &[String]) -> Judged<Landing> {
        let Some(arrived) = self.arrived.clone() else {
            return refuse("nothing has landed at this door");
        };
        let Some(held) = self.resident(&arrived.being) else {
            return refuse("a being that landed here and is no longer held");
        };
        let word = Word {
            being: Some(arrived.was),
            successor: Some(arrived.being),
            commitment: Some(held.commitment),
            name: Some(self.name),
            padlock: Some(self.padlock),
            hints: hints.to_vec(),
        };
        self.moved.retain(|(gone, _)| gone != &arrived.was);
        self.moved.push((arrived.was, word.clone()));
        let told = self
            .peers(&arrived.being)
            .into_iter()
            .filter(|peer| arrived.voices.contains(&peer.voice))
            .collect();
        Ok(Landing {
            word,
            being: arrived.being,
            peers: told,
        })
    }

    /// Compose one piece of news for one peer, and hand back the sealed bytes.
    ///
    /// It is an ordinary envelope judged at the peer's door by the same steps
    /// as any ask. **What makes it news is only where its voice is found**: in
    /// the peer's outbound record rather than its inbound one — so this names
    /// no being, and the voice is whichever key the peer can believe the word
    /// from, handed in rather than held.
    ///
    /// The recipient is the padlock. An inbound row keeps the padlock the peer
    /// named and never that peer's warden name — a door never learns the house
    /// behind a voice — and a padlock is per door, so it binds the message to
    /// one door exactly as a name would.
    pub fn news(&self, ephemeral_secret: &[u8; KEY], tell: &Tell) -> Judged<Vec<u8>> {
        // A peer that has never spoken left no way back. It is reached by the
        // only means left: it eventually asks, and this door points it.
        let Some(padlock) = tell.peer.padlock else {
            return refuse("a peer that left no way back");
        };
        spend_leash(&tell.allowance)?;
        let args = shape::write_record("word", &tell.word.value())?;
        let say = Say {
            voice: quo_arithmetic::signing_pk(&tell.voice_secret),
            recipient: padlock,
            commitment: None,
            seq: tell.seq,
            padlock: self.padlock,
            hints: tell.hints.clone(),
            allowance: tell.allowance,
            being: None,
            method: Some(Method {
                name: "tell".to_string(),
                args,
            }),
        };
        quo_envelope::seal(
            &tell.voice_secret,
            ephemeral_secret,
            &padlock,
            &Message::Say(say),
        )
        .map_err(|why| Refused(why.0))
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
            holder: None,
            beings: BTreeMap::new(),
            awaiting: BTreeSet::new(),
        });
        self.outbound.len() - 1
    }

    /// Keep a card as a relation this door speaks down **as a stranger**: the
    /// far house's address and nothing else, with a voice minted here that
    /// stands nowhere over there.
    ///
    /// The voice is not the far door's to know and was never granted, so the
    /// row opens no standing: every say it composes is placed as a stranger
    /// and is answered with what that door shows a stranger. The heir is minted
    /// beside it because a row without one could never rotate if the far house
    /// ever did grant this voice a place.
    pub fn stranger(
        &mut self,
        card: &quo_wire::Card,
        voice_secret: [u8; KEY],
        heir_secret: [u8; KEY],
    ) -> usize {
        self.outbound.push(Outbound {
            warden: card.warden,
            commitment: card.commitment,
            padlock: card.padlock,
            voice: signing_pk(&voice_secret),
            secret: voice_secret,
            heir: signing_pk(&heir_secret),
            heir_secret,
            seq: 0,
            news: 0,
            hints: card.hints.clone(),
            holder: None,
            beings: BTreeMap::new(),
            awaiting: BTreeSet::new(),
        });
        self.outbound.len() - 1
    }

    /// Say which of this ground's beings spends a relation. It is a separate
    /// act because an invitation says nothing about who here will hold it, and
    /// a row that named nobody could not travel when that being moves.
    pub fn holds(&mut self, at: usize, being: [u8; KEY]) -> Judged<()> {
        match self.outbound.get_mut(at) {
            Some(row) => {
                row.holder = Some(being);
                Ok(())
            }
            None => refuse("a relation this door does not hold"),
        }
    }

    /// Keep the commitment a describe published for one being at a far house.
    /// A peer that means to believe that being's succession must keep it: the
    /// news arrives signed by a key this door has never seen, and the hash
    /// against this commitment is the only thing that recognises it.
    pub fn note(&mut self, at: usize, being: [u8; KEY], commitment: [u8; KEY]) -> Judged<()> {
        let Some(row) = self.outbound.get_mut(at) else {
            return refuse("no relation at that index");
        };
        if being == row.warden {
            // The house's name and its public being are one key, and its
            // commitment is the row's own. A second copy under `beings` would
            // be a second place to believe the same succession from.
            return refuse("a note naming the far warden's own pk as a being");
        }
        row.beings.insert(being, commitment);
        Ok(())
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
        // A rotation starts the far door's mark fresh, so every number at or
        // above one stands above it again; on an ordinary ask the floor is
        // what this relation has already spent, because per voice the number
        // only rises. Article VIII leaves which number a caller opens with,
        // above one, to the caller — a kit that always counted from one would
        // be keeping a choice the law gives away.
        let floor = if reach.next.is_some() { 0 } else { row.seq };
        let seq = match reach.seq {
            None => row.seq + 1,
            Some(chosen) if chosen > floor => chosen,
            Some(_) => return refuse("a number this relation has already spent"),
        };

        // An answer is paired to its ask by the padlock, the warden and the
        // seq, and by nothing else. Two asks out at once carrying the same
        // three would be answered indistinguishably, so this kit refuses to
        // send the second — the shape a rotation makes, because it starts the
        // far door's mark fresh and brings a number round again.
        let pending = (padlock, seq);
        if row.awaiting.contains(&pending) {
            return refuse("an ask on that number is already awaiting an answer");
        }
        row.seq = seq;
        let say = Say {
            voice: quo_arithmetic::signing_pk(signer_secret),
            recipient: row.warden,
            commitment: reach.next.map(|next| commitment(&row.warden, &next)),
            seq,
            padlock,
            hints: reach.hints.clone(),
            allowance: reach.allowance,
            being: reach.being,
            method: reach.method.clone(),
        };
        let sealed = quo_envelope::seal(
            signer_secret,
            ephemeral_secret,
            &row.padlock,
            &Message::Say(say),
        )
        .map_err(|why| Refused(why.0))?;
        // There is an envelope: the ask is out, and the caller keeps the
        // record that its answer will be judged against.
        row.awaiting.insert(pending);
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
    /// **and matched to an ask this relation is actually awaiting** — the
    /// fourth check, which is the caller's own bookkeeping: an ask must be
    /// awaiting under that padlock, that warden and that seq. An answer
    /// nothing awaits is the same silence as every other failure, and hearing
    /// one spends the record, so the same bytes never answer twice.
    pub fn hear(&mut self, at: usize, reply: &[u8]) -> Judged<Answer> {
        let padlock = self.padlock;
        let Some(row) = self.outbound.get_mut(at) else {
            return refuse("a relation this door does not hold");
        };
        let answer = quo_envelope::read_answer(&self.padlock_secret, reply, &row.warden)
            .map_err(|why| Refused(why.0))?;
        if !row.awaiting.remove(&(padlock, answer.seq)) {
            return refuse("an answer nothing awaits");
        }
        Ok(answer)
    }

    /// Stop awaiting an ask whose answer will never come — a road that failed
    /// to carry, or a caller that has stopped waiting. Nothing on the wire
    /// changes: the number stays spent, because a message the far door judged
    /// spent it there whatever this end does with its own record.
    pub fn forgo(&mut self, at: usize, seq: i64) -> bool {
        let padlock = self.padlock;
        match self.outbound.get_mut(at) {
            Some(row) => row.awaiting.remove(&(padlock, seq)),
            None => false,
        }
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

        let (first, opening_seq) =
            self.rotate(at, &accepting.ephemeral[0], &accepting.voice_secret, &reach)?;
        let opening = send(&first);
        // The opening is handed back sealed for the caller to judge, so this
        // helper stops awaiting it: a record nothing will ever spend is a leak,
        // and where the two rotations both open at one it is the thing that
        // would make the second ask indistinguishable from the first.
        self.forgo(at, opening_seq);

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

/// One row that stands at a being, read as the way back to whoever holds it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Peer {
    pub voice: [u8; KEY],
    pub padlock: Option<[u8; KEY]>,
    pub hints: Vec<String>,
}

/// What the origin's half of a migration needs, once the cargo has landed.
#[derive(Debug, Clone)]
pub struct Departing {
    /// The being's committed heir, which signs the first news and is the
    /// successor the peer hashes.
    pub heir: [u8; KEY],
    /// The commitment `receive` answered — **the one fact the origin cannot
    /// invent**, because it is the hash of a key the destination generated.
    pub commitment: [u8; KEY],
    /// Where the being answers now.
    pub name: [u8; KEY],
    pub padlock: [u8; KEY],
    pub hints: Vec<String>,
}

/// What the origin holds after departing: the word to send, and the peers
/// owed it. The key that signs it is the heir the caller handed in.
#[derive(Debug, Clone)]
pub struct Departed {
    pub word: Word,
    pub peers: Vec<Peer>,
}

/// What the destination holds after a cargo has landed.
#[derive(Debug, Clone)]
pub struct Landing {
    pub word: Word,
    /// The name the arriving being wears here. The second news is signed by
    /// it: the peer holds the hash of it from the first news, so it is the one
    /// key the peer can believe that news from.
    pub being: [u8; KEY],
    pub peers: Vec<Peer>,
}

/// One piece of news this door composes for one peer.
#[derive(Debug, Clone)]
pub struct Tell {
    pub peer: Peer,
    /// Whichever key the peer can believe this word from. Article XIV gives
    /// two roads and only two: the name, which has not moved, or a key the
    /// peer holds the hash of.
    pub voice_secret: [u8; KEY],
    pub word: Word,
    /// The number this news spends, against the mark the peer keeps for this
    /// house — its own counter and never the one this door's callers spend, so
    /// the sender names it.
    pub seq: i64,
    pub allowance: Allowance,
    pub hints: Vec<String>,
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
    /// The number to spend, when the caller wants to choose it. Article VIII
    /// leaves that choice to the caller: a fresh mark is empty, so every
    /// number at or above one stands above it, and no door may require a first
    /// message to carry exactly one. `None` counts on from what the row last
    /// spent, which is the ordinary case.
    pub seq: Option<i64>,
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
            seq: None,
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
        class.beings.sort_by_key(|a| a.being);
    }
    classes.sort_by_key(|a| a.digest);
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
///
/// A dwell is never negative. Where this door's own two readings yield a
/// dwell below zero the onward budget is the arriving one: a clock that has
/// gone backwards is this door's fault and never the peer's, and no door
/// widens a leash.
pub fn onward(arrived: &Allowance, arrival: i64, handed_onward: i64) -> Option<Allowance> {
    let dwell = handed_onward.checked_sub(arrival)?.max(0);
    let time = arrived.time.checked_sub(dwell)?;
    let hops = arrived.hops.checked_sub(1)?;
    if time <= 0 || hops < 0 {
        return None;
    }
    Some(Allowance { time, hops })
}
