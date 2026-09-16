package main

import (
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/hkdf"
	"crypto/mlkem"
	"crypto/sha256"
	"encoding/hex"
	"errors"
)

// The six labels of SPEC.md. A label is the info of the call, the ASCII bytes
// of the name. The salt is the zero-length salt of RFC 5869, a nil slice.
const (
	labelSeal     = "quo-seal"
	labelEdgeSeal = "quo-edge-seal"
	labelLock     = "quo-lock"
	labelEdge     = "quo-edge"
	labelWardSign = "quo-ward-sign"
	labelWardSeal = "quo-ward-seal"
)

func kdf(ikm []byte, label string, n int) []byte {
	out, err := hkdf.Key(sha256.New, ikm, nil, label, n)
	if err != nil {
		panic(err)
	}
	return out
}

// SeedOf takes a seed as SPEC.md takes one: thirty-two bytes are the seed,
// any other length is hashed with SHA-256 first.
func SeedOf(b []byte) [32]byte {
	var s [32]byte
	if len(b) == 32 {
		copy(s[:], b)
		return s
	}
	return sha256.Sum256(b)
}

// SeedOfText takes text as a seed. Text is hashed whatever its length.
func SeedOfText(t string) [32]byte { return sha256.Sum256([]byte(t)) }

// A Ward is its seed, the keys the seed gives, its one lock and the heirs
// its door holds.
type Ward struct {
	Sign    ed25519.PrivateKey
	SignPK  []byte
	seal    *ecdh.PrivateKey
	Padlock []byte
	lock    *mlkem.DecapsulationKey768

	heirs map[string]*Heir // held, by the name the ward was given
	byPK  map[string]*Heir // every heir this ward made, by heir pk hex

	reach Target // what answers the zero head, nil for nothing
}

// A Heir is one relation as the occupant's door keeps it.
type Heir struct {
	PK      []byte
	spent   bool
	removed bool // the door stopped holding it

	held    []byte // the key held
	vouched []byte // the key vouched for, nil for nothing
	open    []byte // the open edge key
	offered []byte // the offered edge key
	highest uint64 // the highest number honoured

	reach Target
}

// NewWard stands a ward on a seed. The lock is drawn here, once.
func NewWard(seed [32]byte) *Ward {
	w := &Ward{heirs: map[string]*Heir{}, byPK: map[string]*Heir{}}
	w.Sign = ed25519.NewKeyFromSeed(kdf(seed[:], labelWardSign, 32))
	w.SignPK = w.Sign.Public().(ed25519.PublicKey)
	// X25519 clamps the scalar inside the function, and nothing before.
	k, err := ecdh.X25519().NewPrivateKey(kdf(seed[:], labelWardSeal, 32))
	if err != nil {
		panic(err)
	}
	w.seal = k
	w.Padlock = k.PublicKey().Bytes()
	w.lock, err = mlkem.GenerateKey768()
	if err != nil {
		panic(err)
	}
	return w
}

// PK is the ward pk: the signing pk, then the padlock, 128 lowercase hex.
func (w *Ward) PK() string {
	return hex.EncodeToString(w.SignPK) + hex.EncodeToString(w.Padlock)
}

var errNameHeld = errors.New("name held")

// Invitation is the invitation of SPEC.md.
type Invitation struct {
	Ward   string `json:"ward"`
	Heir   string `json:"heir"`
	Secret string `json:"secret"`
	Lock   string `json:"lock"`
}

// Invite makes a heir, holds its pk under name, and gives its secret away.
// The ward keeps no heir secret.
func (w *Ward) Invite(name string, reach Target) (*Invitation, error) {
	if _, held := w.heirs[name]; held {
		return nil, errNameHeld
	}
	secret := draw(32)
	pk := ed25519.NewKeyFromSeed(secret).Public().(ed25519.PublicKey)
	h := &Heir{PK: pk, reach: reach}
	w.heirs[name] = h
	w.byPK[hex.EncodeToString(pk)] = h
	return &Invitation{
		Ward:   w.PK(),
		Heir:   hex.EncodeToString(pk),
		Secret: hex.EncodeToString(secret),
		Lock:   hex.EncodeToString(w.lock.EncapsulationKey().Bytes()),
	}, nil
}

// Release makes the door stop holding the heir of that name. A spent heir
// keeps its keys at removal, for as long as the ward stands.
func (w *Ward) Release(name string) bool {
	h, ok := w.heirs[name]
	if !ok {
		return false
	}
	delete(w.heirs, name)
	h.removed = true
	return true
}

func (w *Ward) agree(peer []byte) ([]byte, bool) {
	pub, err := ecdh.X25519().NewPublicKey(peer)
	if err != nil {
		return nil, false
	}
	s, err := w.seal.ECDH(pub)
	if err != nil { // an all-zero agreement is a box that does not open
		return nil, false
	}
	return s, true
}
