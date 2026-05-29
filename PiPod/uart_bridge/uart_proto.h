// uart_proto.h — Pi <-> ESP32-C6 UART framing for PiPod (gap E3).
// SECURITY: this link carries plaintext DetectPacket metadata only. AES/Ed25519
// keys never traverse it; the ESP32-C6 is the sole crypto authority.
//
// Intended to be shared by both ends (Pi C build + ESP32-C6 sketch) via
// shared/sync_shared.ps1. Pairs with PiPod/uart_bridge/uart_proto.md.

#ifndef PIPOD_UART_PROTO_H
#define PIPOD_UART_PROTO_H

#include <stddef.h>
#include <stdint.h>

#define PIPOD_UART_BAUD 921600u

// Frame TYPE byte.
enum {
  UART_TYPE_DETECT    = 0x01,  // PAYLOAD = packed rftm::DetectPacket (28 B)
  UART_TYPE_HEARTBEAT = 0x02,  // PAYLOAD = packed rftm::HeartbeatPacket (9 B)
};

// Frame on the wire (before COBS): [TYPE | LEN | PAYLOAD(LEN) | CRC16_lo | CRC16_hi]
// then COBS-encoded and bracketed by 0x00 delimiters.

// COBS encode src[0..len) into dst. dst must hold at least len + len/254 + 2 bytes.
// Returns encoded length (excluding the trailing 0x00 delimiter, which the caller
// appends). TODO: implement; this is the scaffold signature.
static inline size_t cobs_encode(const uint8_t *src, size_t len, uint8_t *dst) {
  (void)src;
  (void)len;
  (void)dst;
  return 0;  // TODO(E3): real COBS encode
}

// COBS decode src[0..len) (one frame, no delimiters) into dst.
// Returns decoded length, or 0 on malformed input. TODO: implement.
static inline size_t cobs_decode(const uint8_t *src, size_t len, uint8_t *dst) {
  (void)src;
  (void)len;
  (void)dst;
  return 0;  // TODO(E3): real COBS decode
}

#endif  // PIPOD_UART_PROTO_H
