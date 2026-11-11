# Image targets for the 8th Wall (open-source engine) keychain experience. kc-both: the Bobo cat charm and
# the Eclipse can charm together as they sit on the keychain (no ring or chain). kc-old: the earlier design. Same output format as
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
LAYOUT = {name: dict(widthM=W / PPM, heightM=H / PPM, silhouettes=True, charms={})}
ctr = (((box[0] + box[2]) / 2 - ORG[0]) / PPM, -((box[1] + box[3]) / 2 - ORG[1]) / PPM)
for key, (_, (tx, ty), rz, cy_) in zip(('bobo', 'can'), CHARMS):      # charm frame centres relative to the picture centre
    LAYOUT[name]['charms'][key] = dict(x=tx - math.sin(rz) * cy_ - ctr[0], y=ty + math.cos(rz) * cy_ - ctr[1], rz=rz)

# ---- the earlier keychain design (blocky Bobo with his arm up + tilted Eclipse can), from the product photo.
# Only the Bobo charm is the target: both designs carry the same Eclipse can art, so a target with the can in
# it also matches the other keychain. (kc-both still false-matches the old keychain through the can; the AR
# page lets kc-old win whenever it is seen.) The hand, clasp and can are painted out. Sizes are estimated
# from the can charm (about 55 mm tall); only proportions matter to the AR page.
from PIL import ImageDraw, ImageFilter
photo = Image.open(REPO + '/public/merch/keychain-hand.webp').convert('RGB')
BG = (236, 238, 240)
mask = Image.new('L', photo.size, 0); d = ImageDraw.Draw(mask)
d.polygon([(232, 385), (262, 345), (312, 335), (388, 372), (392, 430), (470, 418), (512, 470), (520, 560), (572, 690),
           (590, 905), (560, 958), (290, 962), (262, 905), (300, 650), (335, 560), (250, 425)], fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(4))
flat = Image.composite(photo, Image.new('RGB', photo.size, BG), mask)
X0, Y0, OW, OH = 164, 318, 495, 660; PADT = 0
old = flat.crop((X0, Y0, X0 + OW, Y0 + OH))
oname = 'kc-old'; OPPM = 8500
# the photo is soft, so the tracked picture is sharpened to give the engine corners to hold on to
old.resize((480, 640), Image.LANCZOS).convert('L').filter(ImageFilter.UnsharpMask(radius=2.5, percent=220, threshold=2)).save(OUT + f'{oname}_luminance.jpg', quality=95)
old.resize((263, 350), Image.LANCZOS).save(OUT + f'{oname}_thumbnail.jpg', quality=85)
old.save(OUT + f'{oname}.jpg', quality=92)
json.dump(dict(imagePath=URL + f'{oname}_luminance.jpg', metadata=None, name=oname, type='PLANAR',
               properties=dict(left=0, top=0, width=OW, height=OH, isRotated=False, originalWidth=OW, originalHeight=OH),
               resources=dict(luminanceImage=f'{oname}_luminance.jpg', thumbnailImage=f'{oname}_thumbnail.jpg'),
               created=now, updated=now), open(OUT + f'{oname}.json', 'w'), indent=2)
def om(px, py): return ((px - X0 - OW / 2) / OPPM, -((py - Y0 + PADT) - OH / 2) / OPPM)
bx, by = om(420, 660); cx2, cy2 = om(712, 640)
LAYOUT[oname] = dict(widthM=OW / OPPM, heightM=OH / OPPM, silhouettes=False,
                     charms=dict(bobo=dict(x=bx, y=by, rz=0), can=dict(x=cx2, y=cy2, rz=0.26)))
json.dump(dict(targets=LAYOUT), open(OUT + 'layout.json', 'w'), indent=2)
print(open(OUT + 'layout.json').read())
