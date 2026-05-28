// stage1_energy.c — windowed FFT power estimate + threshold/dwell (gap E1). SCAFFOLD.
// Reference: Yucek & Arslan 2009; Mariani/Giorgetti/Chiani 2011 (see ../REFERENCES.md).

#include "detector.h"

int stage1_energy(const iq_t frame[FFT_SIZE], const detector_cfg_t *cfg,
                  float *out_band_power_db) {
  (void)frame;
  (void)cfg;
  if (out_band_power_db) {
    *out_band_power_db = 0.0f;
  }
  // TODO(E1):
  //   1. Apply a Hann window over the FFT_SIZE frame.
  //   2. fftwf_execute a real->complex (or complex) FFT (plan created once, reused).
  //   3. Compute magnitude^2 per bin; integrate over the band of interest.
  //   4. Track a rolling noise-floor estimate; compare (power - floor) to
  //      cfg->threshold_db with a cfg->dwell_ms hysteresis timer.
  //   5. Return 1 when threshold+dwell are met, else 0.
  return 0;
}
