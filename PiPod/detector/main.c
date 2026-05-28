// main.c — PiPod Stage-1 detector entry point (gap E1). SCAFFOLD.
//
// Pipeline: SDR -> /dev/shm ring -> stage1_energy (always on) -> stage2_dispatch
// (Python classifier, only on trigger) -> UART to ESP32-C6 (gap E3).
//
// Bodies are TODO stubs; this has not been run against hardware.

#include <stdio.h>
#include <string.h>

#include "detector.h"

int sdr_open_and_stream(const detector_cfg_t *cfg, iq_ring_t *ring) {
  (void)cfg;
  (void)ring;
  // TODO(E1): open RTL-SDR (librtlsdr) or HackRF (libhackrf) per pod, set center
  // freq + sample rate from cfg, and stream interleaved I/Q into the /dev/shm ring.
  return -1;
}

int tx_active_gpio_init(void) {
  // TODO(B6): open the TX_ACTIVE input via lgpio (/dev/gpiochip4 on Pi 5).
  return -1;
}

int tx_active_is_asserted(int fd) {
  (void)fd;
  // TODO(B6): read the line; gate stage1 while the ESP32-C6 is transmitting.
  return 0;
}

int main(int argc, char **argv) {
  (void)argc;
  (void)argv;

  // TODO(E1): parse pod/band config (center_hz, sample_rate_hz, threshold, dwell).
  detector_cfg_t cfg;
  memset(&cfg, 0, sizeof(cfg));

  fprintf(stderr, "pipod-detector: scaffold build — no SDR wired yet.\n");

  // TODO(E1): allocate iq_ring_t in /dev/shm (shm_open + mmap), spawn the SDR
  // reader (sdr_open_and_stream), then run the always-on consume loop:
  //
  //   while (running) {
  //     frame = ring_pop(ring);
  //     if (tx_active_is_asserted(gpio)) continue;        // self-jam gate (B6)
  //     if (stage1_energy(frame, &cfg, &power_db))
  //       stage2_dispatch(frame, &cfg);                   // -> classifier
  //   }
  return 0;
}
