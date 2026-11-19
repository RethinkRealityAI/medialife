#!/usr/bin/env python3
"""Convert LOOT BREAK sprites from Kenney Tiny Dungeon (CC0) into the PAL/SPRITES
pixel-row grids used by mattercraft/loot-break/LootBreakGame.ts.

Usage: python3 scripts/loot-break-sprites.py mattercraft/loot-break/art/kenney-tiny-dungeon/tilemap_packed.png out.ts
Then paste out.ts over PAL and SPRITES in LootBreakGame.ts and run node scripts/build-loot-break.mjs.
Needs Pillow.
"""
import sys, colorsys, json
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA'); cols = im.size[0]//16
MAP = [("knight",96),("ranger",112),("sorcerer",84),("priest",99),("brute",109),("slime",108),("bat",120),("boss",110),
       ("chest",90),("chestOpen",89),("coin",101),("shield",102),("sword",104),("axe",118),("potion",116),("elixir",115)]
def tile(t):
  r,c=divmod(t,cols); return im.crop((c*16,r*16,c*16+16,r*16+16))
def hexc(p): return '#%02x%02x%02x'%p[:3]
alphas=set(); grids={}
for name,t in MAP:
  tl=tile(t); g=[]
  for y in range(16):
    row=[]
    for x in range(16):
      p=tl.getpixel((x,y)); alphas.add(p[3])
      row.append(None if p[3]<128 else hexc(p))
    g.append(row)
  grids[name]=g
def recolor(g, hue, only_sat=0.25):
  outg=[]
  for row in g:
    nr=[]
    for c in row:
      if c is None: nr.append(None); continue
      r,gg,b=[int(c[i:i+2],16)/255 for i in (1,3,5)]
      h,l,s=colorsys.rgb_to_hls(r,gg,b)
      if s>only_sat and l>0.2:
        r2,g2,b2=colorsys.hls_to_rgb(hue,l,s)
        nr.append('#%02x%02x%02x'%(round(r2*255),round(g2*255),round(b2*255)))
      else: nr.append(c)
    outg.append(nr)
  return outg
grids['cursed']=recolor(grids['slime'],0.77)
grids['cosmic']=recolor(grids['potion'],0.77)
grids['coin']=recolor(grids['coin'],0.12,0.1)
# trim fully transparent rows top/bottom only for nothing: keep 16x16 so feet align
cols_used={}
CH="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
for g in grids.values():
  for row in g:
    for c in row:
      if c and c not in cols_used: cols_used[c]=CH[len(cols_used)]
pal={v:k for k,v in cols_used.items()}
lines=[]
lines.append('const PAL: Record<string, string> = {')
for k,v in pal.items(): lines.append(f'  {k}: "{v}",')
lines.append('};\n')
lines.append('/* One string per pixel row; \'.\' is transparent. Converted from Kenney\'s Tiny Dungeon (CC0), see CREDITS.md. */')
lines.append('const SPRITES: Record<string, string[]> = {')
tiles=dict(MAP)
for name,g in grids.items():
  rows=[''.join('.' if c is None else cols_used[c] for c in row) for row in g]
  note = (f'tile_{tiles[name]:04d}' + (', recoloured gold' if name=='coin' else '')) if name in tiles else ('tile_0108, recoloured purple' if name=='cursed' else 'tile_0116, recoloured purple')
  lines.append(f'  /** Tiny Dungeon {note}. */')
  lines.append(f'  {name}: [')
  for r in rows: lines.append(f'    "{r}",')
  lines.append('  ],')
lines.append('};')
open(out,'w').write('\n'.join(lines)+'\n')
print('alphas',sorted(alphas),'colours',len(pal))
