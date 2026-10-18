// Faithful port of Monkey 1.02's tunnel generation logic (from vis_monkey.dll, see ../NOTES.md).
// Each routine names the original function it was transcribed from; ../tools/emu holds an x86 emulator harness used to
// verify these numerically (ground truth in ../decomp/truth_*.json).
(function (root) {
  'use strict';
  var f32 = Math.fround;
  var NB = 16;

  // MSVC CRT rand(): the original seeds this and consumes it in a fixed order, so matching it reproduces a given scene exactly.
  function Rng(seed) { this.s = seed >>> 0; this.count = 0; }
  Rng.prototype.next = function () { this.count++; this.s = (Math.imul(this.s, 214013) + 2531011) >>> 0; return (this.s >>> 16) & 0x7fff; };

  // FUN_10016ea0: iterated "smooth step" gain. g<0 selects the inverse curve.
  function gain(x, g) {
    if (x < 0) return 0;
    if (!(x <= 1)) return 1;
    var inv = g < 0; if (inv) g = -g;
    if (g > 1000) g = 1000;
    var n = Math.trunc(g), k;
    function f(v) { return inv ? Math.acos(1 - 2 * v) * 0.31830987 : 0.5 - Math.cos(v * 3.1415927) * 0.5; }
    for (k = 0; k < n; k++) x = f32(f(x));
    var fx = f(x), fr = g - n;
    return (1 - fr) * x + fr * fx;
  }

  // FUN_1000b8a0 / FUN_1000ba90 / FUN_1000b8d0 / FUN_1000b810: smooth random spline "noise" source (knots ~spacing apart).
  function Spline(scale) { this.o = new Float64Array(18); this.o[0] = -1; this.o[1] = 1; this.o[2] = 32; this.o[3] = f32(scale); this.o[4] = 0; this.o[5] = 0; }
  Spline.prototype._coef = function () {   // FUN_1000b810
    var o = this.o;
    var s = f32((o[12] - o[10]) / (o[8] - o[6]));
    o[17] = o[11];
    var d = f32(o[8] - o[7]), d2 = f32(d * d), d3 = f32(d2 * d);
    var e = f32((o[12] - o[11]) - d * s);
    o[16] = s;
    var c2 = f32(((((o[13] - o[11]) / (o[9] - o[7])) - s) * d3 - d2 * 3 * e) / ((d + d) * d3 - d2 * 3 * d2));
    o[15] = c2;
    o[14] = f32((e - c2 * d2) / d3);
  };
  Spline.prototype._knot = function (rng) { var v = f32(((rng.next() % 0xf9d) * 0.0005005005 - 1) * this.o[3]); return f32(Math.pow(2, v) * this.o[2]); };
  Spline.prototype._val = function (rng) { var o = this.o; return f32((o[1] - o[0]) * gain(f32((rng.next() % 0xf9d) * 0.00025025025), o[4]) + o[0]); };
  Spline.prototype.at = function (t, rng) {   // FUN_1000ba90
    var o = this.o;
    if (t < o[7] || o[9] < t || o[5] === 0) {
      o[5] = 1;
      var d1 = this._knot(rng); o[7] = t; o[6] = f32(t - d1);
      o[8] = f32(this._knot(rng) + o[7]);
      o[9] = f32(this._knot(rng) + o[8]);
      o[10] = this._val(rng); o[11] = this._val(rng); o[12] = this._val(rng); o[13] = this._val(rng);
      this._coef();
    } else if (o[8] < t) {
      o[6] = o[7]; o[7] = o[8]; o[8] = o[9];
      o[9] = f32(this._knot(rng) + o[8]);
      o[10] = o[11]; o[11] = o[12]; o[12] = o[13];
      o[13] = this._val(rng);
      this._coef();
    }
    var u = t - o[7];
    return ((u * o[14] + o[15]) * u + o[16]) * u + o[17];
  };

  function Original(seed) {
    this.rng = new Rng(seed);
    this.reset();
  }

  // FUN_10003f10 (+FUN_10003bb0): scene randomize. rand() call order is significant.
  Original.prototype.reset = function () {
    var r = this.rng, i, j;
    this.T = 0; this.D = 0; this.n = 0; this.h = [0, 0];
    this.P = f32(r.next() % 0x3e5);
    this.P = f32((r.next() % 100) * f32(0.01) + this.P);
    this.style1 = r.next() % 5;
    this.style2 = r.next() & 1;
    this.cp = [0, 0, 0];
    for (i = 0; i < 3; i++) this.cp[i] = f32((r.next() % 0x395) * f32(0.68558955));
    this.pal = [0, 0, 0];                       // 0x57cc..: palette smoothed colour (FUN_10003c30 steps it)
    this.pal0 = true;
    this.s57c0 = 1;
    this.sp = []; this.W = []; this.base = new Float64Array(NB); this.col = []; this.flag = [];
    var rad = new Float64Array(NB);
    for (i = 0; i < NB; i++) {
      this.sp.push([new Spline(i === 0 ? 0.3 : 0.5), new Spline(i === 0 ? 0.3 : 0.5)]);
      rad[i] = f32((r.next() & 0x3ff) * f32(0.0001640625) + f32(0.1));
      this.flag.push(r.next() & 1);             // 0x2f894[i] (only used by non-default colour modes)
      var c;
      do { c = [0, 0, 0]; for (j = 0; j < 3; j++) c[j] = f32((r.next() % 0x1d7) * f32(0.5425532)); } while (c[0] + c[1] + c[2] < f32(1.3));
      this.col.push(c);
      this.W.push([f32((r.next() % 0x274) * f32(0.01)), f32((r.next() % 0x274) * f32(0.01))]);
    }
    rad[0] = f32(rad[0] * f32(0.1) + f32(0.189));
    for (i = 0; i < NB; i++) this.base[i] = rad[i];
    this.jit = new Float32Array(0x800);         // 0x5800[]: beat-response jitter table
    for (i = 0; i < 0x800; i++) this.jit[i] = f32((r.next() % 0x625) * f32(0.0006357279));
    this.bx = new Float32Array(NB); this.by = new Float32Array(NB); this.br = new Float32Array(NB);
    this.pal[0] = f32(0.04 * (Math.sin(this.P * f32(0.17) + this.cp[0] * f32(0.013)) * f32(121.799995) + 174));
    this.pal[1] = f32(0.04 * (Math.sin(this.P * f32(0.13) + this.cp[1] * f32(0.013)) * f32(111.65) + 154));
    this.pal[2] = f32(0.04 * (Math.sin(this.P * f32(0.29) + this.cp[2] * f32(0.013)) * f32(101.5) + 134));
    this.s57c4 = 1; this.s57c8 = 0;
    this.ring = new Array(34); this.prevField = null;
    this.initFrameState();
    this.initAudio();
  };

  // FUN_10004290(n): move the 16 blobs for segment n.
  Original.prototype.blobUpdate = function (n) {
    var T = this.T, P = this.P, r = this.rng, i, m;
    var sin = Math.sin, pow = Math.pow;
    var axx = f32(pow(0.5 + sin(P * f32(3.4) + T * f32(0.0069)) * f32(0.2) + sin(P * f32(1.3) + T * f32(0.0131)) * f32(0.3), 0.05000000074505806) * f32(0.8) + f32(0.2));
    var axy = f32(pow(0.5 + sin(P * f32(2.1) + T * f32(0.0087)) * f32(0.2) + sin(P * f32(1.6) + T * f32(0.0117)) * f32(0.3), 0.05000000074505806) * f32(0.8) + f32(0.2));
    var A = f32(pow(0.5 + sin(n * f32(0.00159) + P * f32(0.397)) * f32(0.2) + sin(n * f32(0.00101) + P * f32(0.117)) * f32(0.3), 18) * f32(0.075));
    var R4 = f32(pow(0.5 + sin(n * f32(0.00573) + P * f32(0.93)) * f32(0.2) + sin(n * f32(0.00411) + P * f32(0.382)) * f32(0.3), 0.4000000059604645) * f32(0.6) + f32(0.45));
    var s0 = sin(P * f32(0.345) + n * f32(0.00972)) * f32(0.35) + sin(P * f32(0.623) + n * f32(0.01313)) * f32(0.45) + f32(0.25);
    var S = s0 < 0 ? 0 : (!(s0 <= 1) ? 1 : f32(gain(f32(s0), 2)));
    var ft1 = Math.trunc(P * -f32(0.71)), ft2 = Math.trunc(P * -f32(0.99)), ft3 = Math.trunc(P * -f32(0.62)), ft4 = Math.trunc(P * -f32(0.83));
    var A5 = f32(0.335 - A), s57c4 = this.s57c4;
    var bx = this.bx, by = this.by, br = this.br;
    for (i = 0; i < NB; i++) {
      var a = (i * 0xdd + 0x2fb) * i, b = (i * 0x1a7 + 0x143) * i, c = (i * 0x239 + 0x231) * i, d = (i * 0x142 + 0x1c5) * i, e = (i * 0x10b + 0x15f) * i, f = (i * 0x147 + 0x19b) * i;
      var s7c = 0, s3c = 0, s50 = 0, s44 = 0, s38 = 0, s80 = 0, sx = 0, sy = 0, sw = 0;
      for (m = 0; m < 4; m++) {
        var t5 = f32(((a - ft1 + 0x29 + s80) % 50) * f32(0.002)) - f32(0.01);
        var t6 = f32(((b - ft2 + 0x45 + s38) % 50) * f32(0.002));
        var t7 = f32(((c - ft3 + 0x52 + s44) % 50) * f32(0.002)) - f32(0.01);
        var t8 = f32(((d - ft4 + 0x24 + s50) % 50) * f32(0.002));
        var arg = ((e + 0x1f + s7c) % 50) * f32(0.02) * f32(6.28) + (((f + 0x5e + s3c) % 50) * f32(0.02) + 1) * f32(0.013) * T;
        var w = pow(f32(sin(arg) * f32(0.48) + f32(0.52)), i === 0 ? 3.799999952316284 : 1.7999999523162842);
        sx += w * (t6 + t5); sy += w * (t8 + t7); sw += w;
        b += i * 0x5d; s38 += 0x229; c += i * 0x75; s44 += 0x170; a += i * 0x83; d += i * 0xab; s50 += 0x21f; f += i * 0x139; s3c += 0x267; s80 += 0x110; e += i * 0xf1; s7c += 0x1d9;
      }
      var sc = s57c4 / sw, lim = i === 0 ? f32(0.06) : f32(0.12);
      var mx = sc * sx, my = sc * sy;
      if (mx > lim) mx = lim; if (my > lim) my = lim; if (mx < 0) mx = 0; if (my < 0) my = 0;
      var W = this.W[i]; W[0] = f32(W[0] + mx); W[1] = f32(W[1] + my);
      var ii = i * i;
      bx[i] = f32(sin(i * f32(11.7) + W[0] - ii * f32(0.351)) * A5 * axx + 0.5);
      by[i] = f32(sin(i * f32(14.7) + ii * f32(0.755) + W[1]) * A5 * axy + 0.5);
      if (S > 0) {                               // blend toward spline-driven motion
        var spl = this.sp[i];
        spl[0].o[4] = R4; spl[1].o[4] = R4;
        var q = 26 / pow(s57c4, 0.5), spd;
        if (i === 0) { var v = Math.max(f32(2.5) / s57c4 + 1, f32(1.7)); spd = Math.min(q * v * (A * 100 + 1), 100); } else spd = q;
        spl[0].o[2] = f32(spd); spl[1].o[2] = f32(spd);
        var nx = f32(spl[0].at(n, r) * A5 * axx + 0.5);
        var ny = f32(spl[1].at(n, r) * A5 * axy + 0.5);
        bx[i] = f32(nx * S + (1 - S) * bx[i]);
        by[i] = f32(ny * S + (1 - S) * by[i]);
      }
      br[i] = f32(A * 2 + this.base[i]);
      if (i > 0 && (i & 1)) {                    // odd blobs near blob 0 get random jitter (the original only measures |dx|)
        var d1 = bx[i] - bx[0], dist = Math.sqrt(d1 * d1 + d1 * d1), wj;
        wj = dist <= f32(0.3) ? (dist <= f32(0.1) ? 1 : (f32(0.3) - dist) * f32(4.9999995)) : 0;
        var s8 = this.s57c8;
        var j1 = f32((r.next() % 173) * 0.0029069767), j2 = f32((r.next() % 173) * 0.0029069767);
        bx[i] = f32(((j1 + j2) * 2 - 1) * wj * s8 + bx[i]);
        j1 = f32((r.next() % 173) * 0.0029069767); j2 = f32((r.next() % 173) * 0.0029069767);
        by[i] = f32(((j1 + j2) * 2 - 1) * wj * s8 + by[i]);
        br[i] = f32(((f32((r.next() % 173) * 0.011627907) - 1) * wj * s8 + 1) * br[i]);
      }
    }
  };

  // First part of FUN_10004d30: derive wander scale (0x57c4) and jitter amount (0x57c8), then update the blobs.
  Original.prototype.stepBlobs = function () {
    var T = this.T, P = this.P, n = this.n, sin = Math.sin, pow = Math.pow;
    var b = (sin(T * f32(0.00207) - P * f32(0.3317)) * f32(0.32) + sin(T * f32(0.00331) + P * f32(0.2172)) * f32(0.25) + sin(T * f32(0.00253) + P * f32(0.7631)) * f32(0.43) + 1) * 0.5;
    var g = pow(b, f32(0.75));
    g = (0.5 - Math.cos(g * f32(3.1415927)) * 0.5) * f32(0.6) + g * f32(0.4);
    g = f32(g * f32(1.2)); if (g > 1) g = 1;
    this.s57c4 = f32(pow(2, g * 6 - 4));
    this.s57c8 = f32((sin(T * f32(0.00317) - P * f32(0.2356)) * f32(0.22) + sin(T * f32(0.00261) + P * f32(0.5692)) * f32(0.15) + sin(T * f32(0.00373) + P * f32(0.7513)) * f32(0.63) + 1) * 0.5 * f32(0.01));
    this.blobUpdate(n);
  };


  // Heading/bend part of FUN_10004d30: per-segment bend strength (0xb5ec8), heading vector (0x7854/58) and angle (0xb5ec4).
  Original.prototype.stepPath = function () {
    var T = this.T, D = this.D, P = this.P, n = this.n, sin = Math.sin, pow = Math.pow, c = f32;
    var fV7 = f32((T - D) + n);
    var b = function (a, e) { return pow(0.5 * (1 + sin(a)), e); };
    var bend = b(P * c(0.37) + n * c(0.0382), 3.700000047683716) * c(0.0013)
      + b(P * c(0.11) + n * c(0.0141), 4.099999904632568) * c(0.0014)
      + b(P * c(0.67) + fV7 * c(0.0368), 4.400000095367432) * c(0.0011)
      + b(P * c(0.92) + fV7 * c(0.0405), 3.9000000953674316) * c(0.0012)
      + b(P * c(0.51) + fV7 * c(0.0221), 4.0) * c(0.0015);
    bend = f32(bend); if (bend < 0) bend = 0; if (bend > c(0.0027)) bend = c(0.0027);
    var X = (sin(P * c(0.77) + fV7 * c(0.05913)) * 3 - sin(P * c(0.33) + n * c(0.07972)) * c(2.5) - sin(P * c(0.61) + n * c(0.08391)) * c(1.9)) * c(0.1) + this.h[0] * c(0.9);
    var Y = (sin(P * c(0.53) + n * c(0.05253)) * c(2.1) + sin(P * c(0.17) + fV7 * c(0.04316)) * c(3.2) - sin(P * c(0.81) + n * c(0.07336)) * c(2.1)) * c(0.1) + this.h[1] * c(0.9);
    this.h = [f32(X), f32(Y)];
    this.bend = bend; this.ang = f32(Math.atan2(this.h[1], this.h[0]));
  };


  // ---------------------------------------------------------------------------------------------------------------
  // Segment meshes: marching cubes between the previous and the current 2D blob field (FUN_100017d0/FUN_100027b0),
  // then each vertex is blended toward the segment's bend rotation by its depth (FUN_10004d30, loop at 0x100067ee).
  var G = 32, N1 = G + 1, ISO = 0.15;
  var CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  var EDGE = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  var CG = (typeof module !== 'undefined' && module.exports) ? require('./monkey-color-gen.js') : root.MonkeyColorGen;
  var MCT = (typeof module !== 'undefined' && module.exports) ? require('./mc-table.js') : { MC_EDGES: root.MC_EDGES, MC_OFFSETS: root.MC_OFFSETS };

  function quatMat(q) {   // FUN_10025f88: D3DX-style row-vector rotation matrix from quaternion (x,y,z,w)
    var x = q[0], y = q[1], z = q[2], w = q[3];
    return [1 - 2 * y * y - 2 * z * z, 2 * x * y + 2 * z * w, 2 * x * z - 2 * y * w,
            2 * x * y - 2 * z * w, 1 - 2 * x * x - 2 * z * z, 2 * y * z + 2 * x * w,
            2 * x * z + 2 * y * w, 2 * y * z - 2 * x * w, 1 - 2 * x * x - 2 * y * y];
  }

  Original.prototype.field = function () {   // density of the 16 blobs on the 33x33 grid
    var f = new Float64Array(N1 * N1), bx = this.bx, by = this.by, br = this.br, i, j, b;
    var inv = new Float64Array(NB);
    for (b = 0; b < NB; b++) inv[b] = 1 / (br[b] * br[b]);
    for (j = 0; j < N1; j++) for (i = 0; i < N1; i++) {
      var x = i / G, y = j / G, F = 0;
      for (b = 0; b < NB; b++) {
        var dx = x - bx[b], dy = y - by[b], q = (dx * dx + dy * dy) * inv[b];
        if (q < 0.5) { var t = 0.5 - q; F += t * t; }
      }
      f[j * N1 + i] = F;
    }
    return f;
  };

  Original.prototype.slab = function (prev, cur) {   // returns {pos:Float32Array(x,y,z)*nv, idx:Uint16Array}
    var order = [], pos = [], idx = [], map = new Map(), E = MCT.MC_EDGES, O = MCT.MC_OFFSETS, cv = new Float64Array(8), i, j, b;
    for (j = 0; j < G; j++) for (i = 0; i < G; i++) {
      var ci = 0;
      for (b = 0; b < 8; b++) { var c = CORNER[b], v = (c[2] ? cur : prev)[(j + c[1]) * N1 + (i + c[0])]; cv[b] = v; if (v >= ISO) ci |= 1 << b; }
      if (ci === 0 || ci === 255) continue;
      var ev = new Int32Array(12);   // vertices are created per cell in edge order 0..11 (the original's node order), then the triangles reference them
      for (var ed = 0; ed < 12; ed++) {
        var a = EDGE[ed][0], bb = EDGE[ed][1];
        if ((cv[a] >= ISO) === (cv[bb] >= ISO)) { ev[ed] = -1; continue; }
        var ca = CORNER[a], cb = CORNER[bb];
        var ka = (ca[2] * N1 + (j + ca[1])) * N1 + (i + ca[0]), kb = (cb[2] * N1 + (j + cb[1])) * N1 + (i + cb[0]);
        var key = ka < kb ? ka * 4096 + kb : kb * 4096 + ka, vi = map.get(key);
        if (vi === undefined) {
          var t = (ISO - cv[a]) / (cv[bb] - cv[a]);
          vi = pos.length / 3; map.set(key, vi);
          var ga = [i + ca[0], j + ca[1], ca[2]], gb = [i + cb[0], j + cb[1], cb[2]], kd, ow;     // owner grid point/kind in the original's scan order
          // original scan: plane by plane, per grid point its x-, y- (and, last of all, z-) edge vertices
          if (ga[0] !== gb[0]) { kd = 0; ow = [Math.min(ga[0], gb[0]), ga[1] - 1, ga[2]]; }
          else if (ga[1] !== gb[1]) { kd = 1; ow = [ga[0] - 1, Math.min(ga[1], gb[1]), ga[2]]; }
          else { kd = 2; ow = [ga[0] - 1, ga[1] - 1, 2]; }
          order.push(((ow[2] * 64 + ow[1] + 1) * 64 + ow[0] + 1) * 4 + kd);
          pos.push(2 * ((i + ca[0] + (cb[0] - ca[0]) * t) / G) - 1, 2 * ((j + ca[1] + (cb[1] - ca[1]) * t) / G) - 1, ca[2] + (cb[2] - ca[2]) * t);
        }
        ev[ed] = vi;
      }
      for (var p = O[ci]; p < O[ci + 1]; p++) idx.push(ev[E[p]]);
    }
    var nv0 = order.length, perm = new Array(nv0), inv = new Int32Array(nv0), q;       // vertices in the original's creation order
    for (q = 0; q < nv0; q++) perm[q] = q;
    perm.sort(function (u, v) { return order[u] - order[v]; });
    for (q = 0; q < nv0; q++) inv[perm[q]] = q;
    var pos2 = new Float32Array(nv0 * 3), idx2 = new Uint16Array(idx.length);
    for (q = 0; q < nv0; q++) { var o_ = perm[q] * 3; pos2[3 * q] = pos[o_]; pos2[3 * q + 1] = pos[o_ + 1]; pos2[3 * q + 2] = pos[o_ + 2]; }
    for (q = 0; q < idx.length; q++) idx2[q] = inv[idx[q]];
    return { pos: pos2, idx: idx2 };
  };

  // Per-vertex normal (blob-field gradient, FUN_10002300) and colour (blended blob colours, tinted by phase sines and lit by two
  // moving lights; the loop at 0x10005ac2 of FUN_10004d30). Runs on the flat (unbent) vertices; the original bakes this into the
  // vertex colours, D3D lighting is off. Colours are 0..255 bytes (truncated like the original's ftol).
  Original.prototype.vertexColors = function (mesh, A, B) {
    var p = mesh.pos, nv = p.length / 3, col = new Uint8Array(nv * 3), nrm = new Float32Array(nv * 3), k, b;
    var fV7 = f32((this.T - this.D) + this.n), P = this.P, c = f32;
    var S = CG.colorParams(function (o) { return o === 0x7860 ? P : 0; }, { 20: fV7, 76: 0 }, this.n, f32, gain);
    var v1 = S[0x90], v2 = S[0x78], v3 = S[0x20], amb = S[0x38], cp = this.cp, sin = Math.sin;
    var L1x = S[0x8c], L1y = S[0x80], L1z = S[0x88], L2x = S[0x48], L2y = S[0x58], L2z = S[0x5c];
    var m30 = S[0x30], m34 = S[0x34], m64 = S[0x64], m40 = S[0x40], m44 = S[0x44], m3c = S[0x3c];
    var cr = this.col, inv = new Float64Array(NB), xs = new Float64Array(NB), ys = new Float64Array(NB), vx = new Float64Array(NB), vy = new Float64Array(NB);
    var errors = this.errors && this.flat && !this.dark, errThr = 0;
    if (errors) errThr = f32(Math.pow(sin(P * c(0.16) + fV7 * c(0.00472)) * c(0.22) + sin(P * c(0.33) + fV7 * c(0.00312)) * c(0.27) + c(0.5), 15) * c(0.4) + c(0.0085));
    for (k = 0; k < nv; k++) {
      var gx0 = p[3 * k], gy0 = p[3 * k + 1], z = p[3 * k + 2], zz = Math.min(1, Math.max(0, z)), t = 1 - zz;   // t = node z: 1 -> old blobs, 0 -> new
      var gx = 0, gy = 0, gz = 0, w = 0, cR = 0, cG = 0, cB = 0, x = (gx0 + 1) * 0.5, y = (gy0 + 1) * 0.5;
      for (b = 0; b < NB; b++) {
        var bxx = t * A.x[b] + (1 - t) * B.x[b], byy = t * A.y[b] + (1 - t) * B.y[b], brr = t * A.r[b] + (1 - t) * B.r[b];
        var dx = x - bxx, dy = y - byy, q = (dx * dx + dy * dy) / (brr * brr);
        if (q < 0.5) {
          var q2 = q * q, ww = q2 - q + 0.25, fx = q * 4 - 2, bvx = t * A.vx[b] + (1 - t) * B.vx[b], bvy = t * A.vy[b] + (1 - t) * B.vy[b];
          gx += fx * dx; gy += fx * dy; gz += 2 * (1 - 2 * q2) * (dx * bvx + dy * bvy);
          w += ww; cR += ww * cr[b][0]; cG += ww * cr[b][1]; cB += ww * cr[b][2];
        }
      }
      gz *= 4;
      var l2 = gx * gx + gy * gy + gz * gz, nx, ny, nz;
      if (l2 <= 1e-11) { nx = 1; ny = 0; nz = 0; } else { var s_ = -1 / Math.sqrt(l2); nx = s_ * gx; ny = s_ * gy; nz = s_ * gz; }
      nrm[3 * k] = nx; nrm[3 * k + 1] = ny; nrm[3 * k + 2] = nz;
      if (errors) {           // 'errors' style: at random vertices the normal used for lighting is reversed (random-looking flat-shaded facets)
        this.hairIdx = (this.hairIdx + 1) & 0x7ff;
        if (this.jit[this.hairIdx] > errThr) { nx = -nx; ny = -ny; nz = -nz; }
      }
      var R = w > 0 ? cR / w : 0, G_ = w > 0 ? cG / w : 0, B_ = w > 0 ? cB / w : 0;
      var vxp = gx0, vyp = gy0;     // local x,y in [-1,1]
      var r = ((sin(vxp * 0.131 + vyp * 0.21 + z * v1 + cp[0]) * 60 + 157) + R) * 0.5 * 0.44 + 142.8;
      var g = ((sin(z * v2 + cp[1] - vxp * 0.377 + vyp * 0.021) * 55 + 137) + G_) * 0.5 * 0.44 + 142.8;
      var bl = ((sin(z * v3 + cp[2] - vxp * 0.519 - vyp * 0.313) * 50 + 117) + B_) * 0.5 * 0.44 + 142.8;
      var d0 = nz * L1z + ny * L1y + nx * L1x + amb; d0 = d0 < 0.17 ? 0.17 : d0 > 1 ? 1 : d0;
      var d1 = nz * L2z + ny * L2y + nx * L2x + amb; d1 = d1 < 0.17 ? 0.17 : d1 > 1 ? 1 : d1;
      r *= d1 * m40 + d0 * m30; g *= d1 * m44 + d0 * m34; bl *= d1 * m3c + d0 * m64;
      col[3 * k] = r < 0 ? 0 : r > 255 ? 255 : r; col[3 * k + 1] = g < 0 ? 0 : g > 255 ? 255 : g; col[3 * k + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
    }
    mesh.col = col; mesh.nrm = nrm; mesh.pos0 = Float32Array.from(p);
    // wire pass offset parameters (FUN_10004d30 near 0x10006730): vertices of the wire copy are moved by -f*(nx,ny,2nz); f = 0.002 normally,
    // in the "underground" style 10x (toward the viewer) or -3x (buried) a slowly varying base, depending on the normal's z.
    var sumNz = 0, s1 = sin(P * c(0.63) + fV7 * c(0.083)), s2 = sin(P * c(0.1) + fV7 * c(0.061)), xx = Math.cos((s1 * c(0.2) + s2 * c(0.3) + c(0.5)) * c(3.1415927));
    for (k = 0; k < nv; k++) sumNz += nrm[3 * k + 2];
    mesh.meanNz = f32(sumNz / nv); mesh.wireBase = f32(Math.pow(2, -c(1.2) * xx) * c(0.002));
  };

  // Hair: for each vertex facing "up" enough (normal z above the segment mean), a line from the surface along the normal, jittered by the
  // 0x5800 table (FUN_10004d30 near 0x10006945). Positions are the bent vertices. Hair length depends on the 'darkness' and transparent-hair flags
  // at generation time. Returns Float32Array of (root xyz, tip xyz) pairs.
  Original.prototype.genHair = function (mesh) {
    var p = mesh.pos, nrm = mesh.nrm, nv = p.length / 3, c = f32, jit = this.jit, k, out = [];
    var fV7 = f32((this.T - this.D) + this.n), P = this.P;
    var len0 = Math.pow(2, Math.sin(P * c(0.63) + fV7 * c(0.0137)) * c(0.8) - c(0.4)) * this.hairLen * c(0.045);
    if (this.hairTransparent) len0 *= c(1.3);
    if (this.dark) len0 *= c(1.3);
    var idx = this.hairIdx, mean = mesh.meanNz;
    for (k = 0; k < nv; k++) {
      idx += 5; if (idx >= 0x7fb) idx = 0;
      var v = jit[idx] * c(0.2) + ((nrm[3 * k + 2] - mean) - c(0.12));
      if (!(v > 0)) continue;
      v = v * 3; if (v >= 1) v = 1;
      var len = v * len0 * (jit[idx + 1] * c(0.8) + c(0.6));
      var rx = p[3 * k], ry = p[3 * k + 1], rz = p[3 * k + 2];
      out.push(rx, ry, rz,
        rx - ((jit[idx + 2] - 0.5) * c(0.25) + nrm[3 * k]) * len,
        ry - ((jit[idx + 3] - 0.5) * c(0.25) + nrm[3 * k + 1]) * len,
        rz - ((jit[idx + 4] - 0.5) * c(0.25) + nrm[3 * k + 2]) * len);
    }
    this.hairIdx = idx;
    return new Float32Array(out);
  };
  // Hair colour (TEXTUREFACTOR of the hair pass, asm 0x10008cc5): like wireColor but with exponent-3 gain curves; alpha is a constant 0x58 when
  // transparent hair is enabled.
  Original.prototype.hairColor = function () {
    var T = this.T, P = this.P, c = f32, sin = Math.sin;
    var s = sin(P * c(0.63) + T * c(0.00229)) * c(0.5) + c(0.05);
    var ch = function (pm, tm) { return Math.trunc(gain(f32(sin(P * pm + T * tm) * c(0.02) + s), 3) * 255) / 255; };
    return [ch(c(0.32), c(0.00275)), ch(c(0.57), c(0.00252)), ch(c(0.39), c(0.00214))];
  };

  // One call of FUN_10004d30: advance the scene by one segment (uses this.T/this.D/this.n).
  Original.prototype.genSegment = function () {
    var n = this.n;
    var oldB = { x: Float64Array.from(this.bx), y: Float64Array.from(this.by), r: Float64Array.from(this.br) };
    this.stepBlobs();
    var newB = { x: Float64Array.from(this.bx), y: Float64Array.from(this.by), r: Float64Array.from(this.br) };
    oldB.vx = this.vNew ? this.vNew.x : new Float64Array(NB); oldB.vy = this.vNew ? this.vNew.y : new Float64Array(NB);
    newB.vx = new Float64Array(NB); newB.vy = new Float64Array(NB);
    for (var bi = 0; bi < NB; bi++) { newB.vx[bi] = newB.x[bi] - oldB.x[bi]; newB.vy[bi] = newB.y[bi] - oldB.y[bi]; }
    this.vNew = { x: newB.vx, y: newB.vy };
    var cur = this.field(), prev = this.prevField || new Float64Array(N1 * N1);
    var mesh = this.slab(prev, cur); this.prevField = cur;
    this.vertexColors(mesh, oldB, newB);
    this.stepPath();
    this.stepPalette();
    var bend = this.bend, phi = this.ang - 1.5707964, c = Math.cos(phi), s = Math.sin(phi);
    var sa = Math.sin(bend * 0.5), ca = Math.cos(bend * 0.5);
    var q1 = [sa * c, sa * s, 0, ca], q2 = [-sa * c, -sa * s, 0, ca];
    var M = quatMat(q1), p = mesh.pos, k, nv = p.length / 3;
    for (k = 0; k < nv; k++) {      // bend: blend flat vertex toward its rotated position by depth
      var x = p[3 * k], y = p[3 * k + 1], z = p[3 * k + 2], w = 1 - z;
      p[3 * k] = w * x + z * (M[0] * x + M[1] * y);
      p[3 * k + 1] = w * y + z * (M[3] * x + M[4] * y);
      p[3 * k + 2] = w * z + z * (M[6] * x + M[7] * y + z);
    }
    mesh.hair = this.genHair(mesh);
    this.ring[n % 34] = { fPrev: prev, fCur: cur, n: n, x: this.bx[0], y: this.by[0], ang: this.ang, bend: bend, q1: q1, q2: q2, mesh: mesh, style1: this.style1, style2: this.style2 };
    this.n = n + 1;
  };


  // ---------------------------------------------------------------------------------------------------------------
  // Per-frame state: speed, beat response decay (FUN_10006b50) and camera (FUN_10007500).
  Original.prototype.initFrameState = function () {
    this.fps = 30; this.frameNo = 0; this.startFrame = 0;
    this.s57a8 = 1; this.s57ac = 0; this.s57b0 = -1; this.s57b4 = 0; this.s57b8 = 0; this.s57bc = 0; this.s57c0 = 1;
    this.s7804 = f32(0.195); this.s7850 = 0; this.s785c = 0;
    this.gSpeed = 1; this.gFov = 1; this.beatAmp = 8; this.beatFreq = 8; this.s5798 = 8;
    this.renderStyle = null;
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Audio analysis (FUN_100147a0) and beat detector (FUN_1000b080). Input: 576 signed 8-bit waveform samples (left channel; the
  // original only uses the left spectrum). Three bands of the 1024-point FFT magnitude feed a fast and two slow running averages;
  // the detector compares the raw/long-average ratio against an adaptive threshold (state machine in this.bd).
  var NIN = 576, NFFT = 1024, NSPEC = 512, FFT_WIN = null, FFT_EQ = null, FFT_COS = null, FFT_SIN = null, FFT_REV = null;
  function initFFT() {
    var i, k, w = f32(f32(1 / NIN) * f32(6.2831855));
    FFT_WIN = new Float64Array(NIN); FFT_EQ = new Float64Array(NSPEC); FFT_COS = new Float64Array(NFFT / 2); FFT_SIN = new Float64Array(NFFT / 2); FFT_REV = new Int32Array(NFFT);
    for (i = 0; i < NIN; i++) FFT_WIN[i] = f32((Math.sin(i * w - 1.5707964) + 1) * 0.5);
    var inv = f32(1 / NSPEC);                                            // spectral tilt: -0.02 * ln((M-k)/M)
    for (k = 0; k < NSPEC; k++) FFT_EQ[k] = f32(0.6931471805599453 * Math.log2((NSPEC - k) * inv) * -0.02);
    for (i = 0; i < NFFT / 2; i++) { FFT_COS[i] = Math.cos(-2 * Math.PI * i / NFFT); FFT_SIN[i] = Math.sin(-2 * Math.PI * i / NFFT); }
    for (i = 0; i < NFFT; i++) { var r = 0, v = i; for (k = 1; k < NFFT; k <<= 1) { r = (r << 1) | (v & 1); v >>= 1; } FFT_REV[i] = r; }
  }
  function spectrum(x) {      // |FFT| of window*x (zero padded to 1024), times the tilt; first NSPEC bins
    var re = new Float64Array(NFFT), im = new Float64Array(NFFT), i, j, size, half, step, k;
    for (i = 0; i < NIN; i++) re[FFT_REV[i]] = x[i] * FFT_WIN[i];
    for (size = 2; size <= NFFT; size <<= 1) {
      half = size >> 1; step = NFFT / size;
      for (i = 0; i < NFFT; i += size) for (j = 0, k = 0; j < half; j++, k += step) {
        var a = i + j, b = a + half, tr = re[b] * FFT_COS[k] - im[b] * FFT_SIN[k], ti = re[b] * FFT_SIN[k] + im[b] * FFT_COS[k];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
    var out = new Float64Array(NSPEC);
    for (i = 0; i < NSPEC; i++) out[i] = f32(Math.sqrt(re[i] * re[i] + im[i] * im[i]) * FFT_EQ[i]);
    return out;
  }
  Original.prototype.initAudio = function () {
    if (!FFT_WIN) initFFT();
    this.band = [0, 0, 0]; this.avgF = [0, 0, 0]; this.avg2 = [0, 0, 0]; this.avgL = [0, 0, 0];
    this.bd = { state: 1, thr: 5, fc: f32(1.3), last: f32(1.3) };       // 0x5f54f4/f8/fc/5500 defaults
    this.hairIdx = 0; this.hairLen = 1; this.hairTransparent = 1; this.dark = 0; this.flat = 0; this.errors = 0;   // 0x7800, 0x85f4, 0x5788, 0x85dc
    this.beatFreq = 8;                                                 // "beat_response_freq" (0x85f8)
    this.seedAvg = false;                                              // option: seed the long averages on the first signal (avoids the start-up transient)
  };
  Original.prototype.analyze = function (L) {
    var i, tmp = new Float64Array(NIN), fps = this.fps;
    for (i = 0; i < NIN; i++) tmp[i] = (i ? L[i - 1] + L[i] : 2 * L[0]) * 0.5;
    var sp = spectrum(tmp), pw = Math.pow, c = f32;
    var scale = [c(3.7037036), c(2.915452), c(3.3898306)];
    for (var b = 0; b < 3; b++) {
      var lo = Math.trunc(pw(b * c(0.33333334), 2.0999999046325684) * 256), hi = Math.trunc(pw((b + 1) * c(0.33333334), 2.0999999046325684) * 256), s = 0;
      for (i = lo; i < hi; i++) s = f32(s + sp[i]);
      this.band[b] = f32(f32(s / (hi - lo)) * scale[b]);
    }
    if (this.seedAvg && this.avgL[0] === 0 && this.avgL[1] === 0 && this.avgL[2] === 0 && (this.band[0] > 0 || this.band[1] > 0 || this.band[2] > 0)) {
      for (b = 0; b < 3; b++) { this.avgF[b] = this.avg2[b] = this.avgL[b] = this.band[b]; }
    }
    var rate = function (a) { return pw(pw(a, 14), 1 / fps); };       // FUN_10016fb0(a, 14, fps)
    var rUp = rate(c(0.2)), rDown = rate(c(0.5)), s1 = rate(c(0.91)), s2 = rate(c(0.96));
    for (b = 0; b < 3; b++) {
      var r = this.band[b] <= this.avgF[b] || this.band[b] !== this.band[b] || this.avgF[b] !== this.avgF[b] ? rDown : rUp;
      this.avgF[b] = f32((1 - r) * this.band[b] + this.avgF[b] * r);
      this.avg2[b] = f32((1 - s1) * this.band[b] + s1 * this.avg2[b]);
      this.avgL[b] = f32((1 - s2) * this.band[b] + s2 * this.avgL[b]);
    }
  };
  Original.prototype.beatDetect = function () {   // returns true when a beat is detected this frame
    var bd = this.bd, fps = this.fps, pw = Math.pow, c = f32;
    var x = f32(pw(this.beatFreq * c(0.0625), 0.8799999952316284) * 16);
    var t = pw(pw(c(0.999), 30), 1 / fps);
    if (x > 8) t = t - pw((x - 8) * c(0.125), 3.4000000953674316) * c(0.022);
    else if (x < 8) t = (8 - x) * c(6.25e-05) + t;
    bd.thr = f32(t * bd.thr + (1 - t) * bd.fc);
    var A = this.avgF, Lg = this.avgL, B = this.band;
    if (bd.state === 0) {
      var avg = (A[2] / Lg[2] + A[1] / Lg[1] + A[0] / Lg[0]) * c(0.3333);
      if (!(avg >= bd.thr)) {                                           // (NaN counts as "below", like the x87 compare)
        var f2 = 8 - x;
        bd.state = 1;
        bd.thr = f32((x - 8) * c(0.0125) + c(0.3) + (f2 * c(0.1) + c(2.3)) * bd.last);
        bd.fc = f32(f2 * c(0.03125) + c(1.35));
      }
      return false;
    }
    var R = f32((B[2] / Lg[2] + B[1] / Lg[1] + B[0] / Lg[0]) * c(0.3333));
    if (R > bd.thr && R > c(0.2)) {
      bd.last = R; bd.state = 0; this.beatCount = (this.beatCount || 0) + 1;
      var v = ((x - 8) * c(0.01875) + c(0.7)) * R;
      bd.thr = f32(v > 1 ? 1 : v); bd.fc = 1;
      return true;
    }
    return false;
  };

  // Colour of the wireframe overlay pass (the D3D TEXTUREFACTOR set in the render function, asm 0x10008a8a). Three gain-curved slow sines; in the
  // normal style it fades from near white to black as T grows, with "darkness" on it stays white (and the solid pass is drawn black).
  Original.prototype.wireColor = function (dark) {
    var T = this.T, P = this.P, c = f32, sin = Math.sin;
    var A = sin(P * c(0.13) + T * c(0.00232));
    var base = dark ? A * c(0.2) + c(0.9) : A * c(0.5) + c(0.1), amp = dark ? c(0.4) : c(0.08);
    var ch = function (pm, tm) { return Math.trunc(gain(f32(sin(P * pm + T * tm) * amp + base), 4) * 255) / 255; };
    return [ch(c(0.42), c(0.00312)), ch(c(0.17), c(0.00279)), ch(c(0.79), c(0.00253))];
  };

  // FUN_10006b50 (first half): travel speed, then advance the phase T and the distance D.
  Original.prototype.updateSpeed = function () {
    var fps = this.fps, r = this.rng;
    var m1 = Math.pow(2, (4 * this.s5798 - 32) * f32(0.125));
    var eb = this.easeB4 = (this.easeB4 || 0) + (this.s57b4 - (this.easeB4 || 0)) * (this.smoothBeat ? 0.04 : 1);
    var sp = (f32(12.2) / fps * (eb + 1) * this.gSpeed * m1) + eb * f32(0.1);
    if (this.s57c4 > 2) sp = Math.pow(f32(2) / this.s57c4, 0.800000011920929) * sp;
    var f = Math.min(50, Math.max(8, fps)) * f32(0.04);
    var g = fps <= 25 ? f : Math.pow(f, 1.2000000476837158);
    sp = (g * f32(0.4) + f32(0.6)) * (f32(0.195) / this.s7804 * f32(0.8) + f32(0.2)) * sp;
    sp = f32(sp); if (sp >= 4) sp = 4;
    this.s57a8 = sp;
    this.T = f32(this.T + sp); this.D = f32(this.D + sp);
    var iv = Math.trunc(f32(400) / sp);
    if (iv > 0 && r.next() % iv === 0) this.style1 = r.next() % 5;
  };

  // FUN_10006b50 (second half): react to a detected beat (or decay the previous reactions).
  Original.prototype.beatResponse = function (beat) {
    var r = this.rng, amp = this.beatAmp, fps = this.fps, pw = function (a) { return Math.pow(a, 30 / fps); };
    if (beat && amp > 0) {
      var q = r.next() % 100;
      if (q < 10) { this.renderStyle = r.next() % 9; return; }              // FUN_10003d00: random render style (not used by the port)
      if (q <= 0x23) { this.s57b8 = f32((2 * (r.next() & 1) - 1) * amp * 0.125); this.s57bc = f32((2 * (r.next() & 1) - 1) * amp * 0.125); return; }
      if (q <= 0x3c) { this.s57b0 = -this.s57b0; this.s57ac = f32(amp * 0.125 * this.s57b0 * 0.056); return; }
      if (q <= 0x55) {
        var sg = (2 * (r.next() & 1) - 1) * 1.5, u = (r.next() % 0x305) * f32(0.00025906737);
        this.s57c0 = f32(((u + Math.pow(2, sg)) - 1) * amp * 0.125 + 1); return;
      }
      this.s57b4 = f32(amp * 0.125 * 2); return;
    }
    if (beat) return;                                                         // beat with responses disabled: nothing
    var a1 = f32(0.989), a2 = f32(0.987), a3 = f32(0.988), a4 = f32(0.91);
    if (amp > 8) { var x = amp - 8; a1 = 0.989 + x * 0.00025; a2 = 0.987 + x * 0.00025; a3 = 0.988 + x * 0.00025; a4 = 0.91 + x * 0.0005; }
    else if (amp < 8) { var y = Math.pow((8 - amp) * 0.125, 2.5); a1 = 0.989 - 0.03 * y; a2 = 0.987 - 0.03 * y; a3 = 0.988 - 0.03 * y; a4 = 0.91 - 0.05 * y; }
    this.s57ac = f32(pw(a1) * this.s57ac); this.s57b4 = f32(pw(a2) * this.s57b4);
    this.s57b8 = f32(pw(a3) * this.s57b8); this.s57bc = f32(pw(a3) * this.s57bc);
    this.s57c0 = f32((this.s57c0 - 1) * pw(a4) + 1);
  };

  function lookAtLH(eye, at, up) {
    var zx = at[0] - eye[0], zy = at[1] - eye[1], zz = at[2] - eye[2], zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx, xl = Math.hypot(xx, xy, xz); xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1];
  }
  function mul4(a, b) {   // row-vector convention: (a*b)
    var o = new Array(16), i, j, k;
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) { var s = 0; for (k = 0; k < 4; k++) s += a[i * 4 + k] * b[k * 4 + j]; o[i * 4 + j] = s; }
    return o;
  }

  // FUN_10007500: generate any missing segments, then compute the camera and the 34 world matrices.
  Original.prototype.camera = function () {
    var sin = Math.sin, cos = Math.cos, T = this.T, P = this.P, i;
    var V = f32(this.D + 37), i9 = Math.trunc(V), fr = f32(V - i9);
    while (this.n < i9) this.genSegment();
    var cs = i9 - 34, R = this.ring;
    var S = function (k) { return R[(cs + k) % 34]; };
    var lerp = function (key, k) { return (1 - fr) * S(k)[key] + fr * S(k + 1)[key]; };
    var A0x = 2 * lerp('x', 0) - 1, A0y = 2 * lerp('y', 0) - 1, TX0 = 2 * lerp('x', 6) - 1, TY0 = 2 * lerp('y', 6) - 1;
    this.eac = (this.eac || 0) + (this.s57ac - (this.eac || 0)) * (this.smoothBeat ? 0.04 : 1);
    if (!this.camBeat) this.eac = 0;
    this.s785c = f32(this.eac + this.s785c);                              // + E8608 (= 0)
    var f4 = ((S(4).x - S(9).x) * (1 - fr) + (S(6).x - S(11).x) * fr) - (cos(S(5).ang) * S(5).bend * fr + cos(S(4).ang) * S(4).bend * (1 - fr)) * 6.5;
    var smooth;
    if (this.frameNo - this.startFrame < 1) smooth = 0;
    else {
      var At = Math.atan2(2 * (f4 * 7.5 * Math.pow(this.gSpeed, 0.800000011920929)), 1);
      if (this.frameNo - this.startFrame < 2) smooth = At;
      else { var s1 = Math.pow(0.86, this.s57a8) * 0.5 + 0.43, s2 = Math.pow(s1, 14 / this.fps); smooth = s2 * this.s7850 + (1 - s2) * At; }
    }
    this.s7850 = f32(smooth);
    var Q = this.s785c - this.s7850;
    var zf = Math.min(this.s7804 * f32(5.1282053), 1), c4 = this.s57c4;
    var k2 = zf / Math.max(0.9 * c4, 1), k1 = zf / Math.max(1.2 * c4, 1);
    var RA = 0.0227 * sin(T * 0.0139 + 41) + 0.0216 * sin(T * 0.0197 + 98) + 0.023 * sin(T * 0.0179 + 28);
    var RB = 0.0226 * sin(T * 0.0173 + 73) + 0.0207 * sin(T * 0.0152 + 23) + 0.024 * sin(T * 0.0129 + 11);
    var WX = 0.21 * sin(P * 1.2 + T * 0.0119 + 11) + 0.16 * sin(P * 3.1 + T * 0.0137 + 46) + 0.19 * sin(P * 1.4 + T * 0.0059 + 38);
    var WY = 0.12 * sin(P * 2.4 + T * 0.0103 + 83) + 0.17 * sin(P * 2.7 + T * 0.0122 + 29) + 0.19 * sin(P * 1.7 + T * 0.0069 + 91);
    var E = this.smoothBeat ? 0.04 : 1; this.eb8 = (this.eb8 || 0) + (this.s57b8 - (this.eb8 || 0)) * E; this.ebc = (this.ebc || 0) + (this.s57bc - (this.ebc || 0)) * E; this.ec0 = (this.ec0 === undefined ? 1 : this.ec0) + (this.s57c0 - (this.ec0 === undefined ? 1 : this.ec0)) * E;
    if (!this.camBeat) { this.eb8 = 0; this.ebc = 0; this.ec0 = 1; }
    var eye = [A0x + k2 * RA, A0y + k2 * RB, 0];
    var at = [TX0 + 0.6 * k1 * WX + this.eb8, TY0 + 0.6 * k1 * WY + this.ebc, 6];
    // the camera sits a fraction `fr` into segment 0, whose frame is bent by fr*bend relative to its start
    var s0 = S(0), ph0 = s0.ang - 1.5707964, sa0 = Math.sin(fr * s0.bend * 0.5), qf = [-sa0 * cos(ph0), -sa0 * sin(ph0), 0, Math.cos(fr * s0.bend * 0.5)], Mf = quatMat(qf);
    var vx = at[0] - eye[0], vy = at[1] - eye[1], vz = at[2] - eye[2];
    at = [eye[0] + vx * Mf[0] + vy * Mf[3] + vz * Mf[6], eye[1] + vx * Mf[1] + vy * Mf[4] + vz * Mf[7], eye[2] + vx * Mf[2] + vy * Mf[5] + vz * Mf[8]];
    var up = [sin(Q), cos(Q), 0];
    this.s7804 = f32((sin(T * 0.0075 + P * 0.131) * 0.04 + 0.195) * this.ec0 * this.gFov);
    var Vm = lookAtLH(eye, at, up);
    var W = [], segs = [], Wc = mul4([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -fr, 1], Vm);
    for (i = 0; i < 34; i++) {
      W.push(Wc); segs.push(S(i));
      var q = S(i).q2, Rm = quatMat(q);
      Wc = mul4([Rm[0], Rm[1], Rm[2], 0, Rm[3], Rm[4], Rm[5], 0, Rm[6], Rm[7], Rm[8], 0, 0, 0, 1, 1], Wc);
    }
    return { W: W, segs: segs, eye: eye, at: at, up: up, fovY: this.s7804, near: 0.1, far: 34 - fr, fr: fr, cs: cs };
  };

  // One display frame (FUN_10003880): speed/beat update, then segments + camera. `beat` comes from the audio analysis.
  Original.prototype.frame = function (audio) {      // audio: false/true (forced beat) or an array of 576 signed waveform samples
    var beat;
    if (audio && typeof audio === 'object') this.analyze(audio);
    this.updateSpeed();
    beat = audio && typeof audio === 'object' ? this.beatDetect() : !!audio;
    this.beatResponse(beat);
    var cam = this.camera();
    this.frameNo++;
    return cam;
  };


  // Palette (FUN_10003c30 + the end of FUN_10004d30): smoothed sine colours, stepped once per generated segment.
  Original.prototype.stepPalette = function () {
    var c = f32, sin = Math.sin, P = this.P, n = this.n, fV7 = f32((this.T - this.D) + n), cp = this.cp, pal = this.pal;
    // colour-phase velocities (fVar2..4 in FUN_10004d30)
    var s1 = sin(fV7 * c(0.00433) + P * c(0.91) + 5), s2 = sin(fV7 * c(0.00283) + P * c(0.72) + 2), s3 = sin(fV7 * c(0.00391) + P * c(0.53) + 3);
    var m = s3 * c(0.3) + (s2 + s1) * c(0.2) + c(1.3);
    var v1 = (sin(fV7 * c(0.0036) + P * c(0.27) + 1) * c(0.0627) + c(0.067)) * m * c(2.4);
    var v2 = (sin(fV7 * c(0.0042) + P * c(0.17) + 4) * c(0.0444) + c(0.047)) * m * c(2.4);
    var v3 = (sin(fV7 * c(0.0057) + P * c(0.33) + 5) * c(0.0345) + c(0.038)) * m * c(2.4);
    // FUN_10003c30
    pal[0] = f32(pal[0] * c(0.96) + (sin(P * c(0.17) + cp[0] * c(0.013)) * c(121.799995) + 174) * c(0.04));
    pal[1] = f32(pal[1] * c(0.96) + (sin(P * c(0.13) + cp[1] * c(0.013)) * c(111.65) + 154) * c(0.04));
    pal[2] = f32(pal[2] * c(0.96) + (sin(P * c(0.29) + cp[2] * c(0.013)) * c(101.5) + 134) * c(0.04));
    var t = pal[2] * c(0.88) + pal[1] + pal[0];
    if (t < 440) {
      var k = 440 / t, ex;
      pal[0] = f32(pal[0] * k); pal[1] = f32(pal[1] * k); pal[2] = f32(pal[2] * k);
      if (pal[0] > 255) { ex = (pal[0] - 255) * 0.5; pal[0] = 255; pal[1] = f32(ex + pal[1]); pal[2] = f32(ex + pal[2]); }
      if (pal[1] > 255) { ex = (pal[1] - 255) * 0.5; pal[1] = 255; pal[0] = f32(ex + pal[0]); pal[2] = f32(ex + pal[2]); }
      if (pal[2] > 255) { ex = (pal[2] - 255) * 0.5; pal[2] = 255; pal[0] = f32(ex + pal[0]); pal[1] = f32(ex + pal[1]); }
    }
    for (var i = 0; i < 3; i++) { if (pal[i] < 0) pal[i] = 0; if (pal[i] > 255) pal[i] = 255; }
    cp[0] = f32(cp[0] + v1); cp[1] = f32(cp[1] + v2); cp[2] = f32(cp[2] + v3);
  };

  var api = { Rng: Rng, gain: gain, Spline: Spline, Original: Original };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MonkeyOrig = api;
})(typeof window !== 'undefined' ? window : globalThis);
