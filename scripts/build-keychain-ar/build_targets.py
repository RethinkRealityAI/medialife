# Image targets for the 8th Wall (open-source engine) keychain experience. Same output format as
# @8thwall/image-target-cli (a json per target + a 480x640 greyscale "luminance" picture the engine
# extracts features from), written straight from the charm pictures so the crop numbers are exact:
# the AR page uses them to place the full charm frame (and the silhouette) around the tracked crop.
import os, json, time
from PIL import Image
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = REPO + '/public/evade/keychain/src/'
OUT = REPO + '/public/evade/keychain-ar/image-targets/'
URL = '/evade/keychain-ar/image-targets/'
os.makedirs(OUT, exist_ok=True)
# The Bobo crop is the head and chest: at rest the can charm hangs over Bobo's lower right, so that part is left out.
# name, charm picture, crop (left, top, width, height) in charm pixels: 3:4, on the busiest part of the art
TARGETS = [('kc-bobo', 'charm-bobo.png', (125, 70, 480, 640)),
           ('kc-can', 'charm-eclipse.png', (52, 230, 330, 440))]
for name, src, (l, t, w, h) in TARGETS:
    im = Image.open(SRC + src).convert('RGBA')
    bg = Image.new('RGBA', im.size, (236, 238, 240, 255))      # clear acrylic over a light surface
    bg.alpha_composite(im)
    crop = bg.convert('RGB').crop((l, t, l + w, t + h))
    crop.resize((480, 640), Image.LANCZOS).convert('L').save(OUT + f'{name}_luminance.jpg', quality=92)
    crop.resize((263, 350), Image.LANCZOS).save(OUT + f'{name}_thumbnail.jpg', quality=85)
    data = dict(imagePath=URL + f'{name}_luminance.jpg', metadata=None, name=name, type='PLANAR',
                properties=dict(left=l, top=t, width=w, height=h, isRotated=False,
                                originalWidth=im.size[0], originalHeight=im.size[1]),
                resources=dict(luminanceImage=f'{name}_luminance.jpg', thumbnailImage=f'{name}_thumbnail.jpg'),
                created=int(time.time() * 1000), updated=int(time.time() * 1000))
    json.dump(data, open(OUT + f'{name}.json', 'w'), indent=2)
    print(name, im.size, (l, t, w, h))
