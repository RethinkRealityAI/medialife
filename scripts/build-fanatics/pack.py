"""Pack the Meshy base GLBs for the web: base colour texture resized to 1024 JPEG (embedded), drop unused
data, and write the variant textures next to them. Run after recolor.py.
python pack.py <meshy dir> <out dir> <tmp dir with t_*.jpg>"""
import sys, io, os, json, struct
from PIL import Image
src, out, tmp = sys.argv[1:4]; os.makedirs(out + '/tex', exist_ok=True)
def jpeg(im, q=86):
    b = io.BytesIO(); im.convert('RGB').save(b, 'JPEG', quality=q, optimize=True, progressive=True); return b.getvalue()
def read_glb(p):
    d = open(p, 'rb').read(); n = struct.unpack_from('<I', d, 12)[0]
    j = json.loads(d[20:20 + n]); o = 20 + n; bn = struct.unpack_from('<I', d, o)[0]; return j, d[o + 8:o + 8 + bn]
def write_glb(p, j, views):
    blob = b''; 
    for i, data in enumerate(views):
        while len(blob) % 4: blob += b'\0'
        j['bufferViews'][i]['byteOffset'] = len(blob); j['bufferViews'][i]['byteLength'] = len(data); blob += data
    while len(blob) % 4: blob += b'\0'
    j['buffers'] = [{'byteLength': len(blob)}]
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    total = 12 + 8 + len(js) + 8 + len(blob)
    open(p, 'wb').write(struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + blob)
for name, file in (('flat', 'flat'), ('curved', 'curved'), ('ball', 'ball'), ('beanie', 'beanie')):
    j, bin_ = read_glb(f'{src}/{file}.glb')
    views = [bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
    for img in j['images']:
        im = Image.open(io.BytesIO(views[img['bufferView']])).resize((1024, 1024), Image.LANCZOS)
        views[img['bufferView']] = jpeg(im); img['mimeType'] = 'image/jpeg'
    for v in j['bufferViews']: v['buffer'] = 0
    write_glb(f'{out}/{name}.glb', j, views)
    print(name, os.path.getsize(f'{out}/{name}.glb') // 1024, 'KB')
for t in ('black76', 'sixers'):
    open(f'{out}/tex/{t}.jpg', 'wb').write(jpeg(Image.open(f'{tmp}/t_{t}.jpg'))); print(t, os.path.getsize(f'{out}/tex/{t}.jpg') // 1024, 'KB')
