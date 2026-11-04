export const YOLOX_INPUT_SIZE = 416;
export const YOLOX_OUTPUT_VALUES = 3549 * 85;
const ROAD_RELEVANT_CLASS_IDS = new Set([
  0, 1, 2, 3, 5, 7, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
]);

export const COCO_CLASSES = [
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'airplane',
  'bus',
  'train',
  'truck',
  'boat',
  'traffic light',
  'fire hydrant',
  'stop sign',
  'parking meter',
  'bench',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'backpack',
  'umbrella',
  'handbag',
  'tie',
  'suitcase',
  'frisbee',
  'skis',
  'snowboard',
  'sports ball',
  'kite',
  'baseball bat',
  'baseball glove',
  'skateboard',
  'surfboard',
  'tennis racket',
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'banana',
  'apple',
  'sandwich',
  'orange',
  'broccoli',
  'carrot',
  'hot dog',
  'pizza',
  'donut',
  'cake',
  'chair',
  'couch',
  'potted plant',
  'bed',
  'dining table',
  'toilet',
  'tv',
  'laptop',
  'mouse',
  'remote',
  'keyboard',
  'cell phone',
  'microwave',
  'oven',
  'toaster',
  'sink',
  'refrigerator',
  'book',
  'clock',
  'vase',
  'scissors',
  'teddy bear',
  'hair drier',
  'toothbrush',
] as const;

export type CocoClassName = (typeof COCO_CLASSES)[number];

export interface DetectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ObjectDetection {
  id: string;
  classId: number;
  label: CocoClassName;
  box: DetectionBox;
  confidence: number;
  trackingId: null;
  timestampMs: number;
  frameWidth: number;
  frameHeight: number;
}

export function prepareYoloXInput(
  resizedBgr: Uint8Array,
  resizedWidth: number,
  resizedHeight: number,
): Float32Array {
  'worklet';

  if (
    resizedWidth <= 0 ||
    resizedHeight <= 0 ||
    resizedWidth > YOLOX_INPUT_SIZE ||
    resizedHeight > YOLOX_INPUT_SIZE ||
    resizedBgr.length !== resizedWidth * resizedHeight * 3
  ) {
    throw new Error('The resized camera frame has an invalid shape.');
  }

  const input = new Float32Array(YOLOX_INPUT_SIZE * YOLOX_INPUT_SIZE * 3);
  input.fill(114);
  for (let y = 0; y < resizedHeight; y += 1) {
    const sourceRow = y * resizedWidth * 3;
    const targetRow = y * YOLOX_INPUT_SIZE * 3;
    for (let x = 0; x < resizedWidth * 3; x += 1) {
      input[targetRow + x] = resizedBgr[sourceRow + x];
    }
  }
  return input;
}

interface Candidate extends ObjectDetection {
  anchorIndex: number;
}

export function decodeYoloXOutput(
  output: ArrayLike<number>,
  frameWidth: number,
  frameHeight: number,
  timestampMs: number,
  confidenceThreshold = 0.35,
  iouThreshold = 0.45,
): ObjectDetection[] {
  'worklet';

  if (
    output.length !== YOLOX_OUTPUT_VALUES ||
    frameWidth <= 0 ||
    frameHeight <= 0
  ) {
    return [];
  }

  const scale = Math.min(
    YOLOX_INPUT_SIZE / frameWidth,
    YOLOX_INPUT_SIZE / frameHeight,
  );
  const resizedWidth = Math.round(frameWidth * scale);
  const resizedHeight = Math.round(frameHeight * scale);
  const scaleX = resizedWidth / frameWidth;
  const scaleY = resizedHeight / frameHeight;
  const candidates: Candidate[] = [];
  const strides = [8, 16, 32];
  let anchorIndex = 0;

  for (const stride of strides) {
    const gridSize = YOLOX_INPUT_SIZE / stride;
    for (let gridY = 0; gridY < gridSize; gridY += 1) {
      for (let gridX = 0; gridX < gridSize; gridX += 1) {
        const offset = anchorIndex * (COCO_CLASSES.length + 5);
        const objectness = output[offset + 4];
        let classId = 0;
        let classProbability = 0;
        for (let index = 0; index < COCO_CLASSES.length; index += 1) {
          const probability = output[offset + 5 + index];
          if (probability > classProbability) {
            classId = index;
            classProbability = probability;
          }
        }

        const confidence = objectness * classProbability;
        if (
          Number.isFinite(confidence) &&
          confidence >= confidenceThreshold &&
          ROAD_RELEVANT_CLASS_IDS.has(classId)
        ) {
          const centerX = (output[offset] + gridX) * stride;
          const centerY = (output[offset + 1] + gridY) * stride;
          const boxWidth = Math.exp(output[offset + 2]) * stride;
          const boxHeight = Math.exp(output[offset + 3]) * stride;
          const left = Math.max(0, (centerX - boxWidth / 2) / scaleX);
          const top = Math.max(0, (centerY - boxHeight / 2) / scaleY);
          const right = Math.min(frameWidth, (centerX + boxWidth / 2) / scaleX);
          const bottom = Math.min(
            frameHeight,
            (centerY + boxHeight / 2) / scaleY,
          );

          if (
            Number.isFinite(left) &&
            Number.isFinite(top) &&
            Number.isFinite(right) &&
            Number.isFinite(bottom) &&
            right > left &&
            bottom > top
          ) {
            candidates.push({
              id: `${timestampMs}-${anchorIndex}`,
              classId,
              label: COCO_CLASSES[classId],
              box: {
                x: left / frameWidth,
                y: top / frameHeight,
                width: (right - left) / frameWidth,
                height: (bottom - top) / frameHeight,
              },
              confidence,
              trackingId: null,
              timestampMs,
              frameWidth,
              frameHeight,
              anchorIndex,
            });
          }
        }
        anchorIndex += 1;
      }
    }
  }

  const kept: Candidate[] = [];
  candidates.sort((first, second) => second.confidence - first.confidence);
  for (const candidate of candidates) {
    if (
      !kept.some(
        existing =>
          existing.classId === candidate.classId &&
          intersectionOverUnion(existing.box, candidate.box) > iouThreshold,
      )
    ) {
      kept.push(candidate);
      if (kept.length === 30) {
        break;
      }
    }
  }

  return kept.map(candidate => ({
    id: candidate.id,
    classId: candidate.classId,
    label: candidate.label,
    box: candidate.box,
    confidence: candidate.confidence,
    trackingId: candidate.trackingId,
    timestampMs: candidate.timestampMs,
    frameWidth: candidate.frameWidth,
    frameHeight: candidate.frameHeight,
  }));
}

function intersectionOverUnion(
  first: DetectionBox,
  second: DetectionBox,
): number {
  'worklet';

  const intersectionWidth = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) -
      Math.max(first.x, second.x),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) -
      Math.max(first.y, second.y),
  );
  const intersection = intersectionWidth * intersectionHeight;
  const union =
    first.width * first.height + second.width * second.height - intersection;
  return union > 0 ? intersection / union : 0;
}
