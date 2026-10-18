// Monkey (Ryan Geiss, 2002) look-alike: platform-independent core.
// Model recovered from vis_monkey.dll (see ../NOTES.md): an endless tunnel network that is the marching-cubes
// isosurface of 16 wandering 2D "blobs" (extruded along z) plus 3D value noise, one unit-cube chunk per step.
// Works as a browser global (MonkeyCore) and as a CommonJS module (node preview).
(function (root) {
  'use strict';

  var MC_EDGES, MC_OFFSETS;
  if (typeof module !== 'undefined' && module.exports) {
    var t = require('./mc-table.js');
    MC_EDGES = t.MC_EDGES; MC_OFFSETS = t.MC_OFFSETS;
  } else {
    MC_EDGES = root.MC_EDGES; MC_OFFSETS = root.MC_OFFSETS;
  }

  var NB = 16; // blobs

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Bourke corner / edge numbering (matches the DLL's table).
  var CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  var EDGE = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

  function Tunnel(opts) {
    opts = opts || {};
    this.seed = opts.seed == null ? 1 : opts.seed;
    this.G = opts.G || 18;               // grid cells per chunk edge
    this.iso = opts.iso == null ? 0.045 : opts.iso;
    this.noiseAmp = opts.noiseAmp == null ? 0.06 : opts.noiseAmp;
    this.noiseFreq = opts.noiseFreq || 9.0;
    this.wander = opts.wander == null ? 15 : opts.wander;
    this.r0 = opts.r0 || 0.22;
    this.rng = mulberry32(this.seed);
    this.states = [];
    this.wx = new Float64Array(NB); this.wy = new Float64Array(NB);
    var r = this.rng;
    for (var i = 0; i < NB; i++) { this.wx[i] = r() * 6.283; this.wy[i] = r() * 6.283; }
    this.base = new Float64Array(NB);
    for (i = 0; i < NB; i++) this.base[i] = i === 0 ? this.r0 : 0.1 + r() * 0.12;
    this.ph = r() * 1000;
    // 16^3 random lattice in [-1,1]
    this.lat = new Float32Array(4096);
    for (i = 0; i < 4096; i++) this.lat[i] = r() * 2 - 1;
    // per-octave random rotation (3x3) and offset
    this.rot = []; this.off = [];
    for (var o = 0; o < 3; o++) {
      var a = r() * 6.283, b = r() * 6.283, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      this.rot.push([ca, -sa * cb, sa * sb, sa, ca * cb, -ca * sb, 0, sb, cb]);
      this.off.push([r() * 16, r() * 16, r() * 16]);
    }
  }

  // Per-chunk-boundary blob state (index k = integer z). Generated sequentially, memoised.
  Tunnel.prototype.state = function (k) {
    if (k < 0) k = 0;
    var S = this.states, ph = this.ph;
    while (S.length <= k) {
      var n = S.length, i;
      var s1 = Math.sin(n * 0.0159 + ph) , s2 = Math.sin(n * 0.0087 + ph * 1.3);
      var q = Math.max(0, Math.min(1, 0.5 + 0.2 * s1 + 0.3 * s2));
      var A = 0.075 * Math.pow(q, 18);                       // rare bursts that fatten the tunnel
      var axx = Math.pow(Math.max(0, 0.5 + 0.2 * Math.sin(n * 0.0131 + ph * 2.1) + 0.3 * Math.sin(n * 0.0117 + ph * 1.6)), 0.05) * 0.8 + 0.2;
      var axy = Math.pow(Math.max(0, 0.5 + 0.2 * Math.sin(n * 0.0101 + ph * 0.7) + 0.3 * Math.sin(n * 0.0159 + ph * 1.9)), 0.05) * 0.8 + 0.2;
      var cx = new Float32Array(NB), cy = new Float32Array(NB), rr = new Float32Array(NB);
      for (i = 0; i < NB; i++) {
        var cap = (i === 0 ? 0.06 : 0.12) * this.wander;
        if (n > 0) {
          var v1 = 0.5 + 0.5 * Math.sin(n * (0.05 + 0.013 * i) + i * 1.7 + ph);
          var v2 = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(n * 0.021 + i * 0.9 + ph));
          var v3 = 0.5 + 0.5 * Math.sin(n * (0.043 + 0.011 * i) + i * 2.3 + ph * 0.5);
          var v4 = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(n * 0.027 + i * 1.1 + ph * 0.8));
          this.wx[i] += cap * v1 * v2; this.wy[i] += cap * v3 * v4;
        }
        var amp = 0.335 - A;
        cx[i] = 0.5 + Math.sin(i * 11.7 + this.wx[i] - i * i * 0.351) * amp * axx;
        cy[i] = 0.5 + Math.sin(i * 14.7 + i * i * 0.755 + this.wy[i]) * amp * axy;
        rr[i] = this.base[i] + 2 * A;
      }
      S.push({ cx: cx, cy: cy, r: rr });
    }
    return S[k];
  };

  // Blob 0 (the tunnel axis) at continuous z.
  Tunnel.prototype.pathAt = function (z) {
    if (z < 0) z = 0;
    var k = Math.floor(z), f = z - k, a = this.state(k), b = this.state(k + 1);
    return [a.cx[0] * (1 - f) + b.cx[0] * f, a.cy[0] * (1 - f) + b.cy[0] * f];
  };

  Tunnel.prototype._noise = function (x, y, z) {
    // smooth value noise on a 16^3 periodic lattice
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var fx = x - xi, fy = y - yi, fz = z - zi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    var L = this.lat;
    function at(a, b, c) { return L[((c & 15) << 8) | ((b & 15) << 4) | (a & 15)]; }
    var c00 = at(xi, yi, zi) * (1 - fx) + at(xi + 1, yi, zi) * fx;
    var c10 = at(xi, yi + 1, zi) * (1 - fx) + at(xi + 1, yi + 1, zi) * fx;
    var c01 = at(xi, yi, zi + 1) * (1 - fx) + at(xi + 1, yi, zi + 1) * fx;
    var c11 = at(xi, yi + 1, zi + 1) * (1 - fx) + at(xi + 1, yi + 1, zi + 1) * fx;
    var c0 = c00 * (1 - fy) + c10 * fy, c1 = c01 * (1 - fy) + c11 * fy;
    return c0 * (1 - fz) + c1 * fz;
  };

  Tunnel.prototype.density = function (x, y, z, bl) {
    var F = 0, i;
    for (i = 0; i < NB; i++) {
      var dx = x - bl.cx[i], dy = y - bl.cy[i];
      var f = (dx * dx + dy * dy) / (bl.r[i] * bl.r[i]);
      if (f < 0.5) { var t = 0.5 - f; F += t * t; }
    }
    if (this.noiseAmp > 0) {
      var amp = this.noiseAmp, fr = this.noiseFreq, N = 0;
      for (var o = 0; o < 3 && amp >= 0.01; o++) {
        var R = this.rot[o], O = this.off[o];
        var px = (x * R[0] + y * R[1] + z * R[2]) * fr + O[0];
        var py = (x * R[3] + y * R[4] + z * R[5]) * fr + O[1];
        var pz = (x * R[6] + y * R[7] + z * R[8]) * fr + O[2];
        N += this._noise(px, py, pz) * amp;
        fr *= 1.937; amp *= 0.5163;
      }
      F += N;
    }
    // close the surface at the chunk's cross-section border (blobs near the edge would otherwise leave holes)
    var e = Math.min(x, 1 - x, y, 1 - y), w = e >= 0.07 ? 1 : (e <= 0 ? 0 : e / 0.07);
    return F * (w * w * (3 - 2 * w));
  };

  Tunnel.prototype._blobsAt = function (z, tmp) {
    if (z < 0) z = 0;
    var k = Math.floor(z), f = z - k, sa = this.state(k), sb = this.state(k + 1);
    for (var b = 0; b < NB; b++) {
      tmp.cx[b] = sa.cx[b] * (1 - f) + sb.cx[b] * f;
      tmp.cy[b] = sa.cy[b] * (1 - f) + sb.cy[b] * f;
      tmp.r[b] = sa.r[b] * (1 - f) + sb.r[b] * f;
    }
  };

  // Marching cubes over chunk k (z in [k,k+1]). Returns {pos, nrm}: Float32Arrays, 3 floats per vertex, 3 vertices per
  // triangle. Normals are the (outward) density gradient, so surfaces can be shaded smoothly across triangles.
  Tunnel.prototype.buildChunkN = function (k) {
    var G = this.G, n1 = G + 1, m = G + 3, iso = this.iso, inv = 1 / G;
    var vals = new Float32Array(m * m * m);
    var tmp = { cx: new Float32Array(NB), cy: new Float32Array(NB), r: new Float32Array(NB) };
    var l, j, i, b;
    for (l = -1; l <= G + 1; l++) {
      var z = k + l * inv;
      this._blobsAt(z, tmp);
      for (j = -1; j <= G + 1; j++) for (i = -1; i <= G + 1; i++)
        vals[((l + 1) * m + (j + 1)) * m + (i + 1)] = this.density(i * inv, j * inv, z, tmp);
    }
    function V(i, j, l) { return vals[((l + 1) * m + (j + 1)) * m + (i + 1)]; }
    // gradient at the (G+1)^3 corners
    var grad = new Float32Array(n1 * n1 * n1 * 3);
    for (l = 0; l <= G; l++) for (j = 0; j <= G; j++) for (i = 0; i <= G; i++) {
      var gi = ((l * n1 + j) * n1 + i) * 3;
      var gx = V(i + 1, j, l) - V(i - 1, j, l), gy = V(i, j + 1, l) - V(i, j - 1, l), gz = V(i, j, l + 1) - V(i, j, l - 1);
      var gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      grad[gi] = -gx / gl; grad[gi + 1] = -gy / gl; grad[gi + 2] = -gz / gl;
    }
    var pos = [], nrm = [], cv = new Float32Array(8), ev = new Float32Array(36), en = new Float32Array(36);
    for (l = 0; l < G; l++) for (j = 0; j < G; j++) for (i = 0; i < G; i++) {
      var idx = 0;
      for (b = 0; b < 8; b++) {
        var c = CORNER[b], v = V(i + c[0], j + c[1], l + c[2]);
        cv[b] = v;
        if (v >= iso) idx |= 1 << b;
      }
      if (idx === 0 || idx === 255) continue;
      var s = MC_OFFSETS[idx], e = MC_OFFSETS[idx + 1], have = 0;
      for (var p = s; p < e; p++) {
        var ed = MC_EDGES[p];
        if (!(have & (1 << ed))) {
          have |= 1 << ed;
          var a = EDGE[ed][0], bb = EDGE[ed][1];
          var va = cv[a], vb = cv[bb];
          var t = (iso - va) / (vb - va);
          var ca = CORNER[a], cb = CORNER[bb];
          ev[ed * 3] = (i + ca[0] + (cb[0] - ca[0]) * t) * inv;
          ev[ed * 3 + 1] = (j + ca[1] + (cb[1] - ca[1]) * t) * inv;
          ev[ed * 3 + 2] = k + (l + ca[2] + (cb[2] - ca[2]) * t) * inv;
          var ga = (((l + ca[2]) * n1 + (j + ca[1])) * n1 + (i + ca[0])) * 3;
          var gb = (((l + cb[2]) * n1 + (j + cb[1])) * n1 + (i + cb[0])) * 3;
          var nx = grad[ga] * (1 - t) + grad[gb] * t, ny = grad[ga + 1] * (1 - t) + grad[gb + 1] * t, nz = grad[ga + 2] * (1 - t) + grad[gb + 2] * t;
          var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          en[ed * 3] = nx / nl; en[ed * 3 + 1] = ny / nl; en[ed * 3 + 2] = nz / nl;
        }
        pos.push(ev[ed * 3], ev[ed * 3 + 1], ev[ed * 3 + 2]);
        nrm.push(en[ed * 3], en[ed * 3 + 1], en[ed * 3 + 2]);
      }
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm) };
  };
  Tunnel.prototype.buildChunk = function (k) { return this.buildChunkN(k).pos; };

  // ---- palette (FUN_10003c30 / FUN_10004d30): smoothed sines, R+G+0.88B floor, clamp 255 ----
  function Palette() { this.c = [174, 154, 134]; this.p = [0, 0, 0]; this.phase = 0; }
  Palette.prototype.step = function (dphase) {
    this.phase += dphase;
    var ph = this.phase, c = this.c, p = this.p;
    p[0] += 0.05 * (0.5 + 0.5 * Math.sin(ph * 0.31)) * dphase * 4;
    p[1] += 0.05 * (0.5 + 0.5 * Math.sin(ph * 0.23 + 1)) * dphase * 4;
    p[2] += 0.05 * (0.5 + 0.5 * Math.sin(ph * 0.27 + 2)) * dphase * 4;
    var T = [[121.8, 174, 0.17, 0], [111.65, 154, 0.13, 1], [101.5, 134, 0.29, 2]];
    for (var i = 0; i < 3; i++) {
      var t = T[i];
      c[i] = c[i] * 0.96 + 0.04 * (t[0] * Math.sin(ph * t[2] + p[i] * 0.013 * 20) + t[1]);
    }
    var s = c[2] * 0.88 + c[1] + c[0];
    if (s < 440) {
      var m = 440 / s; c[0] *= m; c[1] *= m; c[2] *= m;
      for (i = 0; i < 3; i++) if (c[i] > 255) { var ex = (c[i] - 255) * 0.5; c[i] = 255; c[(i + 1) % 3] += ex; c[(i + 2) % 3] += ex; }
    }
    for (i = 0; i < 3; i++) c[i] = Math.max(0, Math.min(255, c[i]));
    return c;
  };

  // ---- camera ----
  // Returns {eye, target} for travelled distance s (in chunks).
  function cameraAt(tunnel, s, look) {
    look = look || 2.5;
    var p = tunnel.pathAt(s), q = tunnel.pathAt(s + look);
    return { eye: [p[0], p[1], s], target: [q[0], q[1], s + look] };
  }

  var api = { Tunnel: Tunnel, Palette: Palette, cameraAt: cameraAt, mulberry32: mulberry32, NB: NB };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MonkeyCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
