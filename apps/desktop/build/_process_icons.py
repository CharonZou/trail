from PIL import Image
import os

SRC = r'C:\Users\zcr50\AppData\Local\Doubao\User Data\ClipboardTemp\179f66b7-2c09-490f-b8a4-7962c448ff97.png'
BUILD = r'D:\Myproject\PI-Desktop-main\apps\desktop\build'
DOCS_PUB = r'D:\Myproject\PI-Desktop-main\docs\public'
README_LOGO = r'D:\Myproject\PI-Desktop-main\docs\image\readme\logo.png'

# 1. Open source and remove watermark (bottom-right white area)
im = Image.open(SRC).convert('RGB')
W, H = im.size
# cover watermark with pure white (the surrounding canvas is white)
from PIL import ImageDraw
draw = ImageDraw.Draw(im)
draw.rectangle([1660, 1910, W, H], fill=(255,255,255))
print('watermark covered')

# 2. Save master 1024 (high-quality LANCZOS)
master_1024 = im.resize((1024,1024), Image.LANCZOS)
master_1024.save(os.path.join(BUILD,'icon_1024.png'), 'PNG')
print('wrote icon_1024.png')

# 3. icon.png 512
master_1024.resize((512,512), Image.LANCZOS).save(os.path.join(BUILD,'icon.png'), 'PNG')
print('wrote icon.png 512')

# 4. logo_dark.png 1254 (keep original size)
master_1024.resize((1254,1254), Image.LANCZOS).save(os.path.join(BUILD,'logo_dark.png'), 'PNG')
print('wrote logo_dark.png 1254')

# 5. docs/public/app-icon.png 1024
master_1024.save(os.path.join(DOCS_PUB,'app-icon.png'), 'PNG')
print('wrote docs app-icon.png')

# 6. readme logo.png 512
master_1024.resize((512,512), Image.LANCZOS).save(README_LOGO, 'PNG')
print('wrote readme logo.png')

# 7. Multi-size ICO (Windows). Include 16,24,32,48,64,128,256
ico_sizes = [(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)]
ico_imgs = [master_1024.resize(s, Image.LANCZOS) for s in ico_sizes]
ico_imgs[-1].save(os.path.join(BUILD,'icon.ico'), format='ICO', sizes=ico_sizes)
print('wrote icon.ico with sizes', ico_sizes)

# 8. Minimal ICNS container (1024 PNG, type ic10 = 1024x1024@2x)
def write_icns(png_path, out_path):
    with open(png_path,'rb') as f:
        png_data = f.read()
    # icns header: magic 'icns' + total length (big-endian)
    # entry: type (4 bytes BE) + length (4 bytes BE, includes type+length+data)
    entries = []
    # ic07=128, ic08=256, ic09=512, ic10=1024
    size_map = {b'ic07':128, b'ic08':256, b'ic09':512, b'ic10':1024}
    im_src = Image.open(png_path).convert('RGB')
    for typ, sz in size_map.items():
        buf = __import__('io').BytesIO()
        im_src.resize((sz,sz), Image.LANCZOS).save(buf, format='PNG')
        data = buf.getvalue()
        entries.append(typ + (len(data)+8).to_bytes(4,'big') + data)
    body = b''.join(entries)
    total = 8 + len(body)
    with open(out_path,'wb') as f:
        f.write(b'icns' + total.to_bytes(4,'big'))
        f.write(body)
    print('wrote', out_path, os.path.getsize(out_path), 'bytes')

write_icns(os.path.join(BUILD,'icon_1024.png'), os.path.join(BUILD,'icon.icns'))
print('DONE')
