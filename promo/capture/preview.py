# Usage: python preview.py <in.png> <out.png> — composite over magenta at half size to check alpha.
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGBA")
print(im.size, "corner", im.getpixel((20, 20)), "center", im.getpixel((im.width // 2, im.height // 2)))
bg = Image.new("RGBA", im.size, (255, 0, 255, 255))
bg.alpha_composite(im)
bg.convert("RGB").resize((im.width // 4, im.height // 4)).save(sys.argv[2])
