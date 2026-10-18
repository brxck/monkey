# Monkey 1.02 reverse-engineering notes

Target: `extracted/vis_monkey.dll` (x86 PE DLL, image base 0x10000000, sha256 d919ef51...4fe0).
Analysis: REA + Ghidra 12.1.4. Addresses are VAs. Names marked (?) are guesses from decompilation.

## Extraction
`monkey_102.exe` is an old NSIS 2.0 installer that 7-Zip rejects. Header and file blocks are raw deflate
(NSIS header at the `efbeadde NullsoftInst` marker, 0x8e04). Blocks in order: vis_monkey.dll, monkey.html,
vms_desktop.dll, supertex_a1-a5.jpg, supertex_b1-b2.jpg, monkey00-17.dat. All in `extracted/`.

## Winamp plugin glue
- `winampVisGetHeader` 0x10017a40 -> header struct 0x10050fd0: version 0x101, desc 0x1004d5a4, getModule 0x10017a30
- `getModule(n)` 0x10017a30: n==0 -> module struct 0x10050698, else NULL (single module)
- Module fn ptrs at 0x10050fbc: Config 0x10017ab0, Init 0x10017b10, Render 0x10017bb0, Quit 0x10017be0 (stubs, not auto-defined as functions)
- Global singleton engine object at 0x10066c10 (C++ `this` passed in ECX). Flag byte 0x10050690 = "plugin dead/failed".
- Render stub passes only the two waveformData channels (module+0x4a4, +0x6e4) to engine method 0x10013ee0. Spectrum data is NOT passed.
- Quit -> 0x10013690 (shutdown). Init -> 0x10013110 (setup, takes hwndParent, hDllInstance) then 0x10013660.
- Init refuses to run if Winamp isn't playing (SendMessage WM_USER 0x68 != 1): "This plugin can't run without music playing".

## Per-frame method 0x10013ee0 (engine->Frame)
Handles D3D device lost/reset (HRESULT 0x88760869 = D3DERR_DEVICENOTRESET), Sleep(30) when idle, then in order:
`0x10014470`, `0x100147a0(wave args)`, `0x10014080(0)`, `0x10014260`; increments frame counter at this+0x24bc.
Mode field this+0x24b8 (0..3, 3 = a stereo mode, calls 0x10012540 -> 0x10014020).
Roles (decompiled):
- 0x10014470 = frame timing / FPS estimator. this+0x24bc frame#, +0x24c0 accumulated time, +0x24c4 fps (init 30.0),
  +0x5538 ring buffer of 128 frame times (index +0x5738), +0x5530 last timestamp (double),
  +0x5740 QueryPerformanceFrequency (int64; 0 -> falls back to timeGetTime*0.001). FPS smoothing 0.93 (QPC) / 0.8 early.
  Frame dt clamped: invalid or >1s -> 1/30.
- 0x100147a0 = audio analysis. Waveform bytes (unsigned 8-bit, XOR 0x80 -> signed) -> floats: L at this+0x4c, R at this+0x94c
  (576 samples each, 0x240). Averages with previous frame, 2x FFT (0x100121a0), then 3 band averages over FFT bins
  (bin edges from 0x10017cd0) -> this+0x10/0x14/0x18 (bass/mid/treb), normalized by x3.7037 / x2.9155 / x3.3898.
  Then 3 time-smoothed copies each (rate-compensated blend via 0x10016fb0): this+0x1c..0x24, 0x28..0x30, 0x34..0x3c.
  (Same bass/mid/treb + imm/avg/long-avg pattern as Milkdrop.) FFT output at this+0x124c.
- 0x10014080 = scene draw + present. Sets 10px-inset viewport rects at this+0x4f4c.., handles desktop/fake-fullscreen
  (Shell_TrayWnd lookup). D3D8 device is at (this[0x934])+0xd0; vtable calls: +0x88 BeginScene, +0x8c EndScene, +0x3c Present.
  Between them: vtable+0x20 (this, virtual), 0x10014a10, 0x1000f830, 0x10014ec0, vtable+0x24 (virtual, viewport draw), 0x10015180.
- 0x10014260 = frame-rate limiter (max-fps config at this+0x2258/0x225c/0x2260 by mode; Sleep / QPC spin).
Display mode this+0x24b8: 0 windowed, 1 fullscreen, 2 fake fullscreen, 3 desktop (?; from readme + code).

## .dat saved states (monkeyNN.dat, 3564 bytes)
dwords: [0]=1 (version?), [1]=0xDEC (size), [2]=3, [3]=0, then float32 data and sparse zero blocks. Layout still TBD.

## Engine class (singleton 0x10066c10)
Constructor 0x100179e0 (run from CRT static init 0x10017960; atexit dtor 0x10017990) installs vtable at 0x100429e4 (11 entries):
 0 0x10002fa0, 1 0x10002fe0, 2 0x10003240, 3 0x10003430, 4 0x10003610, 5 0x10003650, 6 0x10003670,
 7 0x10003820, 8 0x10003880 (scene update/draw: calls FUN_10006b50 once if arg==0, then FUN_10007500), 9 0x100096b0 (HUD text overlay),
 10 0x10009b30 (?). Slots 0,1,2 are called from Init 0x10013110 (load settings / create window+D3D / create resources, ?).
Init 0x10013110 zeros the object, sets default config (fonts Trebuchet MS 18 / Times New Roman 24, 640x480, 60 Hz), reads `monkey.ini`
next to the DLL, takes a QPC frequency, and picks display mode from ini flags.
Frame method also calls non-virtual helpers that are NOT the scene: 0x10014a10 (D3D render/texture-stage state + identity transforms),
0x1000f830 (Desktop Mode: draws Explorer's desktop icons as textured quads), 0x10014ec0 (help/'Press F1 for Help'), 0x10015180 (playlist overlay,
Winamp IPC 0x7c/0xd4).
Scene logic candidates: 0x10006b50 (beat/audio-reactive update: travel speed this+0x57a8, random beat triggers, rand()%5 style pick at +0x7830),
0x10007500 (588 lines), 0x10004d30 (557), 0x10010a30 (584), 0x100157f0 (702).

## Scene structure (decompiled 0x10007500 = draw, 0x10004d30 = generate segment)
- The tunnel is a ring of 0x22 (34) segments in the engine at this+0xb5eb0, stride 0x28b54 bytes. Per-segment fields seen:
  +0xb5eb4/+0xb5eb8 (copied from this+0x8c9a4/+0x8c9e4; path x/y?), +0xb5ebc = this+0x7830 (rand()%5 style/texture pick),
  +0xb5ec0 = this+0x7834 (rand()&1), +0xb5ec4 (angle, cos'd), +0xb5ec8, +0xb5edc, vertex array at +0x906b0.. (32-byte verts: pos xyz, color, uv).
- this+0x7840 = number of segments generated so far (int). Draw loop: `while (this+0x7840 < (int)distance) FUN_10004d30()`.
  segment index in ring = n % 0x22.
- this+0x7844 = beat-driven "time" accumulator, +0x7848 = distance travelled, +0x7860 = a second phase. Both advance each frame by the
  travel speed this+0x57a8 (computed in 0x10006b50). All tunnel shape params are sums of sin(seg_index*k + phase*k2 + c): fully
  deterministic procedural generation, constants live in _DAT_100426xx..100428xx (float constants in .rdata).
- Camera: interpolates between ring segments (frac of distance), look-ahead 4-7 segments, yaw via fpatan of path slope, plus sinusoidal wobble.
- Draw: builds a 0x40-byte D3DXMATRIX per segment (34 of them, 0x880 bytes), loops once per eye (this+0x8600: 0 off, 1 red/blue, 2 chromadepth;
  separation this+0x8604). Flags: this+0x85d4/0x85d8/0x85dc/0x85e0/0x85e4 and 0x577c/0x5780 select wireframe/textures/flat/etc (TBD).
- Per-vertex colour comes from sin() of vertex position + three phases this+0x7864/0x7868/0x786c, scaled to RGB, then fog/darkness.

## Visual target (reference/01-17.jpg, from geisswerks.com/monkey/screenshots; needs a browser User-Agent or the server returns 406)
Default look: flat-shaded low-poly organic cave tunnels, thin dark wireframe overlay on every triangle, adaptive triangle size
(dense near tunnel openings / distance), smooth pastel per-scene palette (pink/violet, tan/cream, teal/blue-brown), glowing saturated
fog colour at the far end of each tunnel. No textures visible in the default screenshots (supertex_*.jpg are used only with the T toggle;
a1-a5 are rocky/cellular greyscale detail, b1-b2 are coloured smoke). Port goal: LOOK the same, not an exact match.
Geometry insight: FUN_10004290 outputs up to 16 per-segment path points (this+0x8c9a4[i] x, +0x8c9e4[i] y; each from sums of sines);
FUN_100017d0 compacts a vertex/edge network (nodes 0x30 bytes, count this+0x10c) so the tunnel mesh is a branching 'network' (several
passageways merge/split), not one tube. How the triangles are produced from the 16 paths is not yet understood (remaining part of 0x10004d30).


## Tunnel generation (step 1, decoded; "readable" source = decomp/vis_monkey_k.c, constants inlined from decomp/consts.json)
FUN_10017cd0 is CRT pow(base, exponent); the exponent is the double loaded just before the call (visible only in the .asm dump; the
decompiler drops it). Where the C shows `fsin(a); fsin(b); FUN_10017cd0()` the real expression is
pow(0.5 + 0.2*sin(a) + k*sin(b), E) -- exponent constants at 0x100424c0/0x10042490/0x10042470/0x10042420/0x10042418/0x10042400.
**World model.** Marching cubes over a 3D grid, one chunk per ring segment. The implicit field F(x,y,z) at each grid corner is
  F = sum_{blobs i<16} (0.5 - d_i^2/r_i^2)^2  [only where d_i^2/r_i^2 < 0.5; = (f*f - f + 0.25)]   (2D blobs: depend on x,y only, FUN_10001e90)
    + 3-octave 3D value noise (random 16^3 lattice in [-1,1] at this+0x5d624 region, cubic smoothstep t^2(3-2t), per-octave random 3x3 rotation,
      freq 9.0 then *1.937 each octave, amplitude (this+0x5d598*0.57) then *0.5163 each octave, z = (layer+1)*0.025), result clamped [-1,1], mapped to [lo,hi].
Iso level = this+0x5d594 (set from FUN_10003610: FUN_10001040(quality+5, 16 blobs, iso=this[0x5790]*0.0625, 0.15)). Surface = iso crossing.
FUN_10001c40 is a 2D quadtree pre-pass that only evaluates cells near a blob's influence radius (the rest are constant outside). FUN_100027b0 is the
marching-cubes pass (256-case tri table at 0x10048040, 16 bytes/case, edge-vertex cache, vertices deduped via FUN_10002710); FUN_100017d0 compacts it.
**Blob (cave axis) motion, FUN_10004290(segIndex)**: per blob i (0..15), centre
  x_i = 0.5 + sin(i*11.7 + wanderX_i - i*i*0.351) * (0.335 - A) * Bx,  y_i = 0.5 + sin(i*14.7 + i*i*0.755 + wanderY_i) * (0.335 - A) * By
  with slow sine-driven modulators A,Bx,By (see k.c lines for 0x7844/0x7860 phases) and wanderX/Y random-walk accumulators (this+0x7894/98, stride 0x30).
  Blob 0 is the camera/tunnel axis (stored per segment at seg+0xb5eb4/b8). Odd blobs are pulled toward blob 0 / jittered by rand when closer than 0.3.
  Radius_i = 2*A + base_i (this+0x7b94[i]).
**Palette (FUN_10003c30, step 3 done)**: R,G,B (this+0x57cc/d0/d4, 0..255) each: v = 0.96*v + 0.04*(Amp*sin(phase*f + cphase*0.013) + Off):
  R: Amp 121.8, Off 174, f 0.17 (cphase=this+0x7864);  G: Amp 111.65, Off 154, f 0.13 (this+0x7868);  B: Amp 101.5, Off 134, f 0.29 (this+0x786c);
  phase = this+0x7860. Then FUN_10004d30 renormalizes so R+G+B*k >= a floor and clamps each to 255 (0 floor). colour phases advance by fVar2/3/4 (sums of sines).
**Speed (FUN_10006b50)**: speed = clamp(0.1*e1 + (e1+1)*(12.2/fps)*gain*..., max 4.0) where e1 = this+0x57b4 (a low-passed beat energy);
  this+0x7844 += speed (phase for wobble) and this+0x7848 += speed (distance); each new segment is generated when distance crosses an integer.
  Beat energies decay with 0.989/0.987/0.988/0.91 per 30fps tick (rate-compensated by FUN_10016fb0). Style changes: on bass beats pick rand()%5 (this+0x7830) and rand()&1 (+0x7834).


## Render pipeline (step 3; from D3D vtable calls in 0x10007500, decoded with tools/DumpAsm.java -> decomp/vis_monkey.asm)
D3D8 IDirect3DDevice8 vtable offsets used: +0x88 BeginScene, +0x8c EndScene, +0x90 Clear, +0x94 SetTransform, +0xc8 SetRenderState, +0xf4 SetTexture,
+0xfc SetTextureStageState, +0x130 SetVertexShader(FVF), +0x120 DrawPrimitiveUP, +0x3c Present. (stdcall: asm pushes value,state,device -> read pushes backwards.)
- Background clear colour = FOG colour = 0xFF,R,G,B with R,G,B = ftol(this+0x57cc/0x57d0/0x57d4) i.e. the smoothed palette colour. So the glowing tunnel
  ends in the screenshots are the palette colour, and fog fades everything to it. (red-blue stereo mode clears to 0xff0000ff / black variants.)
- Fog: FOGENABLE (flag this+0x85d4), FOGTABLEMODE=NONE, FOGVERTEXMODE=LINEAR, FOGSTART=0 (25.5 in stereo), FOGEND = 0.99*(sin(phase*0.29+t*0.01513)+sin(phase*0.66+t*0.0219)) + 31.02
  (t=this+0x7844, phase=this+0x7860) => 29..33 world units; view-space depth. RANGEFOG off.
- Common states: lighting OFF (colours come from vertex diffuse), CULLMODE=2 (CW), ZENABLE on, ZFUNC=LESSEQUAL(4), CLIPPING on, dither off.
- Pass 1 (solid): FILLMODE=SOLID, SHADEMODE=this-flag (flat when F toggled), FVF 0x242 = XYZ|DIFFUSE|TEX2, stage0 modulate-ish; textures only if T toggled.
- Pass 2 (wire overlay): FILLMODE=WIREFRAME(2), SHADEMODE=FLAT, FVF 0x42 = XYZ|DIFFUSE, colour from TEXTUREFACTOR (dark), stage0 COLOROP=SELECTARG1 ARG1=TFACTOR.
- Pass 3: ALPHABLENDENABLE with SRCBLEND=5 (SRCALPHA) DESTBLEND=6 (INVSRCALPHA) for the glow / hair-like extra geometry.
- Projection (SetTransform PROJECTION): FUN_1000b5e0(mat, near=0.1, far, fovX, fovY): fovY = this+0x7804 = (0.195 + 0.04*sin(t*0.0075+phase*0.131)) * zoom(this+0x57c0, beat-driven, ~1)
  * userFov(this+0x8610, keys q/Q x1.02..., 0.5..2.8); fovX = fovY/aspectRatioTerm. NOTE: 0.195 'radians' looks far too narrow vs the screenshots -- either the units differ
  (maybe it is a half-angle tangent / scaled) or the world scale is tiny; tune FOV by eye against reference/*.jpg. Far plane = 34.0 (const@0x10042850) - (a computed term, likely related to the ring size 0x22=34); camera segment target = distance + 37.0 (const@0x100428f0): segments are generated until this+0x7840 >= ftol(distance+37).

## .dat layout SOLVED (mostly)
A monkeyNN.dat file is a raw snapshot of the engine state block [this+0x7828, this+0x7828 + 0xdec) = 891 dwords (0x37b), the same block
0x10004d30 copies into a 45-entry history ring at this+0x8614 + (segIdx % 0x2d)*0xdec. dat dword i == engine dword at 0x7828+4i:
 [0]=1 version, [1]=0xdec size, [2]=+0x7830 style (0-4), [3]=+0x7834 flag, [4]=+0x7838 float, [5]=+0x783c int,
 [6]=+0x7840 segment count, [7]=+0x7844 time, [8]=+0x7848 distance, ..., +0x7860 phase, +0x7864..786c colour phases.
Verified against monkey00.dat: [2]=3, [3]=0, [6]=0x4f=79. Loading a slot just memcpy's this block back.
TODO: confirm with the save/load function and name the remaining ~880 dwords by finding what reads them.

## Tooling
`decomp/vis_monkey.c` = Ghidra decompilation of all 974 functions (including vtable targets Ghidra doesn't discover alone).
Regenerate: headless Ghidra with script DumpDecomp.java (creates functions at vtable slots, re-analyzes, dumps C).
REA's per-function tools only work on functions Ghidra already defined; use the dump file for the rest.

## Other facts
- Renderer: Direct3D 8 (d3d8.dll + D3DX fonts).
- The 6.3 MB .data section is mostly the engine singleton itself (fields reach this+0x5f54e8), NOT static tables.
- 1152 procedures, 741 defined strings.

## "Style" fields = texture selectors (decoded)
this+0x7830 = style1 (rand()%5) and this+0x7834 = style2 (rand()&1) are copied into each new segment (seg+0xb5ebc / seg+0xb5ec0).
The draw loop (FUN_10007500) binds, per segment, whenever the value changes:
 - stage 0: texture = this[0x5f54c0 + style1*4]  (5 textures, loaded from `<dir>\monkey\supertex_a%d.jpg` in vt_06 0x10003670)
 - stage 1 (or stage 0 in the alternate pass): texture = this[0x5f54d4 + style2*4]  (2 textures, `supertex_b%d.jpg`), only when this+0x577c != 0.
Both only matter when textures are on (this+0x85d8, the 'T' key; off in the default screenshots) -> style has NO effect on the default look.
UVs (FUN_10004d30): u = vertex.x + (segIndex%96)/96 + ~0.0104*sin(...) (slow sideways slide), v = vertex.y (planar projection along the tunnel axis).
When style changes (FUN_10006b50): default mode: every frame, with probability 1/N (N from a hidden x87 value, likely audio/beat dependent), style1 = rand()%5;
 alternate mode (this+0x577c != 0): two countdown timers (this+0x5f54e0/e4, started at 0.01 on a random chance, advanced by speed, compared to this+0x5f54dc=34.0 = ring length)
 trigger the change so it takes effect as the new segments reach the camera. Textures a1-a5: greyscale rock/cell detail; b1-b2: coloured smoke.


## VERIFIED model (emulation ground truth) -- supersedes earlier guesses where they conflict
Method: tools/emu runs the original DLL's x86 code under Unicorn (python venv; `pip install unicorn numpy`) with CRT helpers (rand/srand/new/delete/time)
patched to Python handlers and a recording fake IDirect3DDevice8 (tools/emu/fakedev.py). `gen_truth.py`, `cam_truth.py` dump per-segment / per-frame
ground truth to decomp/*.json; web/monkey-orig.js is verified against it (node tests in the session scratchpad; see summary below).
- **World**: a ring of 34 segments. Each new segment (called once per unit of distance D, FUN_10004d30) = marching cubes (iso 0.15, 32x32 cells in x/y,
  ONE cell in z) between the PREVIOUS segment's 2D blob field and the current one. Field = sum over 16 blobs of (0.5 - d^2/r^2)^2 where d^2/r^2 < 0.5. NO noise by
  default (noise_amount ini = 0). Vertex local coords x=2*px-1, y=2*py-1, z in [0,1]; then bent: v' = (1-z)v + z*(R*v) with R = quat(q1) (bend about heading).
  Verified: vertex/triangle counts identical to the original for every segment tested; vertex positions match.
- **Blobs** (FUN_10004290): fully ported incl. spline-driven blend (gain curve FUN_10016ea0, spline FUN_1000ba90 with 2^v knot spacing). Initial state from
  FUN_10003f10 with the MSVC rand() LCG (seed -> identical scene as the original for the same srand value). Verified to 1e-6 over 40-300 segments
  (a float-knife-edge spline tie eventually desyncs the rand stream; unavoidable without x87 extended precision).
- **Path**: per segment `bend` (0..0.0027 rad, sum of 5 sharpened sines), heading vector (0x7854/58) with 0.9 IIR, angle=atan2. World chain:
  W_{i+1} = [R(q2 of seg cs+i) 0; 0 0 1 1] * W_i, W_0 = T(0,0,-frac(D)) * LookAt, cs = floor(D)+3 (verified to 5e-6).
- **Camera** (FUN_10007500): eye=(2*lerp(x_c,x_c+1)-1 + k2*RA, 2*lerp(y)-1 + k2*RB, 0), target=(2*lerp(x_c+6..)-1 + 0.6*k1*WX + jolt, ..., 6), up=(sin Q, cos Q, 0),
  Q = E785c - smoothedAngle, smoothedAngle = IIR(atan(15*f4)), f4 from ring bends/offsets (see Original.camera). VIEW matrix is identity; everything is in W.
  Horizontal FOV = E7804 rad = (0.195 + 0.04 sin(0.0075T + 0.131P)) * zoom  (~12.5 deg), vertical = E7804*h/w. near 0.1, far 34-frac(D). Verified: eye 1e-4, target 1e-4.
- **Speed** (FUN_10006b50): (12.2/fps)*(E57b4+1)*gain + 0.1*E57b4, scaled by fps and FOV terms, cap 4; T and D both advance by it each frame (30 fps nominal => ~0.41/frame).
  Beat response: on beat, 10% random render style, 26% x/y jolt, 25% spin, 25% zoom pulse, 15% speed boost; otherwise exponential decays (a^(30/fps)).
- **Palette**: FUN_10003c30 per generated segment; verified to 0.002/255. Clear colour = fog colour = palette. Fog linear 0..(31.02 + 0.99(sin+sin)).
- Constants: ALWAYS take numbers from decomp/consts.json (full float32 precision). The inlined decomp/vis_monkey_k.c is regenerated at %.9g; an earlier version
  rounded to 7 decimals and corrupted e.g. 0.0001640625.
- NOT yet ported: the original's colour/lighting pipeline (node colours = density-weighted blob colours, rotating light dirs, per-channel multipliers),
  the audio analysis (FUN_100147a0 bands) and beat detector (FUN_1000b080), hair/glow pass, render-style randomizer (FUN_10003d00), stereo modes.

## Port status (web/)
web/ contains a working WebGL2 look-alike (verified in headless Chrome via REA capture_browser_scenario: 60 fps, ~165k tris, no console errors).
Tuned-by-eye (NOT recovered) parameters: grid G=18 per unit chunk, iso 0.045, noise amp 0.06 (2 octaves used), wander x15 (original per-chunk caps 0.06/0.12 look far too straight
here, so the original must scale them elsewhere -- unresolved), blob0 radius 0.22, FOV 75deg (decoded 0.195 rad looks wrong), two coloured lights (approximation of unresolved
per-channel light terms), fog end ~31 as decoded. Preview tool: web/preview.cjs. Open issues: far-end glow is weak vs reference, wall detail/adaptive triangle sizes differ,
hair/texture/glow passes and stereo modes not implemented, audio->behaviour mapping is a simplified guess (bass -> speed).

Update: smooth (Gouraud) shading is now the default, using vertex normals from the density gradient (Tunnel.buildChunkN); F toggles flat. Default fog end is ~11 units
(animated) instead of the decoded ~31 because our thin, winding tunnels rarely show enough depth for fog to read; wires dissolve into the fog. , / . adjust fog distance.

Update: textures implemented (web/tex, keys T and B). Style1 (0-4, detail map a1-a5) and style2 (0-1, smoke b1-b2) are assigned per chunk when generated; random switches
are rate-driven by bass (the original's exact switching probability is unrecovered). Planar x/y projection (u=x+z/96+wobble, v=y) so walls streak along the tunnel, like the original.

## Next
1. Read callees of 0x10004d30: 0x10004290 (builds a ring cross-section?), 0x100017d0, 0x10003c30; and 0x10010a30, 0x100157f0.
2. Find save/load (xref string 'monkey%02d.dat') and confirm .dat == state block.
3. Dump all float constants _DAT_100423xx-100428xx from .rdata into a table (needed for a faithful port).
4. Decode mesh/vertex format, textures (supertex_*.jpg usage), fog/darkness.

## Colour / lighting pipeline (VERIFIED, exact for segments >= 2)
The original bakes everything into per-vertex diffuse colours (D3D lighting is off; texture stage 0 = MODULATE tex*diffuse, fog linear).
Per vertex (FUN_10004d30 loop @0x10005ac2, node build FUN_10002300):
- node normal = -normalize(Σ (4q-2)(dx,dy), 4·Σ 2(1-2q²)(dx·vx+dy·vy)) over the 16 blobs interpolated between the older (z=0) and newer (z=1) blob state
  (velocity = state - previous state); node colour = Σ w·blobRGB / Σ w with w=(0.5-q)², q=d²/r².
- colour = ((sin(phase)·A + B) + nodeRGB)/2 · 0.44 + 142.8 per channel (phases: x·0.131+y·0.21+z·v1+cp0 / z·v2+cp1−x·0.377+y·0.021 / z·v3+cp2−x·0.519−y·0.313),
  then × (d1·m_a + d0·m_b) with two moving lights d = clamp(N·L + ambient, 0.17, 1); truncated to bytes.
- Per-segment light directions/multipliers/ambient come from ~100 sine/pow expressions: translated mechanically from the x87 asm by
  tools/x87/asm2js.py into web/monkey-color-gen.js (do not hand-edit). Verified against the emulator: tools/tests/verify_color_params.cjs (slots to ~1e-5)
  and verify_vertex_colors.cjs (all vertices of segments 2..35 identical to the byte; segs 0/1 differ because the initial blob history is not modelled).
- Texture u = x + (segment%96 + z)/96, v = y (z = vertex depth in the segment, so the slide is continuous).
Not ported: render-style randomizer (FUN_10003d00), alternate colour modes (flags 0x577c/0x8600/0x85dc..), hair/glow passes, audio features/beat detector.

## Audio analysis + beat detector (VERIFIED against emulation: tools/tests/verify_audio.cjs, ground truth tools/emu/audio_truth.py)
- FUN_100147a0: 576 signed 8-bit waveform samples (Winamp waveformData, left channel is the one that matters) -> 2-tap smooth (x[i]+x[i-1])/2 -> Hann window -> 1024-point FFT
  magnitude, bins weighted by -0.02·ln((512-k)/512) -> 3 bands = mean of bins [256·(i/3)^2.1 .. 256·((i+1)/3)^2.1) × (3.70, 2.92, 3.39).
  Running averages per band (rates a^(14/fps)): fast avgF (a=0.2 rising / 0.5 falling), avg2 (0.91), long avgL (0.96).
- FUN_1000b080: state machine on ratios of band/avg: state 1 waits for raw/long ratio R > threshold (and > 0.2) -> beat, threshold := min(1,...), state 0 waits for
  fast/long < threshold, then threshold := 2.23·R_lastbeat + 0.3. Threshold relaxes towards a target at 0.999^(30/fps) per frame (half-life ~23 s!), so beats are
  sparse by design. Quirk: the long average starts at 0, so the very first signal makes a huge ratio and a threshold of ~100 (deaf for minutes) - the web page
  seeds the averages on the first signal (Original.seedAvg) to avoid it.
- Beat reactions use amp = beat_response_amp (default 8); the web page keeps camera reactions off (camBeat=false) and eases the speed boost (smoothBeat).

## Render flags (decoded from the key handler + emulated D3D calls)
T=0x85d8 textures, F=0x85e0 flat shading, W=0x85e8 wireframe pass, G=0x85d4 fog, H=0x85f0 hair, D=0x85dc darkness, U=0x85ec underground, E=0x85e4 errors, O=0x5794 beat responses.
Darkness (D): solid pass SHADEMODE=flat, stage 0 = SELECTARG1(TFACTOR=0xFF000000) i.e. a black tunnel, no texture; wire pass TFACTOR ~white; hair length x1.3;
clear colour = fog colour unless fog is also off (then black). Normal wire colour fades from near-white to black as T grows (not dark as earlier assumed).
Wire colour formula verified: tools/tests/verify_wire_color.cjs (truth: tools/emu/wirecap.py -> decomp/wire_truth.json). Web: key D, `#dark` / `#wire` URL options.

## Underground style (U) — verified: tools/tests/verify_wire_offset.cjs (truth: tools/emu/under_truth.py -> decomp/under_truth.json)
Only affects the wireframe pass. The wire vertices are a copy of the solid ones moved by -f·(nx, ny, 2nz) (n = node normal; n points into the wall, so f>0 moves toward the viewer).
Normal: f = 0.002. Underground (needs W): base = 0.002·2^(-1.2·cos(π(0.2·sin(0.63P+0.083v)+0.3·sin(0.1P+0.061v)+0.5))), v=(T-D)+segment;
f = 10·base (floating in front of the surface) unless (nz - mean(nz of the segment) - 0.21) < 0, then f = -3·base (buried, hidden by the depth test).
The web page now draws the wireframe as a separate LINES pass with this displacement in the vertex shader (the old barycentric overlay is gone). Key U / `#under`.

## Hair, errors, fog (verified: tools/tests/verify_hair.cjs, verify_error_colors.cjs; truth: tools/emu/hair_truth.py, col_truth_err.py)
- Vertex order: the original creates mesh vertices plane by plane, per grid point its x-edge, y-edge vertices, z-edge vertices last; the port now reproduces that order
  (needed because hair/error randomness is consumed per vertex from the shared 0x5800 jitter table via index 0x7800).
- Hair (H, key `H`): per vertex, jitter idx += 5 (wrap at 0x7fb -> 0); v = jit[idx]*0.2 + (nz - mean(nz) - 0.12); if v>0: len = min(3v,1)·L·(0.8·jit[idx+1]+0.6),
  L = 2^(0.8·sin(0.63P+0.0137·v7) - 0.4)·hairLen(1)·0.045 (×1.3 transparent_hair, ×1.3 darkness at generation time); tip = root - ((jit[idx+k]-0.5)·0.25 + n)·len.
  Drawn as lines after the wire pass, flat colour (gain-curved sines like the wire colour, exponent 3, fades to black), alpha 0x58, SRC_ALPHA/INV_SRC_ALPHA, fog on.
- Errors (E, only in flat-shading mode F and not in darkness): per vertex idx=(idx+1)&0x7ff, if jit[idx] > 0.0085+0.4·x^15 (x = 0.22·sin(0.16P+0.00472v7)+0.27·sin(0.33P+0.00312v7)+0.5)
  the normal used for lighting is negated.
- Fog (G): off -> no fog blending; clear colour = fog colour unless darkness is on too (then black).
- Remaining unported: stereo 3D (F6: red-blue anaglyph, chromatek; flag 0x8600), Desktop Mode (ALT+D), multitexture 'smoke' layer (0x577c), HUD text/help/playlist, random style switching, scene lock/shuffle.
