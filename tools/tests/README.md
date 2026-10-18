# Verification against the original DLL

Ground truth comes from running vis_monkey.dll under emulation (../emu, Python + Unicorn):

    python3 -m venv venv && venv/bin/pip install unicorn numpy
    venv/bin/python ../emu/gen_truth.py 4242 400     # -> ../../decomp/truth_4242.json   (blob/path/palette per segment)
    venv/bin/python ../emu/cam_truth.py 4242 300     # -> ../../decomp/cam_truth_4242.json (camera + world matrices per frame, zero audio)
    venv/bin/python ../emu/dump_segs.py              # -> ../../decomp/emu_segs.json      (original meshes for verify_mesh_counts)

Then compare the JS port (needs node):

    node verify_blobs_path_palette.cjs 4242   # blobs, wander, bend/heading, palette
    node verify_camera.cjs 4242               # eye/target/up/FOV and 34 world matrices over 300 frames
    node verify_mesh_counts.cjs               # marching-cubes vertex/triangle counts

Expected: blob positions ~1e-6 for the first ~200 segments (later a float tie may desync the random stream), palette < 0.003/255,
camera eye/target ~1e-4, world matrices ~1e-3. (`verify_camera` still compares FOV against the vertical value; use the horizontal one.)
