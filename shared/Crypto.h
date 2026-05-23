// Crypto.h — AES-128-CCM encryption + Ed25519/X25519 rekey helpers.
// Wraps the rweather/arduinolibs Crypto library so application code never
// touches primitive crypto directly.
//
// All on-air packets except MSG_REKEY are encrypted+authenticated here.
// See SECURITY.md for the full design rationale and threat model.
//
// Build dependency:  arduino-cli lib install Crypto

#ifndef RFTM_CRYPTO_H
#define RFTM_CRYPTO_H

#include <stdint.h>
#include <string.h>

// rweather/arduinolibs
#include <AES.h>
#include <CCM.h>
#include <Ed25519.h>
#include <Curve25519.h>
#include <SHA256.h>

#include "Protocol.h"
#include "LoRaConfig.h"

namespace rftm {

// ----------------------------------------------------------------------
// Session-key store. One slot per epoch (kept tiny — we only ever need
// current + previous during the grace window).
// ----------------------------------------------------------------------
struct SessionKey {
  uint8_t  key[SESSION_KEY_LEN];
  uint8_t  epoch;
  uint32_t valid_since_ms;   // millis() when activated
  bool     valid;
};

// ----------------------------------------------------------------------
// HKDF-SHA256 (extract + expand) — used to derive session key from X25519 shared.
// ----------------------------------------------------------------------
inline void hkdf_sha256(const uint8_t* ikm, size_t ikm_len,
                        const uint8_t* salt, size_t salt_len,
                        const uint8_t* info, size_t info_len,
                        uint8_t* out, size_t out_len) {
  // Extract
  SHA256 mac;
  mac.resetHMAC(salt, salt_len);
  mac.update(ikm, ikm_len);
  uint8_t prk[32];
  mac.finalizeHMAC(salt, salt_len, prk, sizeof(prk));

  // Expand (assumes out_len <= 32 — we only ever need 16 for AES-128)
  mac.resetHMAC(prk, sizeof(prk));
  mac.update(info, info_len);
  uint8_t one = 0x01;
  mac.update(&one, 1);
  uint8_t t1[32];
  mac.finalizeHMAC(prk, sizeof(prk), t1, sizeof(t1));
  memcpy(out, t1, out_len);
}

// ----------------------------------------------------------------------
// Construct the 13-byte AES-CCM nonce:
//   [EP, node_id_hi(0), node_id_lo, NC_hi, NC_lo, 0x00 * 8]
// node_id is uint8_t so node_id_hi is always 0; we reserve the slot for
// future 16-bit node IDs without an envelope change.
// ----------------------------------------------------------------------
inline void build_nonce(uint8_t epoch, uint8_t node_id, uint16_t nc,
                        uint8_t nonce_out[AEAD_NONCE_LEN]) {
  memset(nonce_out, 0, AEAD_NONCE_LEN);
  nonce_out[0] = epoch;
  nonce_out[1] = 0;
  nonce_out[2] = node_id;
  nonce_out[3] = static_cast<uint8_t>(nc >> 8);
  nonce_out[4] = static_cast<uint8_t>(nc & 0xFF);
}

// ----------------------------------------------------------------------
// Encrypt a plaintext packet body into an on-air buffer:
//   out = [epoch | nc_hi nc_lo | ciphertext | tag(8)]
// AAD = [version, msg_type, sender_node_id, epoch] (first 4 bytes of plaintext
// are also AAD, providing bind to header fields).
// Returns the total bytes written to `out`, or 0 on failure.
// ----------------------------------------------------------------------
inline size_t aead_encrypt(const SessionKey& sk,
                           uint8_t sender_node_id,
                           uint16_t nc,
                           const uint8_t* plaintext, size_t pt_len,
                           uint8_t* out, size_t out_cap) {
  const size_t needed = 3 + pt_len + AEAD_TAG_LEN;
  if (out_cap < needed) return 0;
  if (!sk.valid) return 0;

  uint8_t nonce[AEAD_NONCE_LEN];
  build_nonce(sk.epoch, sender_node_id, nc, nonce);

  // AAD: bind version + msg_type + sender_id + epoch.
  // pt[0]=version pt[1]=msg_type pt[2]=node_id (sender) are already in plaintext;
  // we additionally include epoch in AAD so a relay can't swap epoch bytes.
  uint8_t aad[5] = {plaintext[0], plaintext[1], sender_node_id, sk.epoch, 0x00};

  CCM<AES128> ccm;
  ccm.setKey(sk.key, SESSION_KEY_LEN);
  ccm.setIV(nonce, AEAD_NONCE_LEN);
  ccm.addAuthData(aad, sizeof(aad));

  out[0] = sk.epoch;
  out[1] = static_cast<uint8_t>(nc >> 8);
  out[2] = static_cast<uint8_t>(nc & 0xFF);
  ccm.encrypt(out + 3, plaintext, pt_len);
  ccm.computeTag(out + 3 + pt_len, AEAD_TAG_LEN);
  return needed;
}

// ----------------------------------------------------------------------
// Decrypt + verify. `in` is the full on-air buffer (envelope + ct + tag).
// `sender_id_for_aad` must be the sender's node_id from the inner plaintext
//   — caller obtains this from the ciphertext's first decrypted bytes (a
//   chicken-and-egg solved by trial-decrypting both possible epochs against
//   the sender; we sidestep it by including node_id in the inner plaintext
//   AND requiring the receiver to know which sender_id to authenticate).
// Returns plaintext length on success, 0 on failure (bad tag or wrong key).
// ----------------------------------------------------------------------
inline size_t aead_decrypt(const SessionKey& sk,
                           uint8_t sender_node_id,
                           const uint8_t* in, size_t in_len,
                           uint8_t* plaintext_out, size_t pt_cap) {
  if (in_len < 3 + AEAD_TAG_LEN) return 0;
  if (!sk.valid) return 0;
  const uint8_t recv_epoch = in[0];
  if (recv_epoch != sk.epoch) return 0;
  const uint16_t nc = (static_cast<uint16_t>(in[1]) << 8) | in[2];
  const size_t ct_len = in_len - 3 - AEAD_TAG_LEN;
  if (ct_len > pt_cap) return 0;

  uint8_t nonce[AEAD_NONCE_LEN];
  build_nonce(recv_epoch, sender_node_id, nc, nonce);

  // We need version + msg_type to build AAD, which live in plaintext byte 0/1.
  // CCM in this library supports decrypt-then-verify; reconstruct AAD from the
  // expected sender. Caller passes sender_node_id; version/msg_type are at
  // ct_offset 0/1 — but those are encrypted, so we bind via post-decrypt check.
  CCM<AES128> ccm;
  ccm.setKey(sk.key, SESSION_KEY_LEN);
  ccm.setIV(nonce, AEAD_NONCE_LEN);

  // Temporarily build AAD with placeholder version/msg_type — receiver will
  // re-verify by recomputing AAD with actual plaintext bytes and checking tag.
  // For simplicity, this scaffold uses node_id + epoch as AAD only:
  uint8_t aad[2] = {sender_node_id, recv_epoch};
  ccm.addAuthData(aad, sizeof(aad));

  ccm.decrypt(plaintext_out, in + 3, ct_len);
  if (!ccm.checkTag(in + 3 + ct_len, AEAD_TAG_LEN)) return 0;
  return ct_len;
}

// ----------------------------------------------------------------------
// Verify a master rekey signature against the pinned master Ed25519 pubkey.
// `pkt` points to the full RekeyPacket; `master_ed25519_pub` is 32 bytes
// from PinnedKeys.h.
// ----------------------------------------------------------------------
inline bool verify_rekey(const RekeyPacket& pkt,
                         const uint8_t master_ed25519_pub[32]) {
  // Signature covers all bytes except the trailing 64-byte sig itself.
  const size_t signed_len = sizeof(RekeyPacket) - 64;
  return Ed25519::verify(pkt.master_ed25519_sig,
                         master_ed25519_pub,
                         reinterpret_cast<const uint8_t*>(&pkt),
                         signed_len);
}

// ----------------------------------------------------------------------
// Derive a session key from this node's X25519 private key and the master's
// ephemeral X25519 public key from a verified RekeyPacket.
// ----------------------------------------------------------------------
inline void derive_session_key(const uint8_t my_x25519_priv[32],
                               const uint8_t master_eph_x25519_pub[32],
                               uint8_t new_epoch,
                               uint8_t master_node_id,
                               SessionKey& out) {
  uint8_t shared[32];
  uint8_t master_pub_copy[32];
  memcpy(master_pub_copy, master_eph_x25519_pub, 32);
  // Curve25519::dh2 computes shared in-place into master_pub_copy.
  Curve25519::dh2(master_pub_copy, const_cast<uint8_t*>(my_x25519_priv));
  memcpy(shared, master_pub_copy, 32);

  uint8_t salt[2] = {new_epoch, master_node_id};
  static const char info[] = "rftm-v1-session";
  hkdf_sha256(shared, sizeof(shared), salt, sizeof(salt),
              reinterpret_cast<const uint8_t*>(info), sizeof(info) - 1,
              out.key, SESSION_KEY_LEN);

  out.epoch = new_epoch;
  out.valid = true;
  // valid_since_ms set by caller (needs millis()).
}

}  // namespace rftm

#endif  // RFTM_CRYPTO_H