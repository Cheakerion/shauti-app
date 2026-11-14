# -*- coding: utf-8 -*-
"""生成复研的图标（assets/icon.ico / icon.png）。改了配色重跑一次即可。"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
OUT = os.path.join(APP, "assets")
os.makedirs(OUT, exist_ok=True)

S = 256
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

# 背景：圆角矩形 + 竖向渐变
bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
top = (24, 158, 148)
bottom = (10, 84, 78)
for y in range(S):
    t = y / (S - 1)
    c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
    ImageDraw.Draw(bg).line([(0, y), (S, y)], fill=c)
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=58, fill=255)
img.paste(bg, (0, 0), mask)

d = ImageDraw.Draw(img)

# “复”字
font = None
for cand in (
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
):
    if os.path.exists(cand):
        try:
            font = ImageFont.truetype(cand, 150)
            break
        except Exception:
            pass
if font is None:
    raise SystemExit("找不到中文字体")

text = "复"
box = d.textbbox((0, 0), text, font=font)
tw, th = box[2] - box[0], box[3] - box[1]
x = (S - tw) / 2 - box[0]
y = (S - th) / 2 - box[1] - 4
d.text((x + 2, y + 3), text, font=font, fill=(0, 40, 38, 70))  # 轻微投影
d.text((x, y), text, font=font, fill=(255, 255, 255, 245))

img.save(os.path.join(OUT, "icon.png"))
img.save(os.path.join(OUT, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("图标已生成：", os.path.join(OUT, "icon.ico"))
