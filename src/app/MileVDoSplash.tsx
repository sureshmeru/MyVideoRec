import React, {useEffect, useRef} from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

type MileVDoSplashProps = {
  onFinish: () => void;
};

const DOT_X = 779 / 941;
const DOT_Y = 747 / 1672;

export default function MileVDoSplash({onFinish}: MileVDoSplashProps) {
  const {width, height} = useWindowDimensions();
  const imageScale = (Math.min(width / 941, height / 1672) * 0.9);
  const imageWidth = 941 * imageScale;
  const imageHeight = 1672 * imageScale;
  const imageOffsetX = (width - imageWidth) / 2;
  const imageOffsetY = (height - imageHeight) / 2;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.12,
          duration: 450,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      {iterations: 2},
    );

    animation.start(({finished}) => {
      if (finished) {
        onFinish();
      }
    });

    return () => animation.stop();
  }, [onFinish, pulse]);

  const dotOpacity = pulse.interpolate({inputRange: [0, 1], outputRange: [0.35, 1]});
  const dotScale = pulse.interpolate({inputRange: [0, 1], outputRange: [0.82, 1.12]});
  const ringScale = pulse.interpolate({inputRange: [0, 1], outputRange: [0.75, 1.75]});
  const ringOpacity = pulse.interpolate({inputRange: [0, 1], outputRange: [0.7, 0]});
  const glowOpacity = pulse.interpolate({inputRange: [0, 1], outputRange: [0.18, 0.85]});

  return (
    <View style={styles.screen}>
      <Image
        source={require('./assets/MileVDo_splash_base.png')}
        resizeMode="stretch"
        style={[
          styles.backgroundImage,
          {
            left: imageOffsetX,
            top: imageOffsetY,
            width: imageWidth,
            height: imageHeight,
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.indicatorAnchor,
          {
            left: imageOffsetX + DOT_X * imageWidth,
            top: imageOffsetY + DOT_Y * imageHeight,
          },
        ]}>
        <Animated.View
          style={[
            styles.pulseRing,
            {opacity: ringOpacity, transform: [{scale: ringScale}]},
          ]}
        />
        <Animated.View style={[styles.glow, {opacity: glowOpacity}]} />
        <Animated.View
          style={[
            styles.led,
            {opacity: dotOpacity, transform: [{scale: dotScale}]},
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#030405',
  },
  backgroundImage: {
    position: 'absolute',
  },
  indicatorAnchor: {
    position: 'absolute',
    width: 1,
    height: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#ff2538',
  },
  glow: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ff001e',
    shadowColor: '#ff001e',
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 12,
  },
  led: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ff142e',
    borderWidth: 1,
    borderColor: '#ff6a75',
    shadowColor: '#ff001e',
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
});
