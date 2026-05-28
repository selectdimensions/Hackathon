// stage2_trigger.c — dispatch a triggering frame to the Python classifier (gap E1/E2).
// SCAFFOLD. The classifier returns (threat_class, confidence); the result becomes a
// DetectPacket payload sent over UART to the ESP32-C6 (gap E3).

#include "detector.h"

int stage2_dispatch(const iq_t frame[FFT_SIZE], const detector_cfg_t *cfg) {
  (void)frame;
  (void)cfg;
  // TODO(E2): write the triggering I/Q window to a fast IPC channel (e.g. a second
  // /dev/shm slot or a unix socket) and signal the Python classifier process. Keep
  // this non-blocking so the always-on Stage-1 loop never stalls.
  //
  // TODO(E3): on classifier reply, populate a rftm::DetectPacket and COBS-frame it
  // onto the UART to the ESP32-C6 (see ../uart_bridge/uart_proto.h).
  return 0;
}
