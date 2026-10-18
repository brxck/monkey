# Monkey WebGL port (look-alike)

Open `index.html` through any static server (WebGL2 + Web Audio need http/https, not file://):

    cd web && python3 -m http.server 8000     # then open http://localhost:8000

Click **Demo audio**, **Microphone**, **Tab / system audio** or load an audio file. Keys: H panel, R new tunnel, W wireframe,
D darkness, U underground (with W), H hair, E errors (with F), G fog, I hide panel, F flat/smooth shading, T textures, +/- speed, [ ] field of view, Space pause, Enter fullscreen.

Files
- `monkey-color-gen.js`  GENERATED (tools/x87/asm2js.py) per-segment lighting parameters, translated from the DLL's x87 code.
- `monkey-orig.js`  FAITHFUL port of the original's generation/path/camera/speed/palette logic (verified against an emulated copy of the DLL, see ../NOTES.md).
- `index-legacy.html` + `monkey-core.js`  the earlier approximate implementation (kept for comparison).
- `mc-table.js`     256-case marching-cubes table extracted from the original DLL.
- `tex/`            the seven `supertex_*.jpg` images from the original installer (a1-a5 detail maps, b1-b2 smoke).
- `index.html`      WebGL2 renderer driven by monkey-orig.js (30 Hz simulation, interpolated camera), audio input, keys.
- `preview.cjs`     (legacy) software renderer for the old model.

Fidelity: tunnel generation, path, camera, speed, colours/lighting, audio analysis, beat detection and beat reactions follow the original numerically
(verified against the emulated DLL, see ../tools/tests). Deviations: camera beat reactions are off and the speed boost is eased; the beat detector's
start-up transient is avoided by seeding its averages. Hair, darkness, underground, errors, fog and the wireframe pass are ported. Not ported: stereo 3D, Desktop Mode, the multitexture smoke layer, HUD text, random render-style switching.
