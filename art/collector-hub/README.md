# Collector Hub: EVADE room

The EVADE room for the MEDIALIFE Collector Hub is built by script, so anyone can rebuild it in any Blender 4.2+ without the original .blend file.

```
python3 art/collector-hub/make_textures.py                     # screen, night sky, posters -> tex/
blender -b --python art/collector-hub/build_room.py -- \
  --glb public/hub/evade/room.glb                               # web asset
  [--render out.png --shot hero|case|desk|cozy --samples 128 --res 1600]
  [--blend out.blend]
```

- **Inputs.** Bobo (`CatBobo_Anims.glb`) and the Cola collectible (`Cola_Collectible.glb`) are read from `/mnt/project-files/Evade/` by default. You can override their paths with `BOBO_GLB` and `COLA_GLB`. The keychain comes from `public/evade/keychain/evade-keychain.glb`.
- **EVADE art rule.** Posters, the monitor screen and the window sky are composited from EVADE's own art with Pillow. All geometry is procedural. No image-to-image or image-to-3D generation is used on EVADE assets.
- **Interaction targets.** Every node whose name starts with `hub_` is something the web room makes tappable: `hub_bobo`, `hub_computer`, `hub_alert_light`, `hub_cola_lamp`, `hub_keychain_case`, `hub_keychain`, `hub_shelf`, `hub_trophy_colarun`, `hub_snowglobe_sf`, `hub_slot_tee`, `hub_slot_plush`, `hub_poster_*`, `hub_window`, `hub_rug`, `hub_cat_bed` and `hub_sign_evade`.
- **Animations.** Bobo's clips (Sit, Chill, Excited, Sleep, Spin, Walk) are exported with the GLB.
