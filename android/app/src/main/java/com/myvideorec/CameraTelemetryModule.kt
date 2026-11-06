package com.myvideorec

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.util.Size
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.OverlayEffect
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import com.google.common.collect.ImmutableList
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

@UnstableApi
class CameraTelemetryModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), SensorEventListener {
  private val sensorManager =
    reactContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
  private val rotationMatrix = FloatArray(9)
  private val orientation = FloatArray(3)
  private var activeTransformer: Transformer? = null

  override fun getName(): String = "RoadwatchCameraTelemetry"

  @ReactMethod
  fun startHeadingUpdates() {
    rotationSensor?.let {
      sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
    }
  }

  @ReactMethod
  fun stopHeadingUpdates() {
    sensorManager.unregisterListener(this)
  }

  @ReactMethod
  @Suppress("UNUSED_PARAMETER")
  fun addListener(eventName: String) = Unit

  @ReactMethod
  @Suppress("UNUSED_PARAMETER")
  fun removeListeners(count: Int) = Unit

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor.type != Sensor.TYPE_ROTATION_VECTOR) return
    SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
    SensorManager.getOrientation(rotationMatrix, orientation)
    val degrees = (Math.toDegrees(orientation[0].toDouble()) + 360.0) % 360.0
    val payload = Arguments.createMap().apply {
      putDouble("headingDegrees", degrees)
    }
    if (reactContext.hasActiveReactInstance()) {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("onCameraHeadingChanged", payload)
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

  @ReactMethod
  fun applyVideoOverlay(
    inputPath: String,
    outputPath: String,
    startTimeMs: Double,
    samples: ReadableArray,
    speedUnit: String,
    promise: Promise,
  ) {
    val inputFile = File(inputPath)
    val outputFile = File(outputPath)
    if (!inputFile.isFile || inputFile.length() <= 0L) {
      promise.reject("VIDEO_OVERLAY_INPUT", "The source video is missing or empty.")
      return
    }
    outputFile.parentFile?.mkdirs()
    if (outputFile.exists() && !outputFile.delete()) {
      promise.reject("VIDEO_OVERLAY_OUTPUT", "Could not prepare the overlaid video file.")
      return
    }
    val telemetry = parseSamples(samples)
    UiThreadUtil.runOnUiThread {
      try {
        if (activeTransformer != null) {
          promise.reject(
            "VIDEO_OVERLAY_BUSY",
            "Another recorded video is still being processed.",
          )
          return@runOnUiThread
        }
        val overlay = TelemetryOverlay(startTimeMs.toLong(), telemetry, speedUnit)
        val editedMediaItem =
          EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(inputFile)))
            .setEffects(
              Effects(
                emptyList(),
                listOf(OverlayEffect(ImmutableList.of(overlay))),
              ),
            )
            .build()
        val transformer = Transformer.Builder(reactContext)
          .addListener(
            object : Transformer.Listener {
              override fun onCompleted(
                composition: androidx.media3.transformer.Composition,
                exportResult: ExportResult,
              ) {
                activeTransformer = null
                if (outputFile.isFile && outputFile.length() > 0L) {
                  promise.resolve(null)
                } else {
                  promise.reject(
                    "VIDEO_OVERLAY_EMPTY",
                    "The video overlay export completed without a usable file.",
                  )
                }
              }

              override fun onError(
                composition: androidx.media3.transformer.Composition,
                exportResult: ExportResult,
                exportException: ExportException,
              ) {
                activeTransformer = null
                outputFile.delete()
                promise.reject(
                  "VIDEO_OVERLAY_FAILED",
                  "Could not burn telemetry into the recorded video.",
                  exportException,
                )
              }
            },
          )
          .build()
        activeTransformer = transformer
        transformer.start(editedMediaItem, outputFile.absolutePath)
      } catch (error: Exception) {
        activeTransformer = null
        outputFile.delete()
        promise.reject(
          "VIDEO_OVERLAY_FAILED",
          "Could not start video overlay processing.",
          error,
        )
      }
    }
  }

  private fun parseSamples(samples: ReadableArray): List<TelemetrySample> =
    buildList(samples.size()) {
      for (index in 0 until samples.size()) {
        val sample = samples.getMap(index)
        add(
          TelemetrySample(
            timestampMs = sample.getDouble("timestampMs").toLong(),
            headingDegrees =
              if (sample.isNull("headingDegrees")) null else sample.getDouble("headingDegrees"),
            speedKph =
              if (sample.isNull("speedKph")) null else sample.getDouble("speedKph"),
          ),
        )
      }
    }

  private data class TelemetrySample(
    val timestampMs: Long,
    val headingDegrees: Double?,
    val speedKph: Double?,
  )

  private class TelemetryOverlay(
    private val startTimeMs: Long,
    private val samples: List<TelemetrySample>,
    private val speedUnit: String,
  ) : BitmapOverlay() {
    private var overlayBitmap: Bitmap? = null
    private var overlayCanvas: Canvas? = null
    private val backgroundPaint =
      Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xB8000000.toInt() }
    private val compassBackgroundPaint =
      Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xE8000000.toInt() }
    private val textPaint =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        textAlign = Paint.Align.CENTER
        typeface = android.graphics.Typeface.create(
          "sans-serif-medium",
          android.graphics.Typeface.BOLD,
        )
      }
    private val compassPaint =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
      }
    private val arrowPaint =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFF453A.toInt()
        style = Paint.Style.FILL
      }
    private val dateFormat = SimpleDateFormat("HH:mm:ss | dd/MM/yyyy", Locale.getDefault())
    private val box = RectF()

    override fun configure(videoSize: Size) {
      super.configure(videoSize)
      if (overlayBitmap?.width != videoSize.width || overlayBitmap?.height != videoSize.height) {
        overlayBitmap?.recycle()
        overlayBitmap =
          Bitmap.createBitmap(videoSize.width, videoSize.height, Bitmap.Config.ARGB_8888)
        overlayCanvas = Canvas(overlayBitmap!!)
      }
    }

    override fun getBitmap(presentationTimeUs: Long): Bitmap {
      val bitmap = overlayBitmap
        ?: throw IllegalStateException("The telemetry overlay was not configured.")
      val canvas = overlayCanvas
        ?: throw IllegalStateException("The telemetry overlay canvas was not configured.")
      bitmap.eraseColor(Color.TRANSPARENT)
      drawOverlay(canvas, presentationTimeUs)
      return bitmap
    }

    private fun drawOverlay(canvas: Canvas, presentationTimeUs: Long) {
      val width = canvas.width.toFloat()
      val height = canvas.height.toFloat()
      if (width <= 0f || height <= 0f) return
      val timestampMs = startTimeMs + presentationTimeUs / 1000L
      val sample = sampleAt(timestampMs)
      val density = width / 1080f
      val margin = 28f * density
      val radius = 14f * density
      val textSize = 31f * density
      textPaint.textSize = textSize
      compassPaint.strokeWidth = 3f * density

      val speedKph =
        sample?.speedKph
          ?.takeIf { it.isFinite() && it >= 0.0 && it <= 198.0 }
      val speed = speedKph
        ?.let { if (speedUnit == "mph") it / 1.609344 else it }
        ?.roundToInt()
        ?.toString() ?: "--"
      val unitLabel = if (speedUnit == "mph") "MPH" else "KM/H"
      val label = "${dateFormat.format(Date(timestampMs))} | $speed $unitLabel"
      val textWidth = textPaint.measureText(label)
      val textHeight = textPaint.descent() - textPaint.ascent()
      val boxWidth = textWidth + margin * 1.3f
      val boxHeight = textHeight + margin * 0.55f
      box.set(
        (width - boxWidth) / 2f,
        height - boxHeight - margin,
        (width + boxWidth) / 2f,
        height - margin,
      )
      canvas.drawRoundRect(box, radius, radius, backgroundPaint)
      canvas.drawText(
        label,
        width / 2f,
        box.centerY() - (textPaint.ascent() + textPaint.descent()) / 2f,
        textPaint,
      )

      val compassRadius = 64f * density
      val compassCenterX = margin + compassRadius
      val compassCenterY = margin + compassRadius
      canvas.drawCircle(compassCenterX, compassCenterY, compassRadius, compassBackgroundPaint)
      canvas.drawCircle(compassCenterX, compassCenterY, compassRadius * 0.68f, compassPaint)
      val heading = sample?.headingDegrees?.takeIf {
        it.isFinite() && it >= 0.0 && it < 360.0
      }
      if (heading != null) {
        canvas.save()
        canvas.rotate(-heading.toFloat(), compassCenterX, compassCenterY)
        val pointer = Path().apply {
          moveTo(compassCenterX, compassCenterY - compassRadius * 0.62f)
          lineTo(compassCenterX - compassRadius * 0.18f, compassCenterY + compassRadius * 0.14f)
          lineTo(compassCenterX, compassCenterY + compassRadius * 0.03f)
          lineTo(compassCenterX + compassRadius * 0.18f, compassCenterY + compassRadius * 0.14f)
          close()
        }
        canvas.drawPath(pointer, arrowPaint)
        canvas.restore()
        textPaint.textSize = 26f * density
        textPaint.textAlign = Paint.Align.LEFT
        canvas.drawText(
          "${heading.roundToInt()}°",
          compassCenterX + compassRadius + 10f * density,
          compassCenterY + textPaint.textSize / 3f,
          textPaint,
        )
        textPaint.textAlign = Paint.Align.CENTER
        textPaint.textSize = textSize
      }
    }

    private fun sampleAt(timestampMs: Long): TelemetrySample? {
      var latest: TelemetrySample? = null
      for (sample in samples) {
        if (sample.timestampMs > timestampMs) break
        latest = sample
      }
      return latest
    }
  }
}
