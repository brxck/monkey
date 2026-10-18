import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.*;
import java.io.PrintWriter;

// args: <output .asm path>   -- one line per instruction: "addr: mnemonic operands", function headers as "; FUNC name addr"
public class DumpAsm extends GhidraScript {
    @Override
    public void run() throws Exception {
        try (PrintWriter w = new PrintWriter(getScriptArgs()[0])) {
            FunctionIterator fi = currentProgram.getFunctionManager().getFunctions(true);
            while (fi.hasNext()) {
                Function f = fi.next();
                if (f.isExternal()) continue;
                w.println("; FUNC " + f.getName() + " " + f.getEntryPoint());
                InstructionIterator it = currentProgram.getListing().getInstructions(f.getBody(), true);
                while (it.hasNext()) {
                    Instruction ins = it.next();
                    w.println(ins.getAddress() + ": " + ins.toString());
                }
            }
        }
        println("ASM DONE");
    }
}
