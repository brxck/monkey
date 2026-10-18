import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.scalar.Scalar;

import java.io.PrintWriter;
import java.util.TreeMap;

// args: <output json path>
// Finds every x87 instruction in .text whose memory operand is an absolute address in .rdata/.data
// and records the constant as float32 (D8/D9 opcodes), float64 (DC/DD) or int (DA/DB/DE/DF).
public class DumpConsts extends GhidraScript {
    @Override
    public void run() throws Exception {
        String out = getScriptArgs()[0];
        TreeMap<Long, String> kinds = new TreeMap<>();
        InstructionIterator it = currentProgram.getListing().getInstructions(true);
        while (it.hasNext()) {
            Instruction ins = it.next();
            byte[] b = ins.getBytes();
            int op = -1;
            for (int i = 0; i < b.length && i < 4; i++) {
                int v = b[i] & 0xff;
                if (v >= 0xd8 && v <= 0xdf) { op = v; break; }
                if (v == 0x66 || v == 0xf2 || v == 0xf3 || v == 0x0f) continue;
            }
            if (op < 0) continue;
            for (ghidra.program.model.symbol.Reference r : ins.getReferencesFrom()) {
                long a = r.getToAddress().getOffset();
                if (a >= 0x10042000L && a < 0x10048000L) {
                    String k = (op == 0xd8 || op == 0xd9) ? "f32" : (op == 0xdc || op == 0xdd) ? "f64" : "int";
                    kinds.merge(a, k, (x, y) -> x.equals(y) ? x : x + "/" + y);
                }
            }
        }
        try (PrintWriter w = new PrintWriter(out)) {
            w.println("{");
            boolean first = true;
            for (var e : kinds.entrySet()) {
                Address a = toAddr(e.getKey());
                String k = e.getValue();
                String val;
                try {
                    if (k.startsWith("f64")) {
                        long bits = currentProgram.getMemory().getLong(a);
                        val = Double.toString(Double.longBitsToDouble(bits));
                    } else if (k.startsWith("f32")) {
                        int bits = currentProgram.getMemory().getInt(a);
                        val = Float.toString(Float.intBitsToFloat(bits));
                    } else {
                        val = Integer.toString(currentProgram.getMemory().getInt(a));
                    }
                } catch (Exception ex) { val = "null"; }
                if (val.equals("NaN") || val.contains("Infinity")) val = "null";
                w.println((first ? "" : ",") + "\"" + Long.toHexString(e.getKey()) + "\": {\"t\":\"" + k + "\",\"v\":" + val + "}");
                first = false;
            }
            w.println("}");
        }
        println("CONSTS DONE n=" + kinds.size());
    }
}
