# Paint atlas sidecars for existing GLBs (the models themselves are not changed: Spray Bobo Enhanced loads the exact
# files other experiences use, e.g. Cola Run's Bobo). xatlas cuts the model into charts and packs them into ONE
# non-overlapping UV square shared by all its parts (the models' own UVs overlap: Bobo's two back legs share one
# picture). At runtime each part's geometry is re-indexed with `xref` (xatlas splits vertices on chart seams) and
# gets the atlas as its `uv1` attribute.
#   python3 atlas.py <dump dir from extract.mjs> <out dir>
# Sidecar <name>.atlas.bin: u32 json length, json {prims:[{key, n, t, xref, index, uv}]} (byte offsets), padded to 4,
# then per prim xref u32[n], index u16|u32[t*3], uv u16[n*2] (normalised 0..65535).
import sys, json, struct, os
import numpy as np, xatlas

SKIP = {'eclipse-can': ('Can_Fizz', 'Silhouette', 'Can_Body_Line'), 'old-bobo': ('Silhouette',)}
src, out = sys.argv[1], sys.argv[2]
for name in ['catrun', 'eclipse-can', 'old-bobo', 'robot', 'ml_figure']:
    d = json.load(open(os.path.join(src, name + '.json')))
    seen = set(); prims = []
    for p in d['prims']:
        if any(p['name'].startswith(s) for s in SKIP.get(name, ())) or p['key'] in seen: continue
        seen.add(p['key']); prims.append(p)
    at = xatlas.Atlas()
    for p in prims:
        at.add_mesh(np.array(p['pos'], np.float32).reshape(-1, 3), np.array(p['idx'], np.uint32).reshape(-1, 3))
    co = xatlas.ChartOptions(); po = xatlas.PackOptions(); po.resolution = 1024; po.padding = 6; po.bilinear = True
    at.generate(co, po)
    head = []; body = bytearray()
    def put(a):
        while len(body) % 4: body.append(0)
        off = len(body); body.extend(np.ascontiguousarray(a).tobytes()); return off
    for i, p in enumerate(prims):
        vm, idx, uv = at[i]; n = len(vm)
        it = np.uint16 if n < 65536 else np.uint32
        head.append({'key': p['key'], 'name': p['name'], 'n': int(n), 't': int(len(idx)), 'wide': it == np.uint32,
                     'xref': put(vm.astype(np.uint32)), 'index': put(idx.reshape(-1).astype(it)),
                     'uv': put(np.clip(np.round(uv * 65535), 0, 65535).astype(np.uint16))})
    js = json.dumps({'model': d['url'], 'size': [at.width, at.height], 'prims': head}).encode()
    pad = (4 - (4 + len(js)) % 4) % 4; js += b' ' * pad
    path = os.path.join(out, name + '.atlas.bin')
    open(path, 'wb').write(struct.pack('<I', len(js)) + js + bytes(body))
    print(name, len(prims), 'parts', at.width, 'x', at.height, 'util %.2f' % at.utilization, os.path.getsize(path) // 1024, 'KB')
