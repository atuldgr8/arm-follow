// ============================================================
// TRACKING LAB · filters.js
// The smoothing methods being compared. Each one takes a single number
// (one coordinate of one point) arriving over time, and gives back the
// smoothed number. Every point and coordinate gets its own copy.
//   Raw            nothing done (the reference)
//   Average        the mean of the last N samples
//   One Euro       calm when still, quick when moving (Casiez et al. 2012), the main build's filter
//   Kalman         follows position AND speed; can lead a little to hide its own lag
//   Delay + curve  waits a moment, then draws a smooth (Gaussian-weighted) curve through
//                  the samples on both sides: the smoothest, but always that much late
// ============================================================

class RawF { filter(v) { return v; } }

class AvgF {
  constructor(p) { this.p = p; this.buf = []; }
  filter(v) {
    this.buf.push(v); while (this.buf.length > Math.max(1, Math.round(this.p.n))) this.buf.shift();
    let s = 0; for (let b of this.buf) { s += b; } return s / this.buf.length;
  }
}

class EuroF {
  constructor(p) { this.p = p; this.x = null; this.dx = 0; this.t = 0; }
  static a(dt, c) { return 1 / (1 + 1 / (2 * Math.PI * c * dt)); }
  filter(v, t) {
    if (this.x === null) { this.x = v; this.t = t; return v; }
    let dt = Math.max(0.001, t - this.t); this.t = t;
    this.dx += EuroF.a(dt, 1) * ((v - this.x) / dt - this.dx);
    this.x += EuroF.a(dt, this.p.minC + this.p.beta * Math.abs(this.dx)) * (v - this.x);
    return this.x;
  }
}

// constant-speed Kalman filter on one number: state = (position, speed)
class KalmanF {
  constructor(p) { this.p = p; this.x = null; }
  filter(v, t) {
    let q = Math.pow(10, this.p.q), r = this.p.r * this.p.r;
    if (this.x === null) { this.x = v; this.v = 0; this.P = [[r, 0], [0, 1e4]]; this.t = t; return v; }
    let dt = Math.max(0.001, t - this.t); this.t = t;
    // predict
    let x = this.x + this.v * dt, vv = this.v, P = this.P;
    let p00 = P[0][0] + dt * (P[1][0] + P[0][1]) + dt * dt * P[1][1] + q * dt * dt * dt / 3;
    let p01 = P[0][1] + dt * P[1][1] + q * dt * dt / 2, p10 = P[1][0] + dt * P[1][1] + q * dt * dt / 2, p11 = P[1][1] + q * dt;
    // update with the measurement
    let S = p00 + r, k0 = p00 / S, k1 = p10 / S, y = v - x;
    this.x = x + k0 * y; this.v = vv + k1 * y;
    this.P = [[(1 - k0) * p00, (1 - k0) * p01], [p10 - k1 * p00, p11 - k1 * p01]];
    return this.x + this.v * this.p.lead / 1000;   // lead: look slightly ahead to make up for the smoothing
  }
}

// waits `ms`, then gives a Gaussian-weighted average of the samples around (now − ms)
class DelayF {
  constructor(p) { this.p = p; this.buf = []; }
  filter(v, t) {
    let D = this.p.ms / 1000; this.buf.push([t, v]);
    while (this.buf.length > 2 && this.buf[0][0] < t - 2 * D - 0.05) this.buf.shift();
    if (D <= 0) return v;
    let c = t - D, sig = D / 2, sw = 0, s = 0;
    for (let [tt, vv] of this.buf) { let w = Math.exp(-0.5 * ((tt - c) / sig) ** 2); sw += w; s += w * vv; }
    return sw > 0 ? s / sw : v;
  }
}

// the methods, their colours on the graphs, and their settings (sliders)
const METHODS = [
  { id: 'raw', name: 'Raw', col: '#9a9a96', on: true, make: () => new RawF(), params: {}, info: 'What the tracker gives, untouched.' },
  { id: 'avg', name: 'Simple average', col: '#B9A2FF', on: false, make: p => new AvgF(p), params: { n: 5 },
    sliders: [['n', 'Samples averaged', 2, 20, 1, v => v + ' frames']], info: 'The mean of the last few samples. Simple; smooth and late in equal measure.' },
  { id: 'euro', name: 'One Euro', col: '#2F5BFF', on: true, make: p => new EuroF(p), params: { minC: 1.0, beta: 0.0063 },
    sliders: [['minC', 'Calm when still (lower = calmer)', 0.05, 5, 0.05, v => v.toFixed(2) + ' Hz'], ['beta', 'Quick when moving', 0, 0.06, 0.0005, v => v.toFixed(4)]],
    info: 'Calm when still, quick when moving: smoothing eases off with speed. What the main build and Arm Follow use (these are their middle settings).' },
  { id: 'kalman', name: 'Kalman (predictive)', col: '#12A150', on: true, make: p => new KalmanF(p), params: { q: 4.5, r: 3, lead: 0 },
    sliders: [['q', 'Follows sudden changes', 2, 8, 0.1, v => '10^' + v.toFixed(1)], ['r', 'Expected shake (px)', 0.5, 20, 0.5, v => v.toFixed(1)], ['lead', 'Looks ahead', 0, 120, 5, v => v + ' ms']],
    info: 'Tracks where a point is AND how fast it moves, so it can look a little ahead to make up for its own lag. Overshoots a bit when you stop suddenly.' },
  { id: 'delay', name: 'Delay + curve', col: '#FF5A1F', on: true, make: p => new DelayF(p), params: { ms: 80 },
    sliders: [['ms', 'Waits', 0, 250, 5, v => v + ' ms']], info: 'Waits a moment, then draws a smooth curve through the samples on both sides. The smoothest, but always exactly that much late.' },
];
