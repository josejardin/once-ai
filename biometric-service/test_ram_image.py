import numpy as np
import cv2

# Create a test synthetic face image (160x160 RGB) to test RAM-only pipeline
test_img = np.zeros((160, 160, 3), dtype=np.uint8)
cv2.circle(test_img, (80, 80), 50, (200, 200, 200), -1)
cv2.circle(test_img, (60, 70), 8, (50, 50, 50), -1)
cv2.circle(test_img, (100, 70), 8, (50, 50, 50), -1)
cv2.ellipse(test_img, (80, 105), (20, 10), 0, 0, 180, (50, 50, 50), 3)

_, buffer = cv2.imencode('.jpg', test_img)
import base64
b64_str = base64.b64encode(buffer).decode('utf-8')
print("Sample base64 created, length:", len(b64_str))
