from PIL import Image

for i in range(1, 5):
    img = Image.open(f'/home/ibrahim/video_downloader/reference-part-{i}.png')
    # Make very small for analysis
    tiny = img.resize((200, int(200 * img.height / img.width)))
    tiny.save(f'/home/ibrahim/video_downloader/part-{i}-tiny.png')
    print(f'Part {i}: {img.width}x{img.height} -> {tiny.width}x{tiny.height}')

# Also for each of the 28 screens
full = Image.open('/home/ibrahim/video_downloader/reference-design.png')
screen_height = full.height // 28
for screen_idx in range(28):
    top = screen_idx * screen_height
    bottom = (screen_idx + 1) * screen_height
    screen = full.crop((0, top, full.width, bottom))
    tiny = screen.resize((200, int(200 * screen.height / screen.width)))
    tiny.save(f'/home/ibrahim/video_downloader/screen-{screen_idx+1:02d}-tiny.png')
    
print('Done making tiny thumbnails')