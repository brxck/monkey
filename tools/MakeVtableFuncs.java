import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;

// args: <vtable addr> <count>  -- creates functions at vtable slots and re-analyzes
public class MakeVtableFuncs extends GhidraScript {
    @Override
    public void run() throws Exception {
        Address vt = toAddr(getScriptArgs()[0]);
        int n = Integer.parseInt(getScriptArgs()[1]);
        for (int i = 0; i < n; i++) {
            long t = currentProgram.getMemory().getInt(vt.add(i * 4L)) & 0xffffffffL;
            Address fa = toAddr(t);
            if (getFunctionAt(fa) == null) { disassemble(fa); createFunction(fa, "vt_" + String.format("%02d", i) + "_" + Long.toHexString(t)); }
        }
        analyzeAll(currentProgram);
    }
}
