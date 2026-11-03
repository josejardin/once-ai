/**
 * Face-Aligned Scale-Invariant Geometric Calculations
 * MediaPipe FaceLandmarker Utilities for ONCE AI
 */

export function calculateFaceAlignedMetrics(landmarks) {
  if (!landmarks || landmarks.length < 468) {
    return {
      eyeOpenRatio: 0.10,
      smileRatio: 0.52,
      yawRatio: 0.50,
      bbox: null
    };
  }

  // 1. Establish Face-Local Coordinate System using Eye Axis (Landmark 33 to Landmark 263)
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];

  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  const iod = Math.hypot(dx, dy); // Inter-Ocular Distance (our universal ruler)

  if (iod < 0.01) {
    return { eyeOpenRatio: 0.10, smileRatio: 0.52, yawRatio: 0.50, bbox: null };
  }

  // Unit vectors: ex (along eye line), ey (perpendicular to eye line)
  const ex = { x: dx / iod, y: dy / iod };
  const ey = { x: -ex.y, y: ex.x };

  function project(p1, p2, axis) {
    return Math.abs((p1.x - p2.x) * axis.x + (p1.y - p2.y) * axis.y);
  }

  // 2. Eye Opening Height (Perpendicular to eye axis)
  const leftEyeH = project(landmarks[159], landmarks[145], ey);
  const rightEyeH = project(landmarks[386], landmarks[374], ey);
  const avgEyeH = (leftEyeH + rightEyeH) / 2;
  const eyeOpenRatio = avgEyeH / iod;

  // 3. Mouth Width (Parallel to eye axis)
  const mouthW = project(landmarks[61], landmarks[291], ex);
  const smileRatio = mouthW / iod;

  // 4. Head Yaw (Nose position along eye axis)
  const noseProj = (landmarks[1].x - leftEye.x) * ex.x + (landmarks[1].y - leftEye.y) * ex.y;
  const yawRatio = noseProj / iod;

  // 5. Compute tight face bounding box with landmark center
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const centerPoint = landmarks[168] || landmarks[1] || { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const rawH = maxY - minY;
  const rawW = maxX - minX;

  const bbox = {
    x: minX,
    y: minY,
    width: rawW,
    height: rawH,
    cx: centerPoint.x,
    cy: centerPoint.y,
    faceHeight: rawH
  };

  return {
    eyeOpenRatio,
    smileRatio,
    yawRatio,
    iod,
    bbox
  };
}

/**
 * Standardized High-Precision Face Cropping
 * Crops a centered, square portrait from any video or image source using landmarks bbox.
 */
export function cropFaceCanvas(sourceElement, bbox, outputSize = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');

  const sw = sourceElement.videoWidth || sourceElement.naturalWidth || sourceElement.width || 640;
  const sh = sourceElement.videoHeight || sourceElement.naturalHeight || sourceElement.height || 480;

  if (bbox && (bbox.cx !== undefined || bbox.width > 0.05)) {
    const cx = (bbox.cx !== undefined ? bbox.cx : bbox.x + bbox.width / 2) * sw;
    const cy = (bbox.cy !== undefined ? bbox.cy : bbox.y + bbox.height / 2) * sh;
    
    // 1.35x padding around the face height for standard facial recognition framing
    const faceH = (bbox.faceHeight || bbox.height || 0.4) * sh;
    const size = Math.max(faceH * 1.35, 120);

    let sx = cx - size / 2;
    let sy = cy - size / 2;

    if (sx < 0) sx = 0;
    if (sy < 0) sy = 0;
    if (sx + size > sw) sx = Math.max(0, sw - size);
    if (sy + size > sh) sy = Math.max(0, sh - size);

    const cropDim = Math.min(size, sw - sx, sh - sy);
    ctx.drawImage(sourceElement, sx, sy, cropDim, cropDim, 0, 0, outputSize, outputSize);
  } else {
    // Symmetrical square crop fallback
    const minDim = Math.min(sw, sh);
    const sx = (sw - minDim) / 2;
    const sy = (sh - minDim) / 2;
    ctx.drawImage(sourceElement, sx, sy, minDim, minDim, 0, 0, outputSize, outputSize);
  }

  return canvas.toDataURL('image/jpeg', 0.95);
}
