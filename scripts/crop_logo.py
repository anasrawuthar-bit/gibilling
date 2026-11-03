import os
from PIL import Image
import numpy as np

os.makedirs('assets', exist_ok=True)

img = Image.open('downloaded_image.jpeg').convert('RGBA')
arr = np.array(img)

# Logo bounding box roughly Y: 230..580, X: 380..700
# Let's find the exact tight bounds in that region
logo_region_mask = (arr[:620, :, 0] < 240) | (arr[:620, :, 1] < 240) | (arr[:620, :, 2] < 240)
y_indices, x_indices = np.where(logo_region_mask)

min_y, max_y = y_indices.min(), y_indices.max()
min_x, max_x = x_indices.min(), x_indices.max()

print(f"Tight logo box: X={min_x}..{max_x} (w={max_x - min_x + 1}), Y={min_y}..{max_y} (h={max_y - min_y + 1})")

# Crop tight
cropped_logo = img.crop((min_x, min_y, max_x + 1, max_y + 1))

# Convert white background to transparent:
# For every pixel, calculate distance from pure white (255, 255, 255)
# If close to white, make alpha transparent or smoothly blend anti-aliased edges
crop_arr = np.array(cropped_logo, dtype=float)
r, g, b, a = crop_arr[:, :, 0], crop_arr[:, :, 1], crop_arr[:, :, 2], crop_arr[:, :, 3]

# In JPEG, background is ~255, 255, 255.
# Let's find luminance / distance from white:
# Brightness = max(r, g, b) or (r+g+b)/3
# Pure white = 255
diff_from_white = 255 - np.minimum(np.minimum(r, g), b)

# For pixels where diff_from_white is < 5, it's solid white background -> alpha = 0
# For pixels between 5 and 40, anti-aliased edge -> smooth alpha
alpha = np.clip(diff_from_white * (255.0 / 35.0), 0, 255)

# For pixels where alpha > 0, we can also restore the true color by removing white blend
clean_arr = np.zeros_like(crop_arr, dtype=np.uint8)
# If alpha is high, keep rgb
mask = alpha > 0
for c in range(3):
    clean_c = crop_arr[:, :, c]
    # de-blend white: original = (pixel - (1 - alpha_norm)*255) / alpha_norm
    alpha_norm = np.maximum(alpha / 255.0, 0.01)
    unblended = (clean_c - (1.0 - alpha_norm) * 255.0) / alpha_norm
    clean_arr[:, :, c] = np.clip(unblended, 0, 255).astype(np.uint8)

clean_arr[:, :, 3] = alpha.astype(np.uint8)

transparent_logo = Image.fromarray(clean_arr, mode='RGBA')

# Now create square icon versions with balanced padding
w, h = transparent_logo.size
target_size = max(w, h)
pad = int(target_size * 0.1) # 10% padding
square_size = target_size + (pad * 2)

square_img = Image.new('RGBA', (square_size, square_size), (0, 0, 0, 0))
offset_x = (square_size - w) // 2
offset_y = (square_size - h) // 2
square_img.paste(transparent_logo, (offset_x, offset_y), transparent_logo)

# Save master transparent logo
transparent_logo.save('assets/zynbill-logo.png')
square_img.save('assets/zynbill-icon-square.png')

# 512x512 high-res app icon
icon_512 = square_img.resize((512, 512), Image.Resampling.LANCZOS)
icon_512.save('assets/icon.png')
icon_512.save('assets/zynbill-512.png')

# Also 256, 128, 64, 48, 32, 16
icon_256 = square_img.resize((256, 256), Image.Resampling.LANCZOS)
icon_256.save('assets/zynbill-256.png')

icon_64 = square_img.resize((64, 64), Image.Resampling.LANCZOS)
icon_64.save('assets/zynbill-64.png')

icon_32 = square_img.resize((32, 32), Image.Resampling.LANCZOS)
icon_32.save('assets/zynbill-32.png')

# Create Windows .ico
icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
square_img.save('assets/icon.ico', format='ICO', sizes=icon_sizes)

print("Saved assets successfully!")
