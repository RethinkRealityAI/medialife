# Shared Blender helpers: flat polygons (with holes) -> extruded, bevelled meshes; Principled materials.
import bpy, math

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, rgb, rough=0.3, metal=0.0, coat=0.0, emit=None):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*srgb_to_lin(rgb), 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.05
    if emit:
        p.inputs['Emission Color'].default_value = (*srgb_to_lin(emit[0]), 1)
        p.inputs['Emission Strength'].default_value = emit[1]
    return m

def srgb_to_lin(rgb):
    out = []
    for c in rgb:
        c = c / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out

def extrude_polys(name, polys, z0, z1, bevel=0.0, material=None, scale=1.0, bevel_res=2):
    """polys: [{'ext': [[x,y]..], 'holes': [[[x,y]..]..]}] in mm. Solid from z0 to z1 (mm)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    depth = (z1 - z0) / 2.0
    b = min(bevel, depth * 0.95)
    cu.extrude = max(depth - b, 0.0001)
    cu.bevel_depth = b; cu.bevel_resolution = bevel_res if b > 0 else 0
    cu.offset = 0.0
    for p in polys:
        for ring in [p['ext']] + p.get('holes', []):
            if len(ring) < 3: continue
            sp = cu.splines.new('POLY'); sp.points.add(len(ring) - 1)
            for i, (x, y) in enumerate(ring): sp.points[i].co = (x * scale, y * scale, 0, 1)
            sp.use_cyclic_u = True
    ob = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(ob)
    ob.location.z = (z0 + z1) / 2.0 * scale
    if material: cu.materials.append(material)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.active_object
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005 * scale)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob

def join(objs, name):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object; ob.name = name; ob.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)   # parts' own z offsets into the mesh
    return ob

def paint_atlas(ob, margin=0.004):
    """one non-overlapping UV layout over the whole object (the spray painter's paintUv)."""
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    while ob.data.uv_layers: ob.data.uv_layers.remove(ob.data.uv_layers[0])
    ob.data.uv_layers.new(name='paint')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=1.0, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')

def shade_auto(ob, angle=40):
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    # smooth shading + sharp edges above `angle` (glTF splits normals there; no modifier needed)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='EDGE'); bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(angle)); bpy.ops.mesh.mark_sharp()
    bpy.ops.object.mode_set(mode='OBJECT')
