package com.myvideorec

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

class RecordingForegroundService : Service() {
  companion object {
    const val ACTION_START = "com.myvideorec.action.START_RECORDING"
    const val EXTRA_RECORD_AUDIO = "recordAudio"
    const val EXTRA_TRACK_LOCATION = "trackLocation"
    private const val CHANNEL_ID = "recording"
    private const val NOTIFICATION_ID = 1001
  }

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action != ACTION_START) {
      stopSelf(startId)
      return START_NOT_STICKY
    }

    createNotificationChannel()
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      var serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
      if (intent.getBooleanExtra(EXTRA_RECORD_AUDIO, false)) {
        serviceType = serviceType or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      }
      if (intent.getBooleanExtra(EXTRA_TRACK_LOCATION, false)) {
        serviceType = serviceType or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
      }
      startForeground(NOTIFICATION_ID, notification, serviceType)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    acquireWakeLock()
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    wakeLock?.let { lock ->
      if (lock.isHeld) {
        lock.release()
      }
    }
    wakeLock = null
    super.onDestroy()
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) {
      return
    }
    val powerManager = getSystemService(PowerManager::class.java)
    wakeLock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "$packageName:Recording",
    ).apply {
      setReferenceCounted(false)
      acquire()
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Recording",
        NotificationManager.IMPORTANCE_LOW,
      )
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  private fun buildNotification(): Notification =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(getString(R.string.app_name))
      .setContentText("Recording is active")
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()
}
