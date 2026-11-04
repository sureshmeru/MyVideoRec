package com.myvideorec

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class RecordingForegroundServiceModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "RoadwatchRecordingForegroundService"

  @ReactMethod
  fun startRecordingService(
    recordAudio: Boolean,
    trackLocation: Boolean,
    promise: Promise,
  ) {
    try {
      val intent = Intent(reactApplicationContext, RecordingForegroundService::class.java).apply {
        action = RecordingForegroundService.ACTION_START
        putExtra(RecordingForegroundService.EXTRA_RECORD_AUDIO, recordAudio)
        putExtra(RecordingForegroundService.EXTRA_TRACK_LOCATION, trackLocation)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactApplicationContext.startForegroundService(intent)
      } else {
        reactApplicationContext.startService(intent)
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(
        "RECORDING_FOREGROUND_SERVICE_START_FAILED",
        "Could not start Android's camera foreground service.",
        error,
      )
    }
  }

  @ReactMethod
  fun stopRecordingService(promise: Promise) {
    try {
      reactApplicationContext.stopService(
        Intent(reactApplicationContext, RecordingForegroundService::class.java),
      )
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject(
        "RECORDING_FOREGROUND_SERVICE_STOP_FAILED",
        "Could not stop Android's camera foreground service.",
        error,
      )
    }
  }
}
