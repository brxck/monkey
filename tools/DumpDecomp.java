import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.util.task.ConsoleTaskMonitor;

import java.io.PrintWriter;

// args: <output .c path> <vtable start addr> <vtable entry count>
public class DumpDecomp extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        String out = args[0];
        Address vt = toAddr(args[1]);
        int n = Integer.parseInt(args[2]);

        for (int i = 0; i < n; i++) {
            Address slot = vt.add(i * 4L);
            long target = currentProgram.getMemory().getInt(slot) & 0xffffffffL;
            Address fa = toAddr(target);
            if (getFunctionAt(fa) == null) {
                disassemble(fa);
                createFunction(fa, "vt_" + String.format("%02d", i) + "_" + Long.toHexString(target));
            }
        }
        analyzeAll(currentProgram);

        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        int ok = 0, fail = 0;
        try (PrintWriter w = new PrintWriter(out)) {
            FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
            while (it.hasNext()) {
                Function f = it.next();
                if (f.isExternal()) continue;
                DecompileResults r = di.decompileFunction(f, 60, new ConsoleTaskMonitor());
                w.println("// ==== " + f.getName() + " @ " + f.getEntryPoint() + " ====");
                if (r.decompileCompleted()) {
                    w.println(r.getDecompiledFunction().getC());
                    ok++;
                } else {
                    w.println("// decompile failed: " + r.getErrorMessage());
                    fail++;
                }
            }
        }
        println("DUMP DONE ok=" + ok + " fail=" + fail);
    }
}
