from PIL import Image, ImageDraw, ImageFont

# Create a blank image with white background
img = Image.new('RGB', (400, 300), color = (255, 255, 255))
d = ImageDraw.Draw(img)

# Try to use a default font, otherwise standard
try:
    fnt = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
    fnt_large = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 30)
except Exception:
    fnt = ImageFont.load_default()
    fnt_large = ImageFont.load_default()

# Add the required text mimicking the UOB screenshot
d.text((20, 20), "UOB", font=fnt_large, fill=(0, 0, 0))
d.text((20, 80), "Latest Transactions", font=fnt_large, fill=(0, 0, 0))
d.text((20, 140), "Dawn And Dusk Coffee", font=fnt, fill=(0, 0, 0))
d.text((250, 140), "MYR 27.60", font=fnt, fill=(0, 0, 0))
d.text((20, 180), "1 hour ago", font=fnt, fill=(100, 100, 100))

# Save the image
img.save('/Users/brucechoi/Desktop/inboxer/test_uob_receipt.png')
print("Image saved to /Users/brucechoi/Desktop/inboxer/test_uob_receipt.png")
