import sys
from PIL import Image
fs = [int(a) for a in sys.argv[1:]]
ims = [Image.open(f'out/stills/f{f}.jpg').resize((640, 360)) for f in fs]
rows = (len(ims) + 1) // 2
sheet = Image.new('RGB', (1280, 360 * rows), 'white')
for i, im in enumerate(ims): sheet.paste(im, ((i % 2) * 640, (i // 2) * 360))
sheet.save('out/stills/sheet.jpg', quality=85)
