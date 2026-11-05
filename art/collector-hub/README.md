# Collector Hub: EVADE room ("Bobo's Hideout")

Bobo lives inside a giant cut-away Eclipse can that floats over a Cola Run spawn pad. The room is built to be walked around in AR. From the open side you see a two-level home, with a lounge downstairs and a gaming loft upstairs. From the closed side you see the can's label.

The EVADE room for the MEDIALIFE Collector Hub is built by script, so anyone can rebuild it in any Blender 4.2+ without the original .blend file.

```
python3 art/collector-hub/make_textures.py                     # screen, night sky, posters -> tex/
blender -b --python art/collector-hub/build_room.py -- \
  --glb public/hub/evade/room.glb                               # web asset
  [--render out.png --shot hero|back|side|top|portal|case|loft|lounge --samples 128 --res 1600]
  [--blend out.blend]
```

- **Inputs.** Bobo (`CatBobo_Anims.glb`) and the Cola collectible (`Cola_Collectible.glb`) are read from `/mnt/project-files/Evade/` by default. You can override their paths with `BOBO_GLB` and `COLA_GLB`. The keychain comes from `public/evade/keychain/evade-keychain.glb`.
- **EVADE art rule.** Posters, the monitor screen and the window sky are composited from EVADE's own art with Pillow. All geometry is procedural. No image-to-image or image-to-3D generation is used on EVADE assets.
- **Interaction targets.** Every node whose name starts with `hub_` is something the web room makes tappable: `hub_bobo`, `hub_computer`, `hub_alert_light`, `hub_cola_lamp`, `hub_keychain_case`, `hub_keychain`, `hub_shelf`, `hub_trophy_colarun`, `hub_snowglobe_sf`, `hub_slot_tee`, `hub_slot_plush`, `hub_poster_*`, `hub_window`, `hub_rug`, `hub_cat_bed`, `hub_sign_evade`, `hub_ladder`, `hub_pull_tab`, `hub_spawn_pad`, `hub_portal` (the "Go home" portal) and `hub_orbit_cans` (the cans that spin around the house). `Portal_Swirl`, `Step_0`…`Step_3` and `Fizz_*` are animated by name.
- **Size.** The GLB is about 4.7 MB. Its textures are WebP and total under 1 MB; the rest is geometry. Meshopt compression is the next size step (the lab page already loads meshopt files).
- **Animations.** Bobo's clips (Sit, Chill, Excited, Sleep, Spin, Walk) are exported with the GLB.

## Web test page

`public/labs/collector-hub/` loads the GLB in plain three.js (listed on `/labs/`). On open, only the portal and its pad are solid and the room is a faint wireframe. Tapping **Go home** walks Bobo out of the portal, up the floating steps and onto his bed while the room builds in: a cyan wireframe sweeps out from the portal and the textured surfaces fill in behind it. The effect is a material patch (`onBeforeCompile`) on every room material plus `EdgesGeometry` lines, all driven by shared uniforms, so it costs nothing once the room is built. `?skip=1` (or reduced motion) opens straight into the finished room.
