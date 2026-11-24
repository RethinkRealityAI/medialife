# Procedural paintable props for Spray Bobo Enhanced (no source art, nothing generative): blank toy figure, skate
# deck, art block, spray can. Every prop gets one non-overlapping UV atlas (xatlas) over all its parts, written to
# TEXCOORD_0 and TEXCOORD_1 (the page paints into uv1). Units: metres, standing on y = 0, facing +z.
#   python3 props.py ../../public/evade/spray-bobo-enhanced/models
import sys, os
import numpy as np, trimesh, xatlas
from glbwrite import write_glb

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'

def smooth(m):
    m = m.copy(); m.merge_vertices(); return m

def ellipsoid(r, c, sub=4):
    m = trimesh.creation.icosphere(subdivisions=sub); m.apply_scale(r); m.apply_translation(c); return m

def capsule(rad, h, c, axis='y', sec=28):
    m = trimesh.creation.capsule(height=h, radius=rad, count=[sec, sec])   # along z
    if axis == 'y': m.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    if axis == 'x': m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    m.apply_translation(c); return m

def cyl(rad, h, c, axis='y', sec=40):
    m = trimesh.creation.cylinder(radius=rad, height=h, sections=sec)
    if axis == 'y': m.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    if axis == 'x': m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    m.apply_translation(c); return m

def rounded_box(size, r, c, sub=5):
    m = trimesh.creation.box(extents=[1, 1, 1])
    for _ in range(sub): m = m.subdivide()
    v = m.vertices * np.array(size); h = np.array(size) / 2 - r
    cl = np.clip(v, -h, h); d = v - cl; n = np.linalg.norm(d, axis=1, keepdims=True); n[n == 0] = 1
    m.vertices = cl + d / n * r; m.apply_translation(c); m.merge_vertices(); return m

def lathe(profile, sec=56):
    """profile: [(radius, y)] from bottom centre to top centre"""
    prof = np.array(profile, float); n = len(prof); a = np.linspace(0, 2 * np.pi, sec, endpoint=False)
    V = []; F = []
    for (r, y) in prof:
        for t in a: V.append([r * np.sin(t), y, r * np.cos(t)])
    for i in range(n - 1):
        for j in range(sec):
            p = i * sec + j; q = i * sec + (j + 1) % sec; P = p + sec; Q = q + sec
            F += [[p, q, Q], [p, Q, P]]
    m = trimesh.Trimesh(np.array(V), np.array(F), process=True); m.merge_vertices(); m.fix_normals(); return m

def atlas_parts(parts, res=1024):
    at = xatlas.Atlas()
    for p in parts: at.add_mesh(p['mesh'].vertices.astype(np.float32), p['mesh'].faces.astype(np.uint32), p['mesh'].vertex_normals.astype(np.float32))
    co = xatlas.ChartOptions(); co.max_iterations = 2
    po = xatlas.PackOptions(); po.resolution = res; po.padding = 6; po.bilinear = True; po.rotate_charts = True
    at.generate(co, po)
    out = []
    for i, p in enumerate(parts):
        vm, idx, uv = at[i]; m = p['mesh']
        out.append(dict(name=p['name'], pos=m.vertices[vm], nrm=m.vertex_normals[vm], uv=uv, idx=idx, color=p['color'], rough=p.get('rough', 0.55), metal=p.get('metal', 0)))
    print('  atlas', at.width, 'x', at.height, 'util %.2f' % at.utilization, 'uv range', min(o['uv'].min() for o in out), max(o['uv'].max() for o in out))
    return out

def hexc(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def lin(c): return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)   # glTF colours are linear
W = lin(hexc('#f2f0ec')); G = lin(hexc('#2a2d33')); S = lin(hexc('#b9bec6'))

def toy():
    # a blank designer-toy figure, ~32 cm: big head, two round ears, little body, stubby arms and legs (all white vinyl)
    P = []
    P.append(dict(name='Head', mesh=ellipsoid([0.105, 0.088, 0.092], [0, 0.235, 0], 4), color=W, rough=0.42))
    for s in (-1, 1):
        e = ellipsoid([0.034, 0.042, 0.022], [0, 0, 0], 3)
        e.apply_transform(trimesh.transformations.rotation_matrix(-s * 0.35, [0, 0, 1])); e.apply_translation([s * 0.072, 0.318, -0.01])
        P.append(dict(name='Ear ' + ('left' if s < 0 else 'right'), mesh=e, color=W, rough=0.42))
    P.append(dict(name='Body', mesh=ellipsoid([0.07, 0.085, 0.058], [0, 0.11, 0], 4), color=W, rough=0.42))
    for s in (-1, 1):
        a = capsule(0.022, 0.06, [0, 0, 0], 'y', 24); a.apply_transform(trimesh.transformations.rotation_matrix(s * 0.5, [0, 0, 1])); a.apply_translation([s * 0.085, 0.115, 0.004])
        P.append(dict(name='Arm ' + ('left' if s < 0 else 'right'), mesh=a, color=W, rough=0.42))
        P.append(dict(name='Leg ' + ('left' if s < 0 else 'right'), mesh=capsule(0.028, 0.03, [s * 0.034, 0.03, 0.002], 'y', 24), color=W, rough=0.42))
    return P

def deck():
    # a blank skateboard on its wheels: 80 x 20.5 cm deck with kicktails, grey trucks, white wheels
    m = capsule(0.1025, 0.8 - 0.205, [0, 0, 0], 'x', 40)
    v = m.vertices.copy(); v[:, 1] *= 0.011 / 0.1025
    ax = np.abs(v[:, 0]); k = np.clip(ax - 0.27, 0, None); v[:, 1] += k * np.tan(np.radians(19)) + k * k * 0.6
    m.vertices = v; m.apply_translation([0, 0.093, 0]); m.merge_vertices()
    P = [dict(name='Deck', mesh=m, color=W, rough=0.6)]
    for s in (-1, 1):
        x = s * 0.22
        P.append(dict(name='Truck ' + ('back' if s < 0 else 'front'), mesh=rounded_box([0.05, 0.03, 0.16], 0.008, [x, 0.066, 0], 3), color=S, rough=0.35, metal=0.8))
        for z in (-1, 1):
            P.append(dict(name='Wheel', mesh=cyl(0.027, 0.034, [x, 0.027, z * 0.095], 'z', 36), color=W, rough=0.5))
    for i, p in enumerate(P):
        if p['name'] == 'Wheel': p['name'] = 'Wheel %d' % i
    return P

def block():
    # an art block: a 36 cm rounded cube on a slim plinth
    return [dict(name='Block', mesh=rounded_box([0.36, 0.36, 0.36], 0.025, [0, 0.215, 0], 4), color=W, rough=0.5),
            dict(name='Plinth', mesh=rounded_box([0.42, 0.035, 0.42], 0.01, [0, 0.0175, 0], 3), color=G, rough=0.7)]

def can():
    # a generic aerosol can, 1 m tall (a sculpture): body, shoulder, cap, nozzle
    body = lathe([(0, 0), (0.15, 0), (0.16, 0.01), (0.165, 0.03), (0.165, 0.7), (0.162, 0.72), (0, 0.72)])
    sh = lathe([(0, 0.715), (0.162, 0.715), (0.15, 0.77), (0.12, 0.8), (0.085, 0.815), (0.075, 0.83), (0, 0.83)])
    cap = lathe([(0, 0.82), (0.115, 0.82), (0.12, 0.83), (0.12, 0.95), (0.1, 0.975), (0, 0.98)])
    noz = rounded_box([0.05, 0.045, 0.05], 0.01, [0, 1.0, 0.03], 3)
    return [dict(name='Can', mesh=body, color=W, rough=0.35, metal=0.2), dict(name='Shoulder', mesh=sh, color=S, rough=0.25, metal=0.9),
            dict(name='Cap', mesh=cap, color=W, rough=0.45), dict(name='Nozzle', mesh=noz, color=G, rough=0.5)]

for nm, fn in [('toy', toy), ('deck', deck), ('block', block), ('spraycan', can)]:
    print(nm); parts = atlas_parts(fn())
    p = os.path.join(OUT, nm + '.glb'); write_glb(p, parts, nm); print('  ', p, os.path.getsize(p) // 1024, 'KB', sum(len(x['idx']) for x in parts), 'tris')
