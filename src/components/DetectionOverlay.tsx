import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Canvas, Rect} from '@shopify/react-native-skia';

import {colors} from '../app/theme';
import type {DetectionFrame} from '../features/ai/useVehicleDetector';

interface DetectionOverlayProps {
  frame: DetectionFrame;
}

interface OverlaySize {
  width: number;
  height: number;
}

export function DetectionOverlay({frame}: DetectionOverlayProps) {
  const [size, setSize] = useState<OverlaySize>({width: 0, height: 0});
  const sourceScale =
    frame.frameWidth > 0 && frame.frameHeight > 0
      ? Math.min(size.width / frame.frameWidth, size.height / frame.frameHeight)
      : 0;
  const offsetX = (size.width - frame.frameWidth * sourceScale) / 2;
  const offsetY = (size.height - frame.frameHeight * sourceScale) / 2;
  const displayDetections =
    sourceScale > 0
      ? frame.detections.map(detection => ({
          ...detection,
          x: offsetX + detection.box.x * frame.frameWidth * sourceScale,
          y: offsetY + detection.box.y * frame.frameHeight * sourceScale,
          width: detection.box.width * frame.frameWidth * sourceScale,
          height: detection.box.height * frame.frameHeight * sourceScale,
        }))
      : [];

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={event =>
        setSize({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }>
      {displayDetections.length > 0 ? (
        <>
          <Canvas style={StyleSheet.absoluteFill}>
            {displayDetections.map(detection => (
              <Rect
                key={detection.id}
                x={detection.x}
                y={detection.y}
                width={detection.width}
                height={detection.height}
                color={colors.accent}
                style="stroke"
                strokeWidth={2}
              />
            ))}
          </Canvas>
          {displayDetections.map(detection => (
            <Text
              key={`${detection.id}-label`}
              style={[
                styles.label,
                {
                  left: detection.x,
                  top: Math.max(0, detection.y - 20),
                },
              ]}>
              {detection.label} {Math.round(detection.confidence * 100)}%
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    color: colors.text,
    backgroundColor: '#06140ECC',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
});
