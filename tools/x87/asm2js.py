"""Translate a straight-ish x87 asm range of vis_monkey.dll (from decomp/vis_monkey.asm) into JS.
usage: asm2js.py <start-hex> <end-hex> <fname> > out.js
Memory model: [ESP+k] -> S[k-pushed], [EBX+k] -> E(k), [0x1004xxxx] -> literal from decomp/consts.json.
x87 stack -> JS array."""
import re, sys, json, struct
ASM = '/Users/brock/dev/monkey/decomp/vis_monkey.asm'
CONSTS = json.load(open('/Users/brock/dev/monkey/decomp/consts.json'))
start, end, fname = int(sys.argv[1], 16), int(sys.argv[2], 16), sys.argv[3]
lines = []
for l in open(ASM):
    m = re.match(r'^([0-9a-f]{8}): (.*)$', l.rstrip())
    if m and start <= int(m.group(1), 16) < end: lines.append((int(m.group(1), 16), m.group(2).strip()))
targets = set()
for a, t in lines:
    m = re.match(r'J\w+ 0x([0-9a-f]+)', t)
    if m: targets.add(int(m.group(1), 16))
def lit(addr):
    c = CONSTS['%x' % addr]; v = c['v']
    if c['t'].startswith('f32'): return repr(float(struct.unpack('<f', struct.pack('<f', v))[0]))
    return repr(float(v))
def mem(op, pushed):
    m = re.match(r'(?:float|double|dword|qword) ptr \[(.*)\]$', op)
    if not m: return None
    a = m.group(1).replace(' ', '')
    if re.match(r'^0x[0-9a-f]+$', a): return lit(int(a, 16))
    m2 = re.match(r'^EBX\+0x([0-9a-f]+)$', a)
    if m2: return 'E(0x%s)' % m2.group(1)
    m2 = re.match(r'^ESP(?:\+0x([0-9a-f]+))?$', a)
    if m2: return 'S[%d]' % (int(m2.group(1) or '0', 16) - pushed)
    raise SystemExit('bad mem ' + op)
def stw(op, pushed):
    m = re.match(r'(?:float|dword) ptr \[ESP(?: \+ 0x([0-9a-f]+))?\]$', op)
    return 'S[%d]' % (int(m.group(1) or '0', 16) - pushed)
out = ['function %s(E, S, EBP, f32, gain) {' % fname,
       '  var st = [], AH = 0, ZF = 0, EAX = 0, ECX = 0, EDX = 0, ESI = 0, pc = 0x%x;' % start,
       '  function ST(i) { return st[st.length - 1 - i]; }',
       '  function SETST(i, v) { st[st.length - 1 - i] = v; }',
       '  function bits(b) { return new Float32Array(new Uint32Array([b]).buffer)[0]; }',
       '  for (;;) switch (pc) {']
pushed = 0; pushes = []
def bin(op, a, b):
    return {'FADD': '%s + %s', 'FSUB': '%s - %s', 'FSUBR': '%s2 - %s2', 'FMUL': '%s * %s', 'FDIV': '%s / %s', 'FDIVR': '%s2 / %s2'}[op]
first = True
for a, t in lines:
    if a in targets or first:
        out.append('  case 0x%x:' % a); first = False
    mn, _, rest = t.partition(' '); rest = rest.strip()
    code = None
    if mn == 'FLD':
        if rest.startswith('ST'): code = 'st.push(ST(%d));' % int(rest[2:])
        elif 'ptr' in rest and 'dword ptr' not in rest: code = 'st.push(%s);' % mem(rest, pushed)
        else: raise SystemExit(t)
    elif mn in ('FST', 'FSTP'):
        if rest.startswith('ST'): code = 'SETST(%d, ST(0));' % int(rest[2:])
        else: code = '%s = f32(ST(0));' % stw(rest, pushed)
        if mn == 'FSTP': code += ' st.pop();'
    elif mn in ('FADD', 'FSUB', 'FSUBR', 'FMUL', 'FDIV', 'FDIVR'):
        op = {'FADD': '+', 'FSUB': '-', 'FMUL': '*', 'FDIV': '/'}.get(mn)
        if 'ptr' in rest:
            m_ = mem(rest, pushed)
            if mn == 'FSUBR': code = 'SETST(0, %s - ST(0));' % m_
            elif mn == 'FDIVR': code = 'SETST(0, %s / ST(0));' % m_
            else: code = 'SETST(0, ST(0) %s %s);' % (op, m_)
        else:
            ops = [x.strip() for x in rest.split(',')]
            if len(ops) == 2: d, s = int(ops[0][2:]), int(ops[1][2:])
            else: d, s = 0, int(ops[0][2:])
            if mn == 'FSUBR': code = 'SETST(%d, ST(%d) - ST(%d));' % (d, s, d)
            elif mn == 'FDIVR': code = 'SETST(%d, ST(%d) / ST(%d));' % (d, s, d)
            else: code = 'SETST(%d, ST(%d) %s ST(%d));' % (d, d, op, s)
    elif mn in ('FADDP', 'FSUBP', 'FMULP', 'FSUBRP', 'FDIVP', 'FDIVRP'):
        d = int(rest.split(',')[0].strip()[2:]) if rest else 1
        op = {'FADDP': '+', 'FSUBP': '-', 'FMULP': '*', 'FDIVP': '/'}.get(mn)
        if mn == 'FSUBRP': code = 'SETST(%d, ST(0) - ST(%d));' % (d, d)
        elif mn == 'FDIVRP': code = 'SETST(%d, ST(0) / ST(%d));' % (d, d)
        else: code = 'SETST(%d, ST(%d) %s ST(0));' % (d, d, op)
        code += ' st.pop();'
    elif mn == 'FXCH':
        i = int(rest[2:]) if rest else 1
        code = '{ var t_ = ST(0); SETST(0, ST(%d)); SETST(%d, t_); }' % (i, i)
    elif mn == 'FSIN': code = 'SETST(0, Math.sin(ST(0)));'
    elif mn == 'FCOS': code = 'SETST(0, Math.cos(ST(0)));'
    elif mn == 'FABS': code = 'SETST(0, Math.abs(ST(0)));'
    elif mn == 'FCHS': code = 'SETST(0, -ST(0));'
    elif mn == 'FILD': code = 'st.push(%s);' % mem(rest, pushed)
    elif mn in ('FCOM', 'FCOMP'):
        b = ('ST(%d)' % int(rest[2:])) if rest.startswith('ST') else mem(rest, pushed)
        code = 'AH = (ST(0) < %s ? 1 : 0) | (ST(0) == %s ? 0x40 : 0);' % (b, b)
        if mn == 'FCOMP': code += ' st.pop();'
    elif mn == 'FNSTSW': code = ''
    elif mn == 'TEST' and rest.startswith('AH'): code = 'ZF = (AH & %s) === 0;' % rest.split(',')[1]
    elif mn == 'TEST': code = 'ZF = (%s) === 0;' % rest.split(',')[0]
    elif mn in ('JZ', 'JNZ', 'JMP'):
        tgt = int(rest.split('0x')[1], 16)
        cond = {'JZ': 'ZF', 'JNZ': '!ZF', 'JMP': 'true'}[mn]
        code = 'if (%s) { pc = 0x%x; continue; }' % (cond, tgt)
    elif mn == 'CDQ': code = 'EDX = EAX < 0 ? -1 : 0;'
    elif mn == 'IDIV': code = '{ var q_ = Math.trunc(EAX / ECX); EDX = EAX - q_ * ECX; EAX = q_; }'
    elif mn == 'CMP': a1, b1 = [x.strip() for x in rest.split(',')]; code = 'ZF = (%s) === (%s);' % (a1, b1)
    elif mn == 'XOR': a1, b1 = [x.strip() for x in rest.split(',')]; assert a1 == b1; code = '%s = 0;' % a1
    elif mn == 'INC': code = '%s++;' % rest
    elif mn == 'ADD' and rest.startswith('ESP'): code = ''; pushed -= int(rest.split(',')[1], 16)
    elif mn == 'PUSH': code = ''; pushed += 4; pushes.append(rest)
    elif mn == 'MOV':
        d, s = [x.strip() for x in rest.split(',', 1)]
        if d.startswith('dword ptr'):
            if re.match(r'^(0x[0-9a-f]+)$', s): code = '%s = bits(%s);' % (stw(d, pushed), s)
            else: code = '%s = %s;' % (stw(d, pushed), s)
        elif s.startswith('dword ptr'): code = '%s = %s;' % (d, mem(s, pushed))
        else: code = '%s = %s;' % (d, s)
    elif mn == 'CALL':
        tg = int(rest.split('0x')[1], 16)
        if tg == 0x10017cd0: code = '{ var e_ = ST(0), b_ = ST(1); st.pop(); SETST(0, Math.pow(b_, e_)); }'
        elif tg == 0x10016ea0: code = 'st.push(gain(S[%d], -1.7999999523162842));' % (0 - pushed)
        else: raise SystemExit('call ' + t)
    else: raise SystemExit('unhandled: ' + t)
    out.append('    ' + code + '   // %x %s' % (a, t))
out.append('    return S;'); out.append('  }'); out.append('}')
print('\n'.join(out))
