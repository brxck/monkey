"""Run pieces of vis_monkey.dll under Unicorn to get ground-truth behaviour of the original generation code.

usage (from this directory):  <venv>/bin/python monkey_emu.py
Provides class Monkey: loads the DLL, patches CRT helpers (rand/srand/new/delete/time) with Python handlers and lets you call original
functions on the engine singleton (0x10066c10).  See ../../NOTES.md for what the fields mean.
"""
import struct, sys
from unicorn import *
from unicorn.x86_const import *

DLL = '/Users/brock/dev/monkey/extracted/vis_monkey.dll'
BASE = 0x10000000
ENGINE = 0x10066C10
STACK_TOP = 0x00800000
STACK_SIZE = 0x00400000
HEAP_BASE = 0x30000000
HEAP_SIZE = 0x20000000
SENT = 0x0F000000

# addresses of CRT helpers inside the DLL
A_RAND, A_SRAND, A_NEW, A_DELETE, A_TIME = 0x10017C1E, 0x10017C11, 0x10017C40, 0x10017C06, 0x10017F3F


class Monkey:
    def __init__(self, time0=1000000000):
        d = open(DLL, 'rb').read()
        pe = struct.unpack_from('<I', d, 0x3c)[0]
        nsec, = struct.unpack_from('<H', d, pe + 6)
        opt, = struct.unpack_from('<H', d, pe + 20)
        self.image_size, = struct.unpack_from('<I', d, pe + 24 + 56)
        mu = self.mu = Uc(UC_ARCH_X86, UC_MODE_32)
        mu.mem_map(BASE, (self.image_size + 0xFFF) & ~0xFFF)
        hdr, = struct.unpack_from('<I', d, pe + 24 + 60)
        mu.mem_write(BASE, d[:hdr])
        sec = pe + 24 + opt
        for i in range(nsec):
            name, vs, va, rs, rp = struct.unpack_from('<8sIIII', d, sec + 40 * i)
            mu.mem_write(BASE + va, d[rp:rp + min(rs, vs)])
        mu.mem_map(STACK_TOP - STACK_SIZE, STACK_SIZE)
        mu.mem_map(HEAP_BASE, HEAP_SIZE)
        mu.mem_map(SENT, 0x1000); mu.mem_write(SENT, b'\xf4')
        self.heap_ptr = HEAP_BASE
        self.seed = 1
        self.time0 = time0
        self.rand_log = []
        # patch CRT helpers: INT 0x21 ; RET   (handler fills EAX; the RET then returns to the caller)
        for a in (A_RAND, A_SRAND, A_NEW, A_DELETE, A_TIME):
            mu.mem_write(a, b'\xcd\x21\xc3')
        mu.hook_add(UC_HOOK_INTR, self._intr)
        mu.hook_add(UC_HOOK_MEM_UNMAPPED, self._unmapped)
        self.dbg_calls = []

    # ---- host services ----
    def _intr(self, mu, intno, ud):
        if intno != 0x21: return
        eip = mu.reg_read(UC_X86_REG_EIP)
        fn = eip - 2  # address of the patched function entry
        esp = mu.reg_read(UC_X86_REG_ESP)
        arg0 = struct.unpack('<I', mu.mem_read(esp + 4, 4))[0]
        if fn == A_RAND:
            self.seed = (self.seed * 214013 + 2531011) & 0xFFFFFFFF
            v = (self.seed >> 16) & 0x7FFF
            self.rand_log.append(v)
            mu.reg_write(UC_X86_REG_EAX, v)
        elif fn == A_SRAND:
            self.seed = arg0 if not hasattr(self, 'force_seed') or self.force_seed is None else self.force_seed
        elif fn == A_NEW:
            p = self.heap_ptr
            self.heap_ptr = (self.heap_ptr + arg0 + 15) & ~15
            if self.heap_ptr > HEAP_BASE + HEAP_SIZE:
                raise RuntimeError('heap exhausted')
            mu.reg_write(UC_X86_REG_EAX, p)
        elif fn == A_DELETE:
            pass
        elif fn == A_TIME:
            mu.reg_write(UC_X86_REG_EAX, self.time0)
        else:
            raise RuntimeError('unexpected interrupt at %x' % eip)

    def _unmapped(self, mu, access, address, size, value, ud):
        eip = mu.reg_read(UC_X86_REG_EIP)
        print('UNMAPPED access=%d addr=%08x size=%d at eip=%08x' % (access, address, size, eip))
        return False

    # ---- memory helpers ----
    def r32(self, a): return struct.unpack('<I', self.mu.mem_read(a, 4))[0]
    def ri32(self, a): return struct.unpack('<i', self.mu.mem_read(a, 4))[0]
    def rf(self, a): return struct.unpack('<f', self.mu.mem_read(a, 4))[0]
    def w32(self, a, v): self.mu.mem_write(a, struct.pack('<I', v & 0xFFFFFFFF))
    def wf(self, a, v): self.mu.mem_write(a, struct.pack('<f', v))
    def rfs(self, a, n): return list(struct.unpack('<%df' % n, self.mu.mem_read(a, 4 * n)))
    def rb(self, a, n): return bytes(self.mu.mem_read(a, n))

    def e(self, off): return ENGINE + off  # engine field address

    # ---- calling ----
    def call(self, addr, ecx=None, args=(), max_insn=200_000_000):
        mu = self.mu
        esp = STACK_TOP - 0x1000
        for a in reversed(args):
            esp -= 4; mu.mem_write(esp, struct.pack('<I', a & 0xFFFFFFFF))
        esp -= 4; mu.mem_write(esp, struct.pack('<I', SENT))
        mu.reg_write(UC_X86_REG_ESP, esp)
        mu.reg_write(UC_X86_REG_EBP, 0)
        if ecx is not None: mu.reg_write(UC_X86_REG_ECX, ecx)
        mu.emu_start(addr, SENT, count=max_insn)
        return mu.reg_read(UC_X86_REG_EAX)


if __name__ == '__main__':
    m = Monkey()
    print('loaded; engine ptr readable:', hex(m.r32(ENGINE)))
    m.call(0x10002FE0, ecx=ENGINE)       # vt_01: reset default settings
    print('after defaults: 0x57c0 =', m.rf(m.e(0x57c0)), ' 0x7804 =', m.rf(m.e(0x7804)))


# ---------------------------------------------------------------------------------------------
def init_scene(m, noise_amount=None, mesh_quality=None, seed=12345):
    """vt_01 (defaults) -> optional ini overrides -> vt_04 (mesh setup + scene randomize)."""
    m.force_seed = None
    m.call(0x10002FE0, ecx=ENGINE)                      # defaults
    if noise_amount is not None: m.w32(m.e(0x5790), noise_amount)
    if mesh_quality is not None: m.w32(m.e(0x5784), mesh_quality)
    m.wf(m.e(0x24c4), 30.0)                              # fps
    m.seed = seed
    m.call(0x10003610, ecx=ENGINE)                       # FUN_10001040(...) + FUN_10003f10()


SEG_STRIDE = 0x28B54


def seg_base(i): return ENGINE + (i % 0x22) * SEG_STRIDE


def gen_segment(m):
    """Call FUN_10004d30 for the next segment; returns its index."""
    i = m.ri32(m.e(0x7840))
    m.call(0x10004D30, ecx=ENGINE)
    return i


def blobs(m):
    return (m.rfs(m.e(0x8c9a4), 16), m.rfs(m.e(0x8c9e4), 16), m.rfs(m.e(0x8ca24), 16))


if __name__ == '__main__' and len(sys.argv) > 1 and sys.argv[1] == 'seg':
    m = Monkey()
    init_scene(m, noise_amount=int(sys.argv[2]) if len(sys.argv) > 2 else None)
    print('iso(0x5d594)=', m.rf(m.e(0x5d594)), 'grid N=', m.ri32(m.e(0x5d770)), 'quality', m.ri32(m.e(0x5784)), 'phase 0x7860', m.rf(m.e(0x7860)))
    for k in range(6):
        i = gen_segment(m)
        sb = seg_base(i)
        print('seg', i, 'verts', m.ri32(sb + 0x8d398), 'tris', m.ri32(sb + 0x8d39c), 'x,y', m.rf(sb + 0xb5eb4), m.rf(sb + 0xb5eb8), 'style', m.ri32(sb + 0xb5ebc), m.ri32(sb + 0xb5ec0))
