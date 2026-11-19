# The black silhouette a character leaves behind on its charm, built into the model as a flat
# 'Silhouette' node: a unit quad showing public/evade/keychain/ar/silhouette-<name>.png, placed so
# that it coincides with the model in its flat starting pose (PopOut at t=0). The quad covers the
# whole charm image frame, so laying it over the charm print covers the printed art exactly; the
# model then starts at (frame matrix) x (Silhouette node matrix)^-1 and both line up.
import os, math, json
import bpy
import numpy as np
from PIL import Image
from scipy import ndimage
from mathutils import Vector, Euler

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
AR = REPO + '/public/evade/keychain/ar/'

def world_bounds(objs):
    """front-view bounds (x0, x1, z0, z1) of the evaluated meshes"""
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    pts = []
    for o in objs:
        e = o.evaluated_get(dg); me = e.to_mesh()
        co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co)
        M = np.array(e.matrix_world); co = co.reshape(-1, 3)
        pts.append(co @ M[:3, :3].T + M[:3, 3]); e.to_mesh_clear()
    p = np.concatenate(pts)
    return float(p[:, 0].min()), float(p[:, 0].max()), float(p[:, 2].min()), float(p[:, 2].max())

def add_silhouette(scene, name, bounds, depth=0.0):
    """name: 'bobo' | 'eclipse'. bounds: the model's front-view bounds in its flat start pose."""
    meta = json.load(open(AR + 'silhouettes.json'))[name]
    path = AR + f'silhouette-{name}.png'
    al = np.array(Image.open(path))[..., 3] > 128
    tilt = meta.get('tilt_deg', 0.0)
    best = (0.0, al)
    if abs(tilt) > 0.2:                      # the art leans: turn the frame so the shape stands upright
        cands = []
        for a in (tilt, -tilt):
            r = ndimage.rotate(al.astype(np.float32), a, reshape=False, order=1) > 0.5
            xs = np.nonzero(r)[1]; cands.append((xs.max() - xs.min(), a, r))
        _, a, r = min(cands, key=lambda c: c[0]); best = (a, r)
    ang, up = best
    ys, xs = np.nonzero(up); h, w = up.shape
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    x0, x1, z0, z1 = bounds
    k = (z1 - z0) / (by1 - by0)              # model units per art pixel
    cx = (x0 + x1) / 2 - ((bx0 + bx1) / 2 - w / 2) * k
    cz = z0 + (by1 - h / 2) * k
    me = bpy.data.meshes.new('Silhouette')
    me.from_pydata([(-0.5, 0, -0.5), (0.5, 0, -0.5), (0.5, 0, 0.5), (-0.5, 0, 0.5)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name='UVMap')
    for i, c in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]): uv.data[i].uv = c
    m = bpy.data.materials.new('Silhouette'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0, 0, 0, 1); b.inputs['Roughness'].default_value = 1.0
    b.inputs['Specular IOR Level'].default_value = 0.0
    t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(path)
    m.node_tree.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    try: m.surface_render_method = 'BLENDED'
    except Exception: pass
    m.use_backface_culling = False
    me.materials.append(m)
    ob = bpy.data.objects.new('Silhouette', me); scene.collection.objects.link(ob)
    ob.location = (cx, depth, cz); ob.scale = (w * k, 1, h * k)
    # scipy turned the picture by `ang` (counter-clockwise on screen, y down) to stand it upright,
    # so the frame itself is turned the same way around the view axis
    ob.rotation_euler = Euler((0, -math.radians(ang), 0))
    print('SILHOUETTE', name, 'units/px', round(k, 6), 'centre', round(cx, 4), round(cz, 4), 'size', round(w * k, 4), round(h * k, 4), 'turn', ang)
    return ob
