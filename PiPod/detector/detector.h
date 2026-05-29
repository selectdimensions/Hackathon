// detector.h — shared declarations for the PiPod Stage-1 energy detector (gap E1).
// Scaffold: signatures are stable; bodies in the .c files are TODO stubs.

#ifndef PIPOD_DETECTOR_H
#define PIPOD_DETECTOR_H

#include <stddef.h>
#include <stdint.h>

#define FFT_SIZE        4096
#define RING_SLOTS      64        // power-of-two ring of FFT_SIZE complex frames
#define SHM_NAME        "/pipod_iq_ring"

// One complex sample as interleaved float32 I/Q.
typedef struct {
  float i;
  float q;
} iq_t;

// Ring buffer in /dev/shm shared between the SDR reader and the energy stage.
typedef struct {
  volatile uint64_t head;          // producer index (SDR reader)
  volatile uint64_t tail;          // consumer index (energy stage)
  iq_t   slots[RING_SLOTS][FFT_SIZE];
} iq_ring_t;

// Stage-1 config (per pod / per band).
typedef struct {
  double   center_hz;
  double   sample_rate_hz;
  float    threshold_db;           // power above noise floor that arms a trigger
  uint32_t dwell_ms;               // sustained time above threshold to fire
} detector_cfg_t;

// main.c
int  sdr_open_and_stream(const detector_cfg_t *cfg, iq_ring_t *ring);
int  tx_active_gpio_init(void);    // gap B6 — returns fd or -1
int  tx_active_is_asserted(int fd);

// stage1_energy.c — returns 1 if a trigger fired (threshold+dwell met), else 0.
// On trigger, fills out_band_power_db over the frame's bins.
int  stage1_energy(const iq_t frame[FFT_SIZE], const detector_cfg_t *cfg,
                   float *out_band_power_db);

// stage2_trigger.c — hand the triggering frame to the Python classifier.
// Returns 0 on success. Non-blocking w.r.t. the always-on loop.
int  stage2_dispatch(const iq_t frame[FFT_SIZE], const detector_cfg_t *cfg);

#endif  // PIPOD_DETECTOR_H
