from pathlib import Path
import io
import cairosvg
from PIL import Image
root=Path(__file__).resolve().parents[1]
assets=root/'assets'
svg=(assets/'logo.svg').read_text(encoding='utf-8')
# Crop only empty SVG margins; keep the approved geometry unchanged.
svg=svg.replace('viewBox="0 0 256 208"','viewBox="24 28 228 172"')
logo=Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode(),output_width=912,output_height=688))).convert('RGBA')
def canvas(size,width,background):
    result=Image.new('RGBA',(size,size),background)
    mark=logo.resize((width,round(width*172/228)),Image.Resampling.LANCZOS)
    result.alpha_composite(mark,((size-mark.width)//2,(size-mark.height)//2))
    return result
canvas(1024,800,'#FAFBFC').convert('RGB').save(assets/'icon.png')
foreground=canvas(1024,560,(0,0,0,0))
foreground.save(assets/'android-icon-foreground.png')
Image.new('RGB',(1024,1024),'#FAFBFC').save(assets/'android-icon-background.png')
# Monochrome icon uses the same silhouette with the white flame as a cutout.
mark=logo.copy()
pixels=mark.load()
for y in range(mark.height):
    for x in range(mark.width):
        r,g,b,a=pixels[x,y]
        pixels[x,y]=(0,0,0,0 if min(r,g,b)>245 else a)
mono=Image.new('RGBA',(1024,1024))
mark=mark.resize((560,round(560*172/228)),Image.Resampling.LANCZOS)
mono.alpha_composite(mark,((1024-mark.width)//2,(1024-mark.height)//2))
mono.save(assets/'android-icon-monochrome.png')
canvas(1024,700,(0,0,0,0)).save(assets/'splash-icon.png')
canvas(64,54,(0,0,0,0)).save(assets/'favicon.png')
preview=Image.new('RGB',(1024,512),'#EAF0F8')
for x,name in [(0,'icon.png'),(512,'android-icon-foreground.png')]:
    tile=Image.open(assets/name).convert('RGBA').resize((448,448),Image.Resampling.LANCZOS)
    preview.paste(tile,(x+32,32),tile)
preview.save(root/'outputs/branding/app-icons-current.png')
print('Updated six icon assets from assets/logo.svg')
