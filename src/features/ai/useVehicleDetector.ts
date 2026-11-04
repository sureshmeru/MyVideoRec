import {useMemo, useState} from 'react';
import {Platform} from 'react-native';
import {useFrameProcessor} from 'react-native-vision-camera';
import {useTensorflowModel} from 'react-native-fast-tflite';
import type {TensorflowModel} from 'react-native-fast-tflite';
import {useRunOnJS, useSharedValue} from 'react-native-worklets-core';
import {useResizePlugin} from 'vision-camera-resize-plugin';

import {
  decodeYoloXOutput,
  ObjectDetection,
  prepareYoloXInput,
  YOLOX_INPUT_SIZE,
} from './objectDetection';

const MODEL_ASSET =
  Platform.OS === 'android'
    ? {url: 'yolox_nano_coco'}
    : require('../../assets/models/yolox_nano_coco.tflite');
const INFERENCE_FPS = 5;
const INFERENCE_INTERVAL_MS = 1000 / INFERENCE_FPS;

export interface DetectionFrame {
  detections: ObjectDetection[];
  frameWidth: number;
  frameHeight: number;
}

export type VehicleDetectorStatus = 'loading' | 'ready' | 'disabled' | 'error';

const EMPTY_FRAME: DetectionFrame = {
  detections: [],
  frameWidth: 0,
  frameHeight: 0,
};

function getModelContractError(model: TensorflowModel): string | null {
  const input = model.inputs[0];
  const output = model.outputs[0];
  if (
    input?.dataType !== 'float32' ||
    input.shape.join(',') !== '1,416,416,3' ||
    output?.dataType !== 'float32' ||
    output.shape.join(',') !== '1,3549,85'
  ) {
    return 'The installed YOLO model has an unsupported tensor shape or data type.';
  }
  return null;
}

export function useVehicleDetector(enabled: boolean) {
  const delegate = Platform.OS === 'ios' ? 'core-ml' : 'default';
  const modelState = useTensorflowModel(MODEL_ASSET, delegate);
  const model = modelState.state === 'loaded' ? modelState.model : undefined;
  const contractError = model ? getModelContractError(model) : null;
  const resizePlugin = useResizePlugin();
  const [frame, setFrame] = useState<DetectionFrame>(EMPTY_FRAME);
  const [inferenceError, setInferenceError] = useState<string | null>(null);
  const publishFrame = useRunOnJS(setFrame, []);
  const publishError = useRunOnJS(setInferenceError, []);
  const lastInferenceTime = useSharedValue(0);

  const frameProcessor = useFrameProcessor(
    cameraFrame => {
      'worklet';
      if (
        !enabled ||
        model == null ||
        cameraFrame.width <= 0 ||
        cameraFrame.height <= 0
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastInferenceTime.value < INFERENCE_INTERVAL_MS) {
        return;
      }
      lastInferenceTime.value = now;

      try {
        const scale = Math.min(
          YOLOX_INPUT_SIZE / cameraFrame.width,
          YOLOX_INPUT_SIZE / cameraFrame.height,
        );
        const resizedWidth = Math.max(
          1,
          Math.round(cameraFrame.width * scale),
        );
        const resizedHeight = Math.max(
          1,
          Math.round(cameraFrame.height * scale),
        );
        const resized = resizePlugin.resize(cameraFrame, {
          crop: {
            x: 0,
            y: 0,
            width: cameraFrame.width,
            height: cameraFrame.height,
          },
          scale: {width: resizedWidth, height: resizedHeight},
          pixelFormat: 'bgr',
          dataType: 'uint8',
        });
        const input = prepareYoloXInput(resized, resizedWidth, resizedHeight);
        const outputs = model.runSync([input]);
        const output = outputs[0];
        if (!(output instanceof Float32Array)) {
          throw new Error(
            'The YOLO model returned an output tensor with an unsupported type.',
          );
        }

        const timestampMs = Date.now();
        const detections = decodeYoloXOutput(
          output,
          cameraFrame.width,
          cameraFrame.height,
          timestampMs,
        );
        publishFrame({
          detections,
          frameWidth: cameraFrame.width,
          frameHeight: cameraFrame.height,
        });
      } catch (inferenceFailure) {
        publishError(
          inferenceFailure instanceof Error
            ? inferenceFailure.message
            : 'YOLO inference failed.',
        );
      }
    },
    [
      enabled,
      lastInferenceTime,
      model,
      publishError,
      publishFrame,
      resizePlugin,
    ],
  );

  const status: VehicleDetectorStatus =
    modelState.state === 'error' || contractError || inferenceError
      ? 'error'
      : !enabled
      ? 'disabled'
      : modelState.state === 'loading'
      ? 'loading'
      : 'ready';
  const error =
    modelState.state === 'error'
      ? modelState.error.message
      : contractError ?? inferenceError;
  const activeFrameProcessor =
    enabled && model != null && !contractError && !inferenceError
      ? frameProcessor
      : undefined;

  return useMemo(
    () => ({
      frame,
      frameProcessor: activeFrameProcessor,
      status,
      error,
      inferenceFps: INFERENCE_FPS,
    }),
    [activeFrameProcessor, error, frame, status],
  );
}
