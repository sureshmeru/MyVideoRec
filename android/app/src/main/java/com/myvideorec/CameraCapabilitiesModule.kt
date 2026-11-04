package com.myvideorec

import android.content.Context
import android.hardware.camera2.CameraManager
import android.media.MediaCodecList
import android.media.MediaFormat
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CameraCapabilitiesModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "RoadwatchCameraCapabilities"

  @ReactMethod
  fun getConcurrentCameraPairs(promise: Promise) {
    try {
      val pairs = Arguments.createArray()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val cameraManager =
          reactApplicationContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        cameraManager.concurrentCameraIds.forEach { cameraIds ->
          val pair = Arguments.createArray()
          cameraIds.forEach(pair::pushString)
          pairs.pushArray(pair)
        }
      }
      promise.resolve(pairs)
    } catch (error: Exception) {
      promise.reject("CAMERA_CAPABILITY_ERROR", "Could not read concurrent camera support.", error)
    }
  }

  @ReactMethod
  fun getSupportedVideoCodecs(width: Int, height: Int, frameRate: Int, promise: Promise) {
    try {
      val codecs = Arguments.createArray()
      val supportedTypes = listOf(
        "h264" to MediaFormat.MIMETYPE_VIDEO_AVC,
        "h265" to MediaFormat.MIMETYPE_VIDEO_HEVC,
      )
      val mediaCodecList = MediaCodecList(MediaCodecList.REGULAR_CODECS)
      supportedTypes.forEach { (name, mimeType) ->
        val supported = mediaCodecList.codecInfos.any { codecInfo ->
          if (!codecInfo.isEncoder || codecInfo.supportedTypes.none { it.equals(mimeType, true) }) {
            false
          } else {
            try {
              codecInfo.getCapabilitiesForType(mimeType)
                .videoCapabilities
                .areSizeAndRateSupported(width, height, frameRate.toDouble())
            } catch (_: IllegalArgumentException) {
              false
            }
          }
        }
        if (supported) {
          codecs.pushString(name)
        }
      }
      promise.resolve(codecs)
    } catch (error: Exception) {
      promise.reject(
        "VIDEO_CODEC_CAPABILITY_ERROR",
        "Could not read video encoder capabilities.",
        error,
      )
    }
  }
}
