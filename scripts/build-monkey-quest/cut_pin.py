# Cut the pin out of Dapo's photo (silhouette from pin_masks.py) -> /tmp/mq/pin_cutout.png (transparent outside the pin)
import cv2, numpy as np, json
c = cv2.imread('/tmp/mq/crop.png'); sil = cv2.imread('/tmp/mq/sil.png', 0)
f = json.load(open('/tmp/mq/pin_frame.json')); x0, y0, x1, y1 = f['crop_box']
a = cv2.GaussianBlur(sil, (0, 0), 1.2)
rgba = np.dstack([c, a])[y0:y1 + 1, x0:x1 + 1]
cv2.imwrite('/tmp/mq/pin_cutout.png', rgba)
print(rgba.shape)
