"""Fake IDirect3DDevice8 for the emulator: every method is a stub that records its arguments (and returns D3D_OK)."""
import struct
from unicorn import *
from unicorn.x86_const import *
from monkey_emu import ENGINE, HEAP_BASE

# (name, number of 4-byte args including `this`) in vtable order
M = [("QueryInterface",3),("AddRef",1),("Release",1),("TestCooperativeLevel",1),("GetAvailableTextureMem",1),("ResourceManagerDiscardBytes",2),("GetDirect3D",2),("GetDeviceCaps",2),("GetDisplayMode",2),("GetCreationParameters",2),("SetCursorProperties",4),("SetCursorPosition",4),("ShowCursor",2),("CreateAdditionalSwapChain",3),("Reset",2),("Present",5),("GetBackBuffer",4),("GetRasterStatus",2),("SetGammaRamp",3),("GetGammaRamp",2),("CreateTexture",8),("CreateVolumeTexture",9),("CreateCubeTexture",7),("CreateVertexBuffer",6),("CreateIndexBuffer",6),("CreateRenderTarget",7),("CreateDepthStencilSurface",6),("CreateImageSurface",5),("CopyRects",6),("UpdateTexture",3),("GetFrontBuffer",2),("SetRenderTarget",3),("GetRenderTarget",2),("GetDepthStencilSurface",2),("BeginScene",1),("EndScene",1),("Clear",7),("SetTransform",3),("GetTransform",3),("MultiplyTransform",3),("SetViewport",2),("GetViewport",2),("SetMaterial",2),("GetMaterial",2),("SetLight",3),("GetLight",3),("LightEnable",3),("GetLightEnable",3),("SetClipPlane",3),("GetClipPlane",3),("SetRenderState",3),("GetRenderState",3),("BeginStateBlock",1),("EndStateBlock",2),("ApplyStateBlock",2),("CaptureStateBlock",2),("DeleteStateBlock",2),("CreateStateBlock",3),("SetClipStatus",2),("GetClipStatus",2),("GetTexture",3),("SetTexture",3),("GetTextureStageState",4),("SetTextureStageState",4),("ValidateDevice",2),("GetInfo",4),("SetPaletteEntries",3),("GetPaletteEntries",3),("SetCurrentTexturePalette",2),("GetCurrentTexturePalette",2),("DrawPrimitive",4),("DrawIndexedPrimitive",6),("DrawPrimitiveUP",5),("DrawIndexedPrimitiveUP",9),("ProcessVertices",6),("CreateVertexShader",6),("SetVertexShader",2),("GetVertexShader",2),("DeleteVertexShader",2),("SetVertexShaderConstant",4),("GetVertexShaderConstant",4),("GetVertexShaderDeclaration",4),("GetVertexShaderFunction",4),("SetStreamSource",4),("GetStreamSource",4),("SetIndices",3),("GetIndices",3),("CreatePixelShader",3),("SetPixelShader",2),("GetPixelShader",2),("DeletePixelShader",2),("SetPixelShaderConstant",4),("GetPixelShaderConstant",4),("GetPixelShaderFunction",4),("DrawRectPatch",4),("DrawTriPatch",4),("DeletePatch",2)]

STUB_BASE = 0x0E000000
VTBL = HEAP_BASE + 0x01000000  # inside the mapped heap, below anything the bump allocator reaches
DEV = VTBL + 0x400
PSTRUCT = DEV + 0x100
INTNO = 0x22


class FakeDevice:
    def __init__(self, m, width=640, height=480, capture_draw=True):
        self.m = m; mu = m.mu
        self.calls = []; self.capture_draw = capture_draw
        mu.mem_map(STUB_BASE, 0x1000)
        for i, (name, n) in enumerate(M):
            mu.mem_write(STUB_BASE + 8 * i, b'\xcd\x22\xc2' + struct.pack('<H', 4 * n))
            m.w32(VTBL + 4 * i, STUB_BASE + 8 * i)
        m.w32(DEV, VTBL)
        m.w32(PSTRUCT + 0xd0, DEV)
        m.w32(PSTRUCT + 0x10, width); m.w32(PSTRUCT + 0x14, height)
        m.w32(ENGINE + 0x24d0, PSTRUCT)
        mu.hook_add(UC_HOOK_INTR, self._intr)

    def _intr(self, mu, intno, ud):
        if intno != INTNO: return
        m = self.m
        eip = mu.reg_read(UC_X86_REG_EIP) - 2
        i = (eip - STUB_BASE) // 8
        name, n = M[i]
        esp = mu.reg_read(UC_X86_REG_ESP)
        args = list(struct.unpack('<%dI' % (n - 1), mu.mem_read(esp + 4 + 4, 4 * (n - 1)))) if n > 1 else []
        rec = {'m': name, 'a': args}
        if name == 'SetTransform':
            rec['mat'] = m.rfs(args[1], 16)
        elif name == 'DrawIndexedPrimitiveUP' and self.capture_draw:
            # (type, minIdx, numVerts, primCount, pIdx, idxFmt, pVerts, stride)
            ptype, minv, nv, npr, pidx, fmt, pv, stride = args
            rec['idx'] = list(struct.unpack('<%dH' % (3 * npr), m.rb(pidx, 6 * npr)))
            rec['vtx'] = m.rb(pv, nv * stride)
        elif name == 'Clear':
            pass
        self.calls.append(rec)
        mu.reg_write(UC_X86_REG_EAX, 0)
