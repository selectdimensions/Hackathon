# Pi → ESP32-C6 UART contract (gap E3)

The Pi forwards classified detections to the ESP32-C6 companion, which encrypts and
transmits them. The link carries **plaintext detection metadata only — never keys**.

## Physical

- 921600 baud, 8N1, one direction in normal operation (Pi → ESP32-C6).
- The ESP32-C6 may pulse a `TX_ACTIVE` GPIO back to the Pi for self-jam gating
  (gap B6) — that is a GPIO line, not part of this UART framing.

## Framing (COBS)

Each frame is COBS-encoded and delimited by `0x00`:

```
0x00 | COBS( TYPE | LEN | PAYLOAD | CRC16 ) | 0x00
```

| Field | Bytes | Notes |
|---|---|---|
| TYPE | 1 | 0x01 = DetectPacket, 0x02 = HeartbeatPacket (room to grow) |
| LEN | 1 | length of PAYLOAD |
| PAYLOAD | LEN | the exact packed struct from `shared/Protocol.h` |
| CRC16 | 2 | CRC-16/CCITT over `TYPE | LEN | PAYLOAD`, matches `crc16_ccitt()` |

`PAYLOAD` for TYPE 0x01 is the 28-byte packed `DetectPacket` (the same struct the
ESP32-C6 then wraps in the AES-128-CCM envelope). The Pi populates every field
including `pps_timestamp_us` (see [../docs/pps.md](../docs/pps.md)); the ESP32-C6
fills `node_id`/`seq` as needed and is the sole crypto authority.

## Shared header

`uart_proto.h` defines `TYPE_*`, baud, and a COBS encode/decode pair. It is intended
to be copied into the ESP32-C6 sketch dir by `shared/sync_shared.ps1` (extend that
script) so both ends share one definition.
