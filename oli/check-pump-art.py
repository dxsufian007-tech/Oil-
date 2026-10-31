# Verifies the screenshots written by test-v2-pump-art.js: every point of the pipe axis within +-4 tiles of the pump is pipe / flange / pump.
import json, sys
from PIL import Image
D = sys.argv[1] if len(sys.argv) > 1 else '/tmp/oli-pump-art'
meta = json.load(open(D + '/meta.json')); bad_total = 0
from collections import Counter
def ground(im):
    c = Counter(im.crop((0, 300, im.width, 700)).getdata()); return c.most_common(1)[0][0]
def pipeish(p, g):
    return sum(abs(a - b) for a, b in zip(p[:3], g)) > 90 or (p[0] > 150 and p[2] < 70)   # also the orange oil dots / yellow flanges (ground blue channel is > 90)        # anything that is not the bare ground colour: steel, flange, pump, shadow
for m in meta:
    im = Image.open(f"{D}/{m['name']}-z{m['zoom']}.png").convert('RGB'); bad = []; G = ground(im)
    for t, x, y in m['pts']:
        if abs(t) > 2.2: continue          # the pump and the pipe pieces next to it (further out it is only plain pipe)
        X, Y = round(x * m['dpr']), round(y * m['dpr'])
        if not (0 <= X < im.width and 0 <= Y < im.height): continue
        if sum(pipeish(im.getpixel((X, Y + o)), G) for o in [round(q * m['zoom'] / 1.8) for q in (-6, -3, 0, 3, 6)]) < 3: bad.append(round(t, 2))   # a specular highlight can match the ground for a pixel or two; a real gap is wider
    print(('OK   ' if not bad else 'FAIL ') + f"{m['name']} zoom {m['zoom']}: {len(m['pts'])} axis points, gaps at t={bad[:8]}"); bad_total += len(bad)
sys.exit(1 if bad_total else 0)
