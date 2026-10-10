from PIL import Image

for i in range(1, 5):
    img = Image.open(f'/home/ibrahim/video_downloader/reference-part-{i}.png')
    # Resize to smaller width for analysis
    small = img.resize((400, int(400 * img.height / img.width)))
    small.save(f'/home/ibrahim/video_downloader/reference-part-{i}-small.png')
    print(f'Part {i}: {img.width}x{img.height} -> {small.width}x{small.height}')
    
# Also create a grid of all 28 screens - try to identify individual screens
# The full image is 1024x1536, so each screen is roughly 1024/2 x 1536/14 if arranged in 2x14 grid
# Or maybe it's a vertical list of 28 screens
# Let's try to extract each screen assuming vertical arrangement

full = Image.open('/home/ibrahim/video_downloader/reference-design.png')
# Assuming 28 screens stacked vertically, each is ~54px high
screen_height = full.height // 28
for screen_idx in range(28):
    top = screen_idx * screen_height
    bottom = (screen_idx + 1) * screen_height
    screen = full.crop((0, top, full.width, bottom))
    # Save small version
    small = screen.resize((400, int(400 * screen.height / screen.width)))
    small.save(f'/home/ibrahim/video_downloader/screen-{screen_idx+1:02d}.png')
    print(f'Screen {screen_idx+1}: y={top}-{bottom}')