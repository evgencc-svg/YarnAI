"""Draw controlled rib examples. These illustrations do not prove physical knitting."""
from pathlib import Path

from PIL import Image, ImageDraw


def draw_samples(directory: Path, rows: int, height_cm: float | None = None):
    directory.mkdir(parents=True, exist_ok=True)
    for name, count in (("correct", rows), ("under", max(1,rows//2)), ("over", rows+max(4,rows//2)),
                        ("shape", rows), ("ambiguous", rows), ("other", 0)):
        image = Image.new("RGB", (820, 720), (234, 230, 220))
        draw = ImageDraw.Draw(image)
        left, top, pitch = 110, 90, min(24, 540//(rows+max(4, rows//2)))
        if name == "other":
            draw.ellipse((240,170,535,465), fill=(71,51,40))
            if height_cm is not None:
                draw.line((235,480,535,480),fill=(91,78,68),width=6)
                draw.arc((210,150,555,490),200,350,fill=(171,134,102),width=7)
            for x,y in ((340,270),(420,270),(340,350),(420,350)):
                draw.ellipse((x,y,x+22,y+22), fill=(234,230,220))
        else:
            draw.line((65,top-5,749,top-5), fill=(96,111,126), width=9)
            for row in range(count):
                columns = 23 if name != "shape" else 10 + 13*row//max(1,count-1)
                for col in range(columns):
                    x,y=left+col*26,top+row*pitch
                    draw.rectangle((x,y,x+26,y+pitch), fill=(48,86,74))
                    if col%2==0:
                        draw.line((x+2,y,x+13,y+pitch-2,x+24,y), fill=(150,194,162),width=5)
                    else:
                        draw.arc((x+1,y,x+25,y+pitch),10,170,fill=(103,148,128),width=5)
            draw.line((left,top+count*pitch,left+23*26,top+count*pitch),fill=(75,111,91),width=5)
            if height_cm is not None:
                # Calibration is fixed across examples. Shorter/longer knitting moves only the needle reading.
                bottom=top+count*pitch
                px_cm=rows*pitch/height_cm
                draw.rectangle((20,4,102,710),fill=(246,231,166))
                for mm in range(int(bottom/px_cm*10)+1):
                    y=bottom-round(mm*px_cm/10)
                    tick=30 if mm%10==0 else (16 if mm%5==0 else 9)
                    draw.line((101-tick,y,101,y),fill=(35,35,30),width=2)
                    if mm%10==0: draw.text((30,y-9),str(mm//10),fill=(25,25,25),font_size=20)
                draw.text((21,min(675,bottom+8)),"cm",fill=(25,25,25),font_size=20)
            if name == "ambiguous" and height_cm is not None:
                # A folded cloth hides the needle and almost the entire scale.
                draw.rectangle((0,0,820,top+count*pitch-12),fill=(62,67,78))
            elif name == "ambiguous":
                image=image.crop((290,top+2,480,top+max(3,pitch*2))).resize((820,720))
        image.save(directory/(name+".png"))
