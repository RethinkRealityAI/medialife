# Image target for the 8th Wall (open-source engine) keychain experience: ONE target, the Bobo charm and
# the Eclipse can charm together as they sit on the keychain (no ring or chain). Same output format as
# @8thwall/image-target-cli (a json + a 480x640 greyscale "luminance" picture the engine extracts
# features from). layout.json says where that picture sits in keychain space (metres), so the AR page
# can place each charm frame (and its silhouette) exactly on its print.
import os, json, math, time
from PIL import Image
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = REPO + '/public/evade/keychain/src/'
OUT = REPO + '/public/evade/keychain-ar/image-targets/'
URL = '/evade/keychain-ar/image-targets/'
os.makedirs(OUT, exist_ok=True)
PPM = 14000                                   # charm pictures are 14 px per mm
# charm picture, hole position (m), tilt, charm centre below the hole (m): the rest layout of the 3D keychain model
CHARMS = [('charm-bobo.png', (-0.0070, -0.0643), 2 * math.asin(-0.096), -0.0288),
          ('charm-eclipse.png', (0.0070, -0.0850), 2 * math.asin(0.078), -0.0252)]
SIZE = (2400, 2400); ORG = (1200, 300)        # working canvas, keychain origin in it
art = Image.new('RGBA', SIZE, (0, 0, 0, 0))
for name, (tx, ty), rz, cy_ in CHARMS:
    im = Image.open(SRC + name).convert('RGBA').rotate(math.degrees(rz), resample=Image.BICUBIC, expand=True)
    cx = tx - math.sin(rz) * cy_; cy = ty + math.cos(rz) * cy_
    art.alpha_composite(im, (round(ORG[0] + cx * PPM - im.width / 2), round(ORG[1] - cy * PPM - im.height / 2)))
l, t, r, b = art.getbbox()
w, h = r - l, b - t
pad = 0.03 * max(w, h); w += 2 * pad; h += 2 * pad
if w / h < 0.75: w = h * 0.75
else: h = w / 0.75
mx, my = (l + r) / 2, (t + b) / 2
box = tuple(round(v) for v in (mx - w / 2, my - h / 2, mx + w / 2, my + h / 2))
bg = Image.new('RGBA', SIZE, (236, 238, 240, 255)); bg.alpha_composite(art)     # clear acrylic over a light surface
crop = bg.convert('RGB').crop(box)
W, H = crop.size
name = 'kc-both'
crop.resize((480, 640), Image.LANCZOS).convert('L').save(OUT + f'{name}_luminance.jpg', quality=92)
crop.resize((263, 350), Image.LANCZOS).save(OUT + f'{name}_thumbnail.jpg', quality=85)
crop.save(OUT + f'{name}.jpg', quality=92)                                       # full colour, for people
now = int(time.time() * 1000)
json.dump(dict(imagePath=URL + f'{name}_luminance.jpg', metadata=None, name=name, type='PLANAR',
               properties=dict(left=0, top=0, width=W, height=H, isRotated=False, originalWidth=W, originalHeight=H),
               resources=dict(luminanceImage=f'{name}_luminance.jpg', thumbnailImage=f'{name}_thumbnail.jpg'),
               created=now, updated=now), open(OUT + f'{name}.json', 'w'), indent=2)
json.dump(dict(target=name, widthM=W / PPM, heightM=H / PPM,
               centre=[((box[0] + box[2]) / 2 - ORG[0]) / PPM, -((box[1] + box[3]) / 2 - ORG[1]) / PPM]),
          open(OUT + 'layout.json', 'w'), indent=2)
print(name, (W, H), open(OUT + 'layout.json').read())
