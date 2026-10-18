import sys; sys.path.insert(0,'.')
from monkey_emu import *
m=Monkey(); init_scene(m)
B=ENGINE+0x2f890
def f(o): return m.rf(B+o)
def i(o): return m.ri32(B+o)
print('mesh obj base',hex(B))
for name,o,t in [('maxdepth? 0x5d59c',0x5d59c,'i'),('layer ctr 0x5d5a0',0x5d5a0,'i'),('iso 0x5d594',0x5d594,'f'),('noiseAmp 0x5d598',0x5d598,'f'),('lo 0x5d6b8',0x5d6b8,'f'),('hi 0x5d6bc',0x5d6bc,'f'),
                 ('N 0x5d770',0x5d770,'i'),('layers 0x5d768',0x5d768,'i'),('0x5d76c',0x5d76c,'i'),('cell 0x5d778',0x5d778,'f'),('0x5d77c',0x5d77c,'f'),('cell2 0x5d780',0x5d780,'f'),('0x5d774',0x5d774,'i'),('0x104',0x104,'i'),('0x108',0x108,'i'),('0x10c nodes',0x10c,'i'),('0x110 tris',0x110,'i')]:
    print(name, i(o) if t=='i' else f(o))
print('param_1[0x41],[0x42]', i(0x104), i(0x108))
print('blob count *B', i(0))
