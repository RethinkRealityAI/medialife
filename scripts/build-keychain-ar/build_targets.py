# Image targets for the 8th Wall (open-source engine) keychain experience. kc-both: the Bobo cat charm and
# the Eclipse can charm together as they sit on the keychain (no ring or chain). kc-bobo / kc-can: each charm on its own. kc-can is cut from a phone photo of the real charm. kc-old: the earlier design's Bobo charm. Same output format as
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

# ---- each charm on its own (people may carry only one of the two): the whole charm picture, padded to 3:4
def write_target(tname, img, lay):
    w_, h_ = img.size
    img.resize((480, 640), Image.LANCZOS).convert('L').save(OUT + f'{tname}_luminance.jpg', quality=92)
    img.resize((263, 350), Image.LANCZOS).save(OUT + f'{tname}_thumbnail.jpg', quality=85)
    img.save(OUT + f'{tname}.jpg', quality=92)
    json.dump(dict(imagePath=URL + f'{tname}_luminance.jpg', metadata=None, name=tname, type='PLANAR',
                   properties=dict(left=0, top=0, width=w_, height=h_, isRotated=False, originalWidth=w_, originalHeight=h_),
                   resources=dict(luminanceImage=f'{tname}_luminance.jpg', thumbnailImage=f'{tname}_thumbnail.jpg'),
                   created=now, updated=now), open(OUT + f'{tname}.json', 'w'), indent=2)
    LAYOUT[tname] = lay
for key, tname, (fname, _, _, _) in (('bobo', 'kc-bobo', CHARMS[0]), ('can', 'kc-can', CHARMS[1])):
    im = Image.open(SRC + fname).convert('RGBA')
    cw, chh = im.size
    tw, th = (cw, round(cw / 0.75)) if cw / chh > 0.75 else (round(chh * 0.75), chh)
    tw, th = round(tw * 1.04), round(th * 1.04)
    canvas = Image.new('RGBA', (tw, th), (236, 238, 240, 255)); canvas.alpha_composite(im, ((tw - cw) // 2, (th - chh) // 2))
    if key == 'can':
        # The can is tracked from a phone photo of the real acrylic charm instead (below): it holds better on
        # the real thing than the flat art. The art picture stays as the thumbnail on the instructions screen.
        canvas.convert('RGB').resize((263, 350), Image.LANCZOS).save(OUT + 'how-can.jpg', quality=85)
        ART_CAN = (tw / PPM, th / PPM, cw / PPM, chh / PPM)   # picture and acrylic piece, metres
        tname = 'kc-can-art'                                  # the art stays as a second picture of the same charm
    write_target(tname, canvas.convert('RGB'), dict(widthM=tw / PPM, heightM=th / PPM, silhouettes=True, charms={key: dict(x=0, y=0, rz=0)}))

# ---- camera guide: the two silhouettes together, in the same frame as kc-both
SIL = REPO + '/public/evade/keychain/ar/'
gb = Image.new('RGBA', SIZE, (0, 0, 0, 0))
for (fname, (tx, ty), rz, cy_), sn in zip(CHARMS, ('silhouette-bobo.png', 'silhouette-eclipse.png')):
    im = Image.open(SIL + sn).convert('RGBA').rotate(math.degrees(rz), resample=Image.BICUBIC, expand=True)
    cx = tx - math.sin(rz) * cy_; cy = ty + math.cos(rz) * cy_
    gb.alpha_composite(im, (round(ORG[0] + cx * PPM - im.width / 2), round(ORG[1] - cy * PPM - im.height / 2)))
gb.crop(box).resize((503, 670), Image.LANCZOS).save(OUT + 'guide-both.png')

# ---- the earlier keychain design (blocky Bobo with his arm up + Eclipse can). Cut from a phone photo of the
# real charm (src/old-bobo.png: Dapo's sharp photo of the Roblox Bobo charm, 2026-11-11, clear acrylic included,
# masked out and centred 3:4 with a 4% margin). One
# target per charm, like the cat keychain's single-charm targets. No silhouettes: they are cut for the cat art.
# Its silhouette and 3D model come from build_old_bobo.py, in this same picture frame.
from PIL import ImageFilter
HERE_SRC = os.path.dirname(os.path.abspath(__file__)) + '/src/'
OPPM = 1440 / 0.078        # the acrylic piece is about 75 mm tall (measured against the 55 mm can charm), framed 3:4 with a 4% margin
for key, tname, fname in (('bobo', 'kc-old', 'old-bobo.png'),):
    im = Image.open(HERE_SRC + fname).convert('RGB')
    write_target(tname, im, dict(widthM=im.width / OPPM, heightM=im.height / OPPM, silhouettes=True, charms={key: dict(x=0, y=0, rz=0)}))
    # a light sharpen gives the engine crisper corners to hold on to
    Image.open(OUT + f'{tname}_luminance.jpg').filter(ImageFilter.UnsharpMask(radius=2, percent=90, threshold=2)).save(OUT + f'{tname}_luminance.jpg', quality=95)

# ---- the Eclipse can charm, for both keychain designs (the can is the same on both): cut from Dapo's phone
# photo of the real charm, clear acrylic edge and tab included (src/can-photo.png: the acrylic piece centred
# in a 3:4 picture with a 4% margin, the same framing as the art picture). So it maps onto the art's charm
# frame directly: the acrylic piece is as tall in metres as the art's.
im = Image.open(HERE_SRC + 'can-photo.png').convert('RGB')
im = im.resize((1200, 1600), Image.LANCZOS)
hM = ART_CAN[3] * 1.04
write_target('kc-can', im, dict(widthM=hM * 0.75, heightM=hM, silhouettes=True, charms={'can': dict(x=0, y=0, rz=0)}))
Image.open(OUT + 'kc-can_luminance.jpg').filter(ImageFilter.UnsharpMask(radius=2, percent=140, threshold=2)).save(OUT + 'kc-can_luminance.jpg', quality=95)
# ---- the two charms from the product shot (cut_product_charms.py): cat Bobo and the back of the can (the QR
# side). Both are seen from the side whose outline is the artwork's mirrored, so their pictures sit in the
# artwork's own picture frame mirrored ("mirror" in layout.json flips the charm frame, and the 3D character
# with it, so it lines up with its print). They replace the flat cat artwork as kc-bobo.
for tname, fname, key in (('kc-bobo', 'bobo-product.png', 'bobo'), ('kc-can-back', 'can-back.png', 'can')):
    im = Image.open(HERE_SRC + fname).convert('RGB')
    base = LAYOUT['kc-bobo' if key == 'bobo' else 'kc-can-art']
    write_target(tname, im, dict(widthM=base['widthM'], heightM=base['heightM'], silhouettes=True, charms={key: dict(x=0, y=0, rz=0, mirror=True)}))
    Image.open(OUT + f'{tname}_luminance.jpg').filter(ImageFilter.UnsharpMask(radius=2, percent=90, threshold=2)).save(OUT + f'{tname}_luminance.jpg', quality=95)

# ---- portal masks: the whole acrylic piece of each charm picture (outlines traced by cut_can_photo.py and
# cut_product_charms.py), in that picture's frame grown by MASK_PAD so the glow round it has room
from PIL import ImageDraw
MASK_PAD = 1.3
def portal_mask(tname, outline_file):
    lay = LAYOUT[tname]; MH = 800; MW = round(MH * lay['widthM'] / lay['heightM'])
    pts = json.load(open(HERE_SRC + outline_file))['points']
    SS = 4; big = Image.new('L', (MW * SS, MH * SS), 0)
    ImageDraw.Draw(big).polygon([(((x - 0.5) / MASK_PAD + 0.5) * MW * SS, ((y - 0.5) / MASK_PAD + 0.5) * MH * SS) for x, y in pts], fill=255)
    m = Image.new('RGBA', (MW, MH), (255, 255, 255, 0)); m.putalpha(big.resize((MW, MH), Image.LANCZOS)); m.save(OUT + f'{tname}-mask.png', optimize=True)
    lay['mask'] = dict(src=f'{tname}-mask.png', widthM=lay['widthM'] * MASK_PAD, heightM=lay['heightM'] * MASK_PAD)
portal_mask('kc-can', 'can-outline.json')
portal_mask('kc-can-back', 'can-back-outline.json')
portal_mask('kc-bobo', 'bobo-product-outline.json')
json.dump(dict(targets=LAYOUT), open(OUT + 'layout.json', 'w'), indent=2)
print(open(OUT + 'layout.json').read())
