package com.myvideorec

import android.content.Context
import android.hardware.camera2.CameraManager
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
}
