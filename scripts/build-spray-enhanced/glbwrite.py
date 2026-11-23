# Minimal glTF 2.0 binary writer for the procedural props (static meshes, flat PBR colours).
import json, struct
import numpy as np

def write_glb(path, parts, name='prop'):
    """parts: list of dict(name, pos (n,3), nrm (n,3), uv (n,2), idx (m,3), color (r,g,b), rough, metal)"""
    bin_ = bytearray(); views = []; accs = []; meshes = []; nodes = []; mats = []
    def add(arr, target, comp, typ, minmax=False):
        a = np.ascontiguousarray(arr)
        while len(bin_) % 4: bin_.append(0)
        off = len(bin_); bin_.extend(a.tobytes())
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': a.nbytes, **({'target': target} if target else {})})
        acc = {'bufferView': len(views) - 1, 'componentType': comp, 'count': int(a.shape[0]), 'type': typ}
        if minmax: acc['min'] = a.min(0).tolist(); acc['max'] = a.max(0).tolist()
        accs.append(acc); return len(accs) - 1
    for p in parts:
        pos = p['pos'].astype(np.float32); nrm = p['nrm'].astype(np.float32); uv = p['uv'].astype(np.float32)
        idx = p['idx'].astype(np.uint32).reshape(-1)
        attrs = {'POSITION': add(pos, 34962, 5126, 'VEC3', True), 'NORMAL': add(nrm, 34962, 5126, 'VEC3'),
                 'TEXCOORD_0': add(uv, 34962, 5126, 'VEC2'), 'TEXCOORD_1': add(uv, 34962, 5126, 'VEC2')}
        ia = add(idx, 34963, 5125, 'SCALAR')
        mats.append({'name': p['name'], 'pbrMetallicRoughness': {'baseColorFactor': list(p['color']) + [1.0], 'metallicFactor': p.get('metal', 0.0), 'roughnessFactor': p.get('rough', 0.55)}})
        meshes.append({'name': p['name'], 'primitives': [{'attributes': attrs, 'indices': ia, 'material': len(mats) - 1}]})
        nodes.append({'name': p['name'], 'mesh': len(meshes) - 1})
    while len(bin_) % 4: bin_.append(0)
    gltf = {'asset': {'version': '2.0', 'generator': 'medialife build-spray-enhanced'}, 'scene': 0,
            'scenes': [{'name': name, 'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes, 'materials': mats,
            'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    open(path, 'wb').write(out)
