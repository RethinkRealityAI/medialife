"""Rasterise a Meshy GLB's UV layout: for every texel, the 3D position and normal it shows (npz cache).
Usage: python texel_map.py in.glb out.npz [size]"""
import sys, numpy as np, trimesh
src, out = sys.argv[1], sys.argv[2]; S = int(sys.argv[3]) if len(sys.argv) > 3 else 2048
sc = trimesh.load(src); g = list(sc.geometry.values())[0]
# bake the node transform so positions match what three.js shows
T = sc.graph.get(sc.graph.nodes_geometry[0])[0]; g = g.copy(); g.apply_transform(T)
V, F, N, UV = g.vertices, g.faces, g.vertex_normals, g.visual.uv
pos = np.zeros((S, S, 3), np.float32); nrm = np.zeros((S, S, 3), np.float32); mask = np.zeros((S, S), bool)
P = np.stack([UV[:, 0] * S - 0.5, (1 - UV[:, 1]) * S - 0.5], 1)   # pixel centres; image row 0 = v 1
for f in F:
    p = P[f]; x0, y0 = np.floor(p.min(0)).astype(int); x1, y1 = np.ceil(p.max(0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, S - 1), min(y1, S - 1)
    if x1 < x0 or y1 < y0: continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
    a, b, c = p; d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(d) < 1e-12: continue
    w0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
    w1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
    w2 = 1 - w0 - w1; e = -0.02
    ins = (w0 >= e) & (w1 >= e) & (w2 >= e)
    if not ins.any(): continue
    W = np.stack([w0[ins], w1[ins], w2[ins]], 1)
    yy, xx = ys[ins], xs[ins]
    pos[yy, xx] = W @ V[f]; nrm[yy, xx] = W @ N[f]; mask[yy, xx] = True
nrm /= np.maximum(np.linalg.norm(nrm, axis=2, keepdims=True), 1e-6)
tex = np.asarray(g.visual.material.baseColorTexture.convert('RGB').resize((S, S)))
np.savez_compressed(out, pos=pos, nrm=nrm, mask=mask, tex=tex)
print('texels', mask.sum(), 'bounds', V.min(0).round(3), V.max(0).round(3))
