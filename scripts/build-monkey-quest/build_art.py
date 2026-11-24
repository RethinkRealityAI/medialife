# Flat art for the page, from the traced masks: silhouette (cut-out), line art (guide), cut-out photo (webp)
import cv2, numpy as np, json
from PIL import Image
OUT = '/home/user/medialife/public/monkey-quest/hub/art/'
f = json.load(open('/tmp/mq/pin_frame.json')); x0, y0, x1, y1 = f['crop_box']
sil = cv2.imread('/tmp/mq/sil.png', 0)[y0:y1 + 1, x0:x1 + 1]
lines = cv2.imread('/tmp/mq/lines.png', 0)[y0:y1 + 1, x0:x1 + 1]
def save(a, rgb, path, w):
    im = np.dstack([np.full_like(a, rgb[0]), np.full_like(a, rgb[1]), np.full_like(a, rgb[2]), a])
    Image.fromarray(im).resize((w, round(w * a.shape[0] / a.shape[1])), Image.LANCZOS).save(path)
save(cv2.GaussianBlur(sil, (0, 0), 1.5), (255, 255, 255), OUT + 'pin-silhouette.png', 512)
# guide: the pin's lines (raised metal) + outline, white
edge = cv2.morphologyEx(sil, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
la = np.maximum(edge, lines); la = cv2.dilate(la, np.ones((5, 5)))
save(cv2.GaussianBlur(la, (0, 0), 1.5), (255, 255, 255), OUT + 'pin-lines.png', 512)
cut = Image.open('/tmp/mq/pin_cutout.png').convert('RGBA'); 
cut.resize((640, round(640 * cut.height / cut.width)), Image.LANCZOS).save(OUT + 'pin-photo.webp', quality=88)
print('pin aspect w/h', sil.shape[1] / sil.shape[0])
