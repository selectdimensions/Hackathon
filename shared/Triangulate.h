// Triangulate.h — on-device emitter localization for the master node (v0.3, WS3c).
//
// Mirrors DataAnalysisLog/triangulate.py: 3D acoustic TDOA (Gauss-Newton on
// GNSS-PPS-disciplined arrival times) plus a bearing/distance helper for building
// AlertPackets. Header-only inline, like Crypto.h. Sound at ~343 m/s makes 1 ms
// of clock error ~0.34 m, so PPS sync is ample (gap C1); RF sample-TDOA is NOT
// done here (needs coherent SDRs — v0.4).

#ifndef RFTM_TRIANGULATE_H
#define RFTM_TRIANGULATE_H

#include <math.h>
#include <stddef.h>
#include <stdint.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace rftm {

static constexpr float TRI_SPEED_OF_SOUND_MPS = 343.0f;

// One acoustic observation: pod position (deg / metres MSL) + absolute GNSS
// arrival time (microseconds). >=4 (one elevated) gives a 3D fix.
struct AcousticObs {
  double  lat;
  double  lon;
  double  alt_m;
  uint64_t t_us;
};

struct GeoFix {
  double lat;
  double lon;
  double alt_m;
  bool   ok;
};

// ---- local ENU (flat-earth, fine over a few km) ----
inline void tri_to_enu(double lat, double lon, double alt,
                       double lat0, double lon0,
                       double* e, double* n, double* u) {
  const double cos_lat = cos(lat0 * M_PI / 180.0);
  *e = (lon - lon0) * 111320.0 * cos_lat;
  *n = (lat - lat0) * 111132.0;
  *u = alt;
}

inline void tri_enu_to_geo(double e, double n, double lat0, double lon0,
                           double* lat, double* lon) {
  const double cos_lat = cos(lat0 * M_PI / 180.0);
  *lat = lat0 + n / 111132.0;
  *lon = lon0 + e / (111320.0 * cos_lat);
}

// Solve a small N x N system in place (Gaussian elimination, partial pivot).
// Returns false if singular. a is row-major NxN, b length N, x length N.
template <int N>
inline bool tri_solve_linear(double a[N][N], double b[N], double x[N]) {
  double m[N][N + 1];
  for (int i = 0; i < N; ++i) {
    for (int j = 0; j < N; ++j) m[i][j] = a[i][j];
    m[i][N] = b[i];
  }
  for (int col = 0; col < N; ++col) {
    int piv = col;
    for (int r = col + 1; r < N; ++r)
      if (fabs(m[r][col]) > fabs(m[piv][col])) piv = r;
    if (fabs(m[piv][col]) < 1e-12) return false;
    if (piv != col)
      for (int c = 0; c <= N; ++c) {
        double t = m[col][c]; m[col][c] = m[piv][c]; m[piv][c] = t;
      }
    for (int r = 0; r < N; ++r) {
      if (r == col) continue;
      const double f = m[r][col] / m[col][col];
      for (int c = col; c <= N; ++c) m[r][c] -= f * m[col][c];
    }
  }
  for (int i = 0; i < N; ++i) x[i] = m[i][N] / m[i][i];
  return true;
}

// 3D acoustic TDOA via Gauss-Newton on (e, n, u, t0). Needs n_obs >= 4.
inline GeoFix tri_solve_acoustic_tdoa(const AcousticObs* obs, size_t n_obs) {
  GeoFix out = {0, 0, 0, false};
  if (n_obs < 4) return out;

  double lat0 = 0, lon0 = 0;
  uint64_t t_min = obs[0].t_us;
  for (size_t i = 0; i < n_obs; ++i) {
    lat0 += obs[i].lat;
    lon0 += obs[i].lon;
    if (obs[i].t_us < t_min) t_min = obs[i].t_us;
  }
  lat0 /= n_obs;
  lon0 /= n_obs;

  // Project to ENU + relative arrival time (seconds).
  double E[16], Nn[16], U[16], T[16];  // cap at 16 pods
  if (n_obs > 16) n_obs = 16;
  for (size_t i = 0; i < n_obs; ++i) {
    tri_to_enu(obs[i].lat, obs[i].lon, obs[i].alt_m, lat0, lon0, &E[i], &Nn[i], &U[i]);
    T[i] = static_cast<double>(obs[i].t_us - t_min) * 1e-6;
  }

  // Initial guess: centroid, mean altitude, emission just before earliest arrival.
  double e = 0, n = 0, u = 0, t0;
  double t_min_rel = T[0];
  for (size_t i = 0; i < n_obs; ++i) {
    e += E[i]; n += Nn[i]; u += U[i];
    if (T[i] < t_min_rel) t_min_rel = T[i];
  }
  e /= n_obs; n /= n_obs; u /= n_obs;
  t0 = t_min_rel - 0.03;
  const double c = TRI_SPEED_OF_SOUND_MPS;

  for (int iter = 0; iter < 50; ++iter) {
    double jtj[4][4] = {{0}};
    double jtf[4] = {0, 0, 0, 0};
    for (size_t i = 0; i < n_obs; ++i) {
      const double de = e - E[i], dn = n - Nn[i], du = u - U[i];
      double d = sqrt(de * de + dn * dn + du * du);
      if (d < 1e-6) d = 1e-6;
      const double f = d - c * (T[i] - t0);
      const double jr[4] = {de / d, dn / d, du / d, c};
      for (int r = 0; r < 4; ++r) {
        jtf[r] += jr[r] * f;
        for (int cc = 0; cc < 4; ++cc) jtj[r][cc] += jr[r] * jr[cc];
      }
    }
    double rhs[4] = {-jtf[0], -jtf[1], -jtf[2], -jtf[3]};
    double step[4];
    if (!tri_solve_linear<4>(jtj, rhs, step)) break;
    e += step[0]; n += step[1]; u += step[2]; t0 += step[3];
    if (fabs(step[0]) + fabs(step[1]) + fabs(step[2]) < 0.01) break;
  }

  tri_enu_to_geo(e, n, lat0, lon0, &out.lat, &out.lon);
  out.alt_m = u;
  out.ok = true;
  return out;
}

// Bearing (deg true, 0..360) and great-circle distance (m) from observer to target.
inline void tri_bearing_distance(double from_lat, double from_lon,
                                 double to_lat, double to_lon,
                                 float* bearing_deg, float* dist_m) {
  const double R = 6371000.0;
  const double p1 = from_lat * M_PI / 180.0, p2 = to_lat * M_PI / 180.0;
  const double dp = (to_lat - from_lat) * M_PI / 180.0;
  const double dl = (to_lon - from_lon) * M_PI / 180.0;
  const double a = sin(dp / 2) * sin(dp / 2) +
                   cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2);
  *dist_m = static_cast<float>(2 * R * asin(fmin(1.0, sqrt(a))));
  const double y = sin(dl) * cos(p2);
  const double x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl);
  double brg = atan2(y, x) * 180.0 / M_PI;
  if (brg < 0) brg += 360.0;
  *bearing_deg = static_cast<float>(brg);
}

// Map a great-circle distance (m) to the AlertPacket.distance_code log scale.
inline uint8_t tri_distance_code(float dist_m) {
  if (dist_m < 25.0f) return 0;
  if (dist_m < 50.0f) return 1;
  if (dist_m < 100.0f) return 2;
  if (dist_m < 200.0f) return 3;
  if (dist_m < 500.0f) return 4;
  if (dist_m < 1000.0f) return 5;
  if (dist_m < 2000.0f) return 6;
  return 7;
}

}  // namespace rftm

#endif  // RFTM_TRIANGULATE_H
