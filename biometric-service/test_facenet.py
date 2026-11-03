import os
import sys

# Force UTF-8 stdout
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import numpy as np
from deepface import DeepFace

img = np.zeros((160, 160, 3), dtype=np.uint8)
try:
    print("Calling DeepFace.represent with Facenet512...")
    res = DeepFace.represent(img_path=img, model_name='Facenet512', enforce_detection=False)
    print("Facenet512 success, len:", len(res[0]['embedding']))
except Exception as e:
    print("Facenet512 error:", type(e), e)
