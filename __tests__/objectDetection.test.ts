import {
  decodeYoloXOutput,
  prepareYoloXInput,
  YOLOX_OUTPUT_VALUES,
} from '../src/features/ai/objectDetection';

function setDetection(
  output: Float32Array,
  anchorIndex: number,
  classId: number,
  objectness: number,
  classProbability: number,
  centerOffset = 0,
  logSize = Math.log(12),
) {
  const offset = anchorIndex * 85;
  output[offset] = centerOffset;
  output[offset + 1] = centerOffset;
  output[offset + 2] = logSize;
  output[offset + 3] = logSize;
  output[offset + 4] = objectness;
  output[offset + 5 + classId] = classProbability;
}

describe('YOLOX COCO output decoding', () => {
  it('creates the model BGR float input with bottom/right letterbox padding', () => {
    const input = prepareYoloXInput(
      new Uint8Array([10, 20, 30, 40, 50, 60]),
      2,
      1,
    );

    expect(Array.from(input.slice(0, 9))).toEqual([
      10, 20, 30, 40, 50, 60, 114, 114, 114,
    ]);
    expect(input[416 * 3]).toBe(114);
  });

  it('decodes calibrated letterbox coordinates, class, confidence, and timestamp', () => {
    const output = new Float32Array(YOLOX_OUTPUT_VALUES);
    const anchorIndex = 20 * 52 + 20;
    setDetection(output, anchorIndex, 2, 0.9, 0.8);

    const [detection] = decodeYoloXOutput(output, 832, 416, 1234);

    expect(detection).toMatchObject({
      classId: 2,
      label: 'car',
      trackingId: null,
      timestampMs: 1234,
      frameWidth: 832,
      frameHeight: 416,
    });
    expect(detection.confidence).toBeCloseTo(0.72);
    expect(detection.box.x).toBeGreaterThanOrEqual(0);
    expect(detection.box.x + detection.box.width).toBeLessThanOrEqual(1);
    expect(detection.box.y + detection.box.height).toBeLessThanOrEqual(1);
  });

  it('applies confidence filtering and per-class non-maximum suppression', () => {
    const output = new Float32Array(YOLOX_OUTPUT_VALUES);
    setDetection(output, 1060, 2, 0.9, 0.9, 10);
    setDetection(output, 1061, 2, 0.8, 0.8, 10);
    setDetection(output, 1062, 3, 0.9, 0.9, 10);
    setDetection(output, 1063, 7, 0.3, 0.9, 10);

    const detections = decodeYoloXOutput(output, 416, 416, 5000);

    expect(detections.map(detection => detection.label)).toEqual([
      'car',
      'motorcycle',
    ]);
  });

  it('returns no detections for invalid output or frame dimensions', () => {
    expect(decodeYoloXOutput([], 416, 416, 1)).toEqual([]);
    expect(
      decodeYoloXOutput(new Float32Array(YOLOX_OUTPUT_VALUES), 0, 416, 1),
    ).toEqual([]);
  });
});
