# Collector Hub: EVADE room ("Bobo's Hideout")

Bobo lives inside a giant cut-away Eclipse can that floats over a Cola Run spawn pad. The room is built to be walked around in AR. From the open side you see a two-level home, with a lounge downstairs and a gaming loft upstairs. From the closed side you see the can's label.

The EVADE room for the MEDIALIFE Collector Hub is built by script, so anyone can rebuild it in any Blender 4.2+ without the original .blend file.

```
python3 art/collector-hub/make_textures.py                     # screen, night sky, posters -> tex/
blender -b --python art/collector-hub/build_room.py -- \
  --glb public/hub/evade/room.glb                               # web asset
  [--render out.png --shot hero|back|side|top|case|loft|lounge --samples 128 --res 1600]
  [--blend out.blend]
```

- **Inputs.** Bobo (`CatBobo_Anims.glb`) and the Cola collectible (`Cola_Collectible.glb`) are read from `/mnt/project-files/Evade/` by default. You can override their paths with `BOBO_GLB` and `COLA_GLB`. The keychain comes from `public/evade/keychain/evade-keychain.glb`.
- **EVADE art rule.** Posters, the monitor screen and the window sky are composited from EVADE's own art with Pillow. All geometry is procedural. No image-to-image or image-to-3D generation is used on EVADE assets.
- **Interaction targets.** Every node whose name starts with `hub_` is something the web room makes tappable: `hub_bobo`, `hub_computer`, `hub_alert_light`, `hub_cola_lamp`, `hub_keychain_case`, `hub_keychain`, `hub_shelf`, `hub_trophy_colarun`, `hub_snowglobe_sf`, `hub_slot_tee`, `hub_slot_plush`, `hub_poster_*`, `hub_window`, `hub_rug`, `hub_cat_bed`, `hub_sign_evade`, `hub_ladder`, `hub_pull_tab`, `hub_spawn_pad` and `hub_orbit_cans` (the cans that spin around the house).
- **Size.** The GLB is about 4.3 MB. Its textures are WebP and total under 1 MB; the rest is geometry. The web build will compress the geometry with meshopt.
- **Animations.** Bobo's clips (Sit, Chill, Excited, Sleep, Spin, Walk) are exported with the GLB.
