# Cycles preview of a built .blend: python render_preview.py -- in.blend out.png [angle_deg] [size]
import sys, math, bpy, mathutils
a = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=a[0])
ang = float(a[2]) if len(a) > 2 else 20; size = int(a[3]) if len(a) > 3 else 800
sc = bpy.context.scene
obs = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ mathutils.Vector(c) for o in obs for c in o.bound_box]
mn = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); mx = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
ctr = (mn + mx) / 2; rad = (mx - mn).length / 2
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.lens = 70
d = rad * 3.6
cam.location = ctr + mathutils.Vector((math.sin(math.radians(ang)) * d, -math.cos(math.radians(ang)) * d, d * 0.18))
cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
for i, (loc, e) in enumerate([((-1, -2, 2), 400), ((2, -1, 1.5), 250), ((0, 2, 2), 200)]):
    l = bpy.data.objects.new(f'l{i}', bpy.data.lights.new(f'l{i}', 'AREA')); l.data.energy = e * rad * rad * 4; l.data.size = rad * 2
    l.location = ctr + mathutils.Vector(loc) * rad * 3; l.rotation_euler = (ctr - l.location).to_track_quat('-Z', 'Y').to_euler(); sc.collection.objects.link(l)
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.25, 0.42, 0.62, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.5
sc.view_settings.view_transform = 'Standard'; sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.device = 'CPU'
sc.render.resolution_x = sc.render.resolution_y = size; sc.render.film_transparent = False
sc.render.filepath = a[1]; bpy.ops.render.render(write_still=True)
