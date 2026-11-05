package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"slices"
)

const (
	boxSize  = 1048576 // the one size
	ctSize   = 1088    // an ML-KEM-768 ciphertext
	sigSize  = 64
	tagSize  = 16
	pkSize   = 32
	headSeal = pkSize + tagSize // a sealed head
)

var zero32 = make([]byte, 32)

// silenceText is silence, the sixteen bytes a door writes.
var silenceText = []byte(`{"silence":true}`)

func isZero(b []byte) bool { return len(b) == 32 && slices.Equal(b, zero32) }

// draw is where every drawn byte of this kit comes from.
func draw(n int) []byte {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return b
}

func gcm(keyNonce []byte) (cipher.AEAD, []byte) {
	blk, err := aes.NewCipher(keyNonce[:32])
	if err != nil {
		panic(err)
	}
	a, err := cipher.NewGCM(blk) // twelve-byte nonce, sixteen-byte tag at the end
	if err != nil {
		panic(err)
	}
	return a, keyNonce[32:44]
}

func sealWith(keyNonce, plain, aad []byte) []byte {
	a, n := gcm(keyNonce)
	return a.Seal(nil, n, plain, aad)
}

func openWith(keyNonce, ct, aad []byte) ([]byte, bool) {
	if len(ct) < tagSize {
		return nil, false
	}
	a, n := gcm(keyNonce)
	p, err := a.Open(nil, n, ct, aad)
	return p, err == nil
}

// headKN is the key and nonce under quo-seal: an ask's head.
func headKN(agreement []byte) []byte { return kdf(agreement, labelSeal, 44) }

// bodyKN is the key and nonce of a body under an edge key, an ask's or a
// reply's.
func bodyKN(agreement, edge []byte) []byte {
	return kdf(slices.Concat(agreement, edge), labelEdgeSeal, 44)
}

// knockEdge is a knock's edge key from its shared secret.
func knockEdge(shared []byte) []byte { return kdf(shared, labelLock, 32) }

// follow is the edge key that follows a reply.
func follow(edge, replyAgreement []byte) []byte {
	return kdf(slices.Concat(edge, replyAgreement), labelEdge, 32)
}

// x25519 agrees a secret with a public key. It errors when the agreement is
// all zero, which is a public key that takes no seal.
func x25519(secret, peer []byte) ([]byte, error) {
	k, err := ecdh.X25519().NewPrivateKey(secret)
	if err != nil {
		return nil, err
	}
	p, err := ecdh.X25519().NewPublicKey(peer)
	if err != nil {
		return nil, err
	}
	return k.ECDH(p)
}

func x25519Pub(secret []byte) []byte {
	k, err := ecdh.X25519().NewPrivateKey(secret)
	if err != nil {
		panic(err)
	}
	return k.PublicKey().Bytes()
}

// takesSeal says a public key is not an X25519 point of small order. Every
// agreement with a small-order point is zero, whatever the secret.
func takesSeal(pk []byte) bool {
	probe := make([]byte, 32)
	probe[0] = 9
	_, err := x25519(probe, pk)
	return err == nil
}

// sealAsk seals an ask's box to a padlock that takes a seal. ct is nil on an
// ask that is not a knock. It answers the box and the lid's secret.
func sealAsk(padlock, head, ct, edge, payload []byte, signer ed25519.PrivateKey) (box, lidSecret []byte) {
	lidSecret = draw(32)
	lid := x25519Pub(lidSecret)
	agr, err := x25519(lidSecret, padlock)
	if err != nil {
		panic("a padlock that takes no seal reached an ask")
	}
	body := slices.Concat(payload, ed25519.Sign(signer, payload))
	box = slices.Concat(lid,
		sealWith(headKN(agr), head, lid),
		ct,
		sealWith(bodyKN(agr, edge), body, lid))
	return box, lidSecret
}

// sealReply seals a reply text to a lid that takes a seal, signed by the
// ward over the lid and then the reply text. The lid is signed and is not in
// the body. The body is sealed under the edge key the ask came under, and
// under the zero edge key when the reply is silence. It answers the box and
// the reply's agreement.
func sealReply(lid, text, cameUnder []byte, sign ed25519.PrivateKey) (box, agr []byte) {
	if slices.Equal(text, silenceText) {
		cameUnder = zero32
	}
	eph := draw(32)
	ephPK := x25519Pub(eph)
	a, err := x25519(eph, lid)
	if err != nil {
		panic("a lid that takes no seal reached a reply")
	}
	body := slices.Concat(text, ed25519.Sign(sign, slices.Concat(lid, text)))
	return slices.Concat(ephPK, sealWith(bodyKN(a, cameUnder), body, ephPK)), a
}

var errNoOpen = errors.New("does not open")

// openReply opens a reply as the asker, under the edge key its ask was sent
// under. It answers the reply text and the reply's agreement, or errNoOpen
// for a reply that reads as silence before its text is read. Silence under
// the zero edge key is one of those, and an object or a word under it another.
func openReply(box, lidSecret, sentUnder, wardSignPK []byte) (text, agreement []byte, err error) {
	if len(box) > boxSize || len(box) < pkSize+tagSize+sigSize {
		return nil, nil, errNoOpen
	}
	eph := box[:pkSize]
	agr, err := x25519(lidSecret, eph)
	if err != nil {
		return nil, nil, errNoOpen
	}
	body, ok := openWith(bodyKN(agr, sentUnder), box[pkSize:], eph)
	if !ok || len(body) < sigSize {
		return nil, nil, errNoOpen
	}
	text = body[:len(body)-sigSize]
	if !Verify(wardSignPK, slices.Concat(x25519Pub(lidSecret), text), body[len(body)-sigSize:]) {
		return nil, nil, errNoOpen
	}
	return text, agr, nil
}
