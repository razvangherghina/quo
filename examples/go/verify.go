package main

import (
	"crypto/ed25519"
	"math/big"
)

// Verify is the check of SPEC.md: cofactorless RFC 8032, with R compared as
// encoded bytes and s below the group order (both done by crypto/ed25519),
// plus two refusals crypto/ed25519 does not make: a public key whose y is at
// or above the prime, and a public key that is small-order in any spelling.
func Verify(pk, msg, sig []byte) bool {
	if len(pk) != 32 || len(sig) != 64 {
		return false
	}
	if !pkAcceptable(pk) {
		return false
	}
	return ed25519.Verify(ed25519.PublicKey(pk), msg, sig)
}

var (
	pField = new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 255), big.NewInt(19))
	dCurve = func() *big.Int {
		// d = -121665 / 121666 mod p
		n := new(big.Int).Neg(big.NewInt(121665))
		inv := new(big.Int).ModInverse(big.NewInt(121666), pField)
		n.Mul(n, inv)
		return n.Mod(n, pField)
	}()
	sqrtM1 = func() *big.Int {
		// 2^((p-1)/4)
		e := new(big.Int).Rsh(new(big.Int).Sub(pField, big.NewInt(1)), 2)
		return new(big.Int).Exp(big.NewInt(2), e, pField)
	}()
)

func leInt(b []byte) *big.Int {
	be := make([]byte, len(b))
	for i := range b {
		be[len(b)-1-i] = b[i]
	}
	return new(big.Int).SetBytes(be)
}

func pkAcceptable(pk []byte) bool {
	yb := make([]byte, 32)
	copy(yb, pk)
	sign := yb[31] >> 7
	yb[31] &= 0x7f
	y := leInt(yb)
	if y.Cmp(pField) >= 0 {
		return false
	}
	x, ok := decompress(y, sign)
	if !ok {
		return false // not a point; crypto/ed25519 would refuse it too
	}
	if x.Sign() == 0 {
		// x = 0 is y = 1 or y = -1, both small-order, in either sign spelling
		return false
	}
	px, py := x, y
	for range 3 {
		px, py = edAdd(px, py, px, py)
	}
	return !(px.Sign() == 0 && py.Cmp(big.NewInt(1)) == 0)
}

func decompress(y *big.Int, sign byte) (*big.Int, bool) {
	p := pField
	y2 := new(big.Int).Mul(y, y)
	y2.Mod(y2, p)
	u := new(big.Int).Sub(y2, big.NewInt(1))
	u.Mod(u, p)
	v := new(big.Int).Mul(dCurve, y2)
	v.Add(v, big.NewInt(1))
	v.Mod(v, p)
	vi := new(big.Int).ModInverse(v, p)
	if vi == nil {
		return nil, false
	}
	x2 := new(big.Int).Mul(u, vi)
	x2.Mod(x2, p)
	if x2.Sign() == 0 {
		return new(big.Int), true
	}
	e := new(big.Int).Add(p, big.NewInt(3))
	e.Rsh(e, 3)
	x := new(big.Int).Exp(x2, e, p)
	chk := new(big.Int).Mul(x, x)
	chk.Mod(chk, p)
	if chk.Cmp(x2) != 0 {
		x.Mul(x, sqrtM1)
		x.Mod(x, p)
		chk.Mul(x, x)
		chk.Mod(chk, p)
		if chk.Cmp(x2) != 0 {
			return nil, false
		}
	}
	if byte(x.Bit(0)) != sign {
		x.Sub(p, x)
	}
	return x, true
}

// edAdd adds two affine points of -x^2 + y^2 = 1 + d x^2 y^2.
func edAdd(x1, y1, x2, y2 *big.Int) (*big.Int, *big.Int) {
	p := pField
	t := new(big.Int).Mul(x1, x2)
	t.Mul(t, y1)
	t.Mul(t, y2)
	t.Mul(t, dCurve)
	t.Mod(t, p)

	xn := new(big.Int).Add(new(big.Int).Mul(x1, y2), new(big.Int).Mul(y1, x2))
	xd := new(big.Int).Add(big.NewInt(1), t)
	yn := new(big.Int).Add(new(big.Int).Mul(y1, y2), new(big.Int).Mul(x1, x2))
	yd := new(big.Int).Sub(big.NewInt(1), t)

	x3 := xn.Mul(xn, new(big.Int).ModInverse(xd.Mod(xd, p), p))
	y3 := yn.Mul(yn, new(big.Int).ModInverse(yd.Mod(yd, p), p))
	return x3.Mod(x3, p), y3.Mod(y3, p)
}
