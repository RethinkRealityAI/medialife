#!/bin/sh
# Fake cameras for the simulator (written next to this script; ~280 MB + ~190 MB, never commit the .y4m files).
#   floor.y4m: a busy wooden floor, 960x720 (4:3, what SLAM asks for), slow drift, in perspective
#   face.y4m:  a still face photo, 960x720.  Usage: sh make-videos.sh /path/to/face-photo.png
set -e
cd "$(dirname "$0")"
python3 - "$1" <<'PY'
import random, sys
from PIL import Image, ImageDraw
random.seed(3)
W, H = 2400, 1800
im = Image.new('RGB', (W, H), (150, 120, 95)); d = ImageDraw.Draw(im)
for y in range(0, H, 90):
    c = random.randint(120, 175); d.rectangle([0, y, W, y + 86], fill=(c, int(c * .78), int(c * .6)))
    x = random.randint(0, 300)
    while x < W:
        d.line([x, y, x, y + 86], fill=(60, 45, 35), width=4); x += random.randint(280, 520)
for i in range(2600):
    x, y, r = random.randint(0, W), random.randint(0, H), random.randint(3, 16)
    col = tuple(random.randint(30, 240) for _ in range(3))
    (d.ellipse if random.random() < .5 else d.rectangle)([x - r, y - r // 2, x + r, y + r // 2], fill=col)
im.save('floor.jpg', quality=92)
if len(sys.argv) > 1 and sys.argv[1]:
    src = Image.open(sys.argv[1]).convert('RGB'); bg = Image.new('RGB', (960, 720), (120, 120, 120))
    f = src.resize((int(src.width * 720 / src.height), 720)); bg.paste(f, ((960 - f.width) // 2, 0)); bg.save('face.jpg', quality=92)
PY
ffmpeg -loglevel error -y -loop 1 -i floor.jpg -t 9 -vf "crop=1500:1125:x='450+250*sin(2*PI*t/9)':y='340+160*sin(2*PI*t/6)',scale=1280:960,perspective=x0=260:y0=0:x1=1020:y1=0:x2=0:y2=960:x3=1280:y3=960,crop=1280:960,scale=960:720,format=yuv420p" -r 30 -f yuv4mpegpipe floor.y4m
[ -f face.jpg ] && ffmpeg -loglevel error -y -loop 1 -i face.jpg -t 6 -vf format=yuv420p -r 30 -f yuv4mpegpipe face.y4m
echo done
