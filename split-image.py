from PIL import Image

img = Image.open('/home/ibrahim/video_downloader/reference-design.png')
width, height = img.size
print(f'Image size: {width}x{height}')

for i in range(4):
    top = i * (height // 4)
    bottom = (i + 1) * (height // 4) if i < 3 else height
    part = img.crop((0, top, width, bottom))
    part.save(f'/home/ibrahim/video_downloader/reference-part-{i+1}.png')
    print(f'Saved part {i+1}: y={top}-{bottom}')

