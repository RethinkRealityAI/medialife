# Builds Bobo's texture atlas from the supplied keychain art (no generative tools).
import os
WORK = os.environ.get('KC_WORK', '/tmp/keychain-ar'); os.makedirs(WORK, exist_ok=True)
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
SRC=REPO + '/public/evade/keychain/src/cat_art.png'
OUT=WORK + '/bobo_atlas.png'
art=np.array(Image.open(SRC).convert('RGBA')).astype(np.float32)
H,W=art.shape[:2]  # 1032 x 944
rgb=art[...,:3]; a=art[...,3]
mx=rgb.max(-1)
known=(a>200)&(mx>125)
# protect eyes, nose, mouth (their darks are intentional)
prot=np.zeros_like(known)
for x0,y0,x1,y1 in [(385,270,470,350),(608,268,695,350),(470,340,612,405),(520,312,555,335)]:
    prot[y0:y1,x0:x1]=True
known|=prot&(a>200)
def inpaint(img,known):
    idx=ndimage.distance_transform_edt(~known,return_distances=False,return_indices=True)
    return img[idx[0],idx[1]]
L0=inpaint(rgb,known)
outside=ndimage.binary_erosion(a>100,iterations=2)==False
outside=ndimage.binary_dilation(outside,iterations=0) if False else outside
L0[outside & ~known]=np.array([255,216,150],np.float32)
# skin layer: remove blue accessories (visor, band, collar, bell) -> fur
r,g,b=rgb[...,0],rgb[...,1],rgb[...,2]
blue=((b>r+12)|((b>=r-2)&(mx>200)))&(a>0)
blue=ndimage.binary_dilation(blue,iterations=4)
# but keep eye highlights etc: they are white/blue-ish only inside prot boxes
blue&=~prot
L1=inpaint(rgb,known&~blue)
L1[outside & ~known]=np.array([255,216,150],np.float32)
_vis=blue.copy(); _vis[300:]=False
L1[_vis]=np.array([255,216,150],np.float32)
# forehead stripes where the visor was
_im=Image.fromarray(L1.astype(np.uint8)); _d=ImageDraw.Draw(_im)
for _x in (470,540,610):
    _d.polygon([(_x-9,60),(_x+9,60),(_x+3,190),(_x-3,190)],fill=(242,154,99))
L1=np.array(_im).astype(np.float32)
FUR=(255,216,150); STR=(242,154,99); CREAM=(255,245,234)
# back fur layer, painted in art pixel space
back=Image.new('RGB',(W,H),FUR); d=ImageDraw.Draw(back)
def stroke(cx,cy,w,h,col=STR):
    # tapered brush stroke as a thin lens
    pts=[]
    for i in range(21):
        t=i/20; x=cx-w/2+w*t; th=h*np.sin(np.pi*t)
        pts.append((x,cy-th/2+ (t-0.5)**2*h*1.2))
    for i in range(20,-1,-1):
        t=i/20; x=cx-w/2+w*t; th=h*np.sin(np.pi*t)
        pts.append((x,cy+th/2+ (t-0.5)**2*h*1.2))
    d.polygon(pts,fill=col)
for y in [110,170,235,300,370,430]:
    stroke(540,y,330,22); stroke(330,y+18,170,16); stroke(750,y+18,170,16)
for y in range(540,1000,70):
    stroke(540,y,300,26); stroke(330,y+20,200,20); stroke(750,y+20,200,20)
d.rectangle([0,950,W,H],fill=STR)
back=back.filter(ImageFilter.GaussianBlur(1.2))
Image.fromarray(L1.astype(np.uint8)).save(WORK + '/face_skin.png')
AW,AH=3072,1088
atlas=Image.new('RGB',(AW,AH),FUR)
atlas.paste(Image.fromarray(L0.astype(np.uint8)),(0,0))
atlas.paste(Image.fromarray(L1.astype(np.uint8)),(1024,0))
atlas.paste(back,(2048,0))
# pad the gaps between layers with edge pixels
A=np.array(atlas)
for x0 in (0,1024,2048):
    A[:,x0+W:x0+1024]=A[:,x0+W-1:x0+W]
A[H:,:]=A[H-1:H,:]
atlas=Image.fromarray(A); d=ImageDraw.Draw(atlas)
SW={'blue':(153,200,246),'blue_dark':(34,80,208),'silver':(184,204,212),'black':(0,0,0),'cream':CREAM,'fur':FUR,'paw':STR,'pink':(247,166,166),'dark':(58,26,18)}
import json
sw={}
for i,(k,c) in enumerate(SW.items()):
    x0=i*64+8; d.rectangle([x0,1044,x0+48,1084],fill=c); sw[k]=((x0+24)/AW,1-(1064)/AH)
atlas.resize((2048, 726), Image.LANCZOS).save(OUT)
json.dump({'W':AW,'H':AH,'artW':W,'artH':H,'swatch':sw},open(WORK + '/atlas.json','w'))
print('ok',sw)
