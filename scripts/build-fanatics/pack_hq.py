"""Pack the round-2 Meshy GLBs (one per product, meshy-7.1 + PBR, 4K) for the web: every texture re-encoded as
JPEG at a size per role (base colour + normal 2048, metal/rough 1024), emission dropped (Meshy wires the base
colour into it, which reads as unlit), GLB rewritten by hand.
python pack_hq.py <in.glb> <out.glb>"""
import sys, io, json, struct
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
src, dst = sys.argv[1:3]
SIZE = {'base': 2048, 'normal': 2048, 'mr': 1024, 'occ': 1024}
def jpeg(im, q):
    b = io.BytesIO(); im.convert('RGB').save(b, 'JPEG', quality=q, optimize=True, progressive=True); return b.getvalue()
d = open(src, 'rb').read(); n = struct.unpack_from('<I', d, 12)[0]
j = json.loads(d[20:20 + n]); o = 20 + n; bn = struct.unpack_from('<I', d, o)[0]; bin_ = d[o + 8:o + 8 + bn]
views = [bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
def acc(i):   # an accessor as a numpy array
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a['componentType']]; nc = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
    raw = bin_[v.get('byteOffset', 0) + a.get('byteOffset', 0):]; return np.frombuffer(raw, dt, a['count'] * nc).reshape(a['count'], nc)
# Meshy leaves no gutter between UV islands: downsampling and mipmaps then pull the neighbour's colour across the seam
# (white "lint" lines on a red cap). Rasterise the islands and fill everything outside them with the nearest island
# texel before resizing.
def coverage(size):
    m = Image.new('L', (size, size), 0); d = ImageDraw.Draw(m)
    for mesh in j['meshes']:
        for p in mesh['primitives']:
            uv = acc(p['attributes']['TEXCOORD_0']) * size; idx = acc(p['indices']).reshape(-1, 3)
            for t in idx: d.polygon([tuple(uv[t[0]]), tuple(uv[t[1]]), tuple(uv[t[2]])], fill=255)
    return np.asarray(m) > 0
_near = {}
def bleed(im):
    s = im.size[0]
    if s not in _near:
        inside = coverage(s); _near[s] = ndimage.distance_transform_edt(~inside, return_distances=False, return_indices=True)
        print('  coverage', s, round(inside.mean() * 100), '%')
    iy, ix = _near[s]; a = np.asarray(im.convert('RGB')); return Image.fromarray(a[iy, ix])
role = {}
for m in j.get('materials', []):
    pb = m.get('pbrMetallicRoughness', {})
    for key, r in (('baseColorTexture', 'base'), ('metallicRoughnessTexture', 'mr')):
        if key in pb: role[j['textures'][pb[key]['index']]['source']] = r
    if 'normalTexture' in m: role[j['textures'][m['normalTexture']['index']]['source']] = 'normal'
    if 'occlusionTexture' in m: role[j['textures'][m['occlusionTexture']['index']]['source']] = 'occ'
    m.pop('emissiveTexture', None); m.pop('emissiveFactor', None)
for i, img in enumerate(j.get('images', [])):
    r = role.get(i, 'unused')
    if r == 'unused': views[img['bufferView']] = b''; continue
    im = bleed(Image.open(io.BytesIO(views[img['bufferView']]))); s = SIZE[r]
    if max(im.size) > s: im = im.resize((s, s), Image.LANCZOS)
    views[img['bufferView']] = jpeg(im, 90 if r == 'normal' else 86); img['mimeType'] = 'image/jpeg'
    print(' ', r, im.size, len(views[img['bufferView']]) // 1024, 'KB')
blob = b''
for i, data in enumerate(views):
    while len(blob) % 4: blob += b'\0'
    j['bufferViews'][i]['byteOffset'] = len(blob); j['bufferViews'][i]['byteLength'] = len(data); j['bufferViews'][i]['buffer'] = 0; blob += data
while len(blob) % 4: blob += b'\0'
j['buffers'] = [{'byteLength': len(blob)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(blob)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + blob)
print(dst, (28 + len(js) + len(blob)) // 1024, 'KB')
