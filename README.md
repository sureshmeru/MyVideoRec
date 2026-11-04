# MileVDO Meru

MileVDO Meru is a bare React Native application built with TypeScript. It records local video with
React Native VisionCamera, indexes finalized clips in SQLite, and provides local playback and
protection controls. It does not need a backend for local recording.

Read [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for phase gates and
[FEATURE_SUPPORT.md](./FEATURE_SUPPORT.md) for the current tested/device-dependent support matrix.

## Requirements

- Node.js 18 or newer and npm.
- Android Studio, Android SDK, and a physical Android device for camera testing.
- macOS with Xcode and CocoaPods for iOS native builds. iOS builds cannot be produced from Windows.
- A development build installed on a physical device; camera hardware and permissions are not
  available in ordinary simulator-only runs.

## Install and run

```sh
npm install
npm start
```

In another terminal:

```sh
npm run android
```

For iOS, on macOS:

```sh
cd ios
pod install
cd ..
npm run ios
```

The native projects are bare React Native projects, not Expo Go projects. Native packages are
autolinked; after installing or upgrading native dependencies, install iOS pods and rebuild the
native app. The JavaScript bundle alone cannot add native camera support to an already-installed
binary.

## Live object detection

The Camera tab presents a full-screen live preview with recording controls and includes a bundled YOLOX-Nano COCO TensorFlow Lite model from
[litert-community/yolox-nano-litert](https://huggingface.co/litert-community/yolox-nano-litert/tree/50af9253fff11c508b10f462512caa1b61818f6d)
(Apache-2.0; SHA-256 `3a621c40141760da2435891093616e4d8cfa8748000c72ced4e536d694f970e4`).
The detector runs on the rear-camera frame processor at up to 5 FPS, drops frames while inference
is busy, letterboxes to 416×416 BGR, decodes the model's documented 3549×85 output, and draws
road-relevant COCO boxes with Skia. Detection output is frame-local; tracking IDs are intentionally
unset until a tracker is implemented.

Recorded camera segments are finalized with a compass heading, local time and date, and GPS speed
burned into the video. Location access is requested when recording starts; if unavailable, the speed
is shown as `-- KMPH`. Overlay processing re-encodes each segment, so saving can take longer than
the recording itself.

The model recognizes COCO classes only, including cars, motorcycles, bicycles, buses, trucks,
people, selected animals, traffic lights, and stop signs. It does not recognize auto-rickshaws,
Indian speed-limit signs, arbitrary road obstacles, or the full set of traffic signs. It estimates
no distances or collision risk. On Android the model uses the default CPU delegate; on iOS it requests
Core ML. Android copies the source model into a generated `res/raw` resource and loads it locally,
so model initialization does not depend on Metro or network access. iOS loads the model from the
React Native asset bundle. AI is reported unavailable if the model/delegate cannot initialize,
without substituting mock results. Device performance and iOS integration still require
physical-device validation. The tested x86_64 Android emulator could not initialize its GPU
delegate; this is reported as unavailable rather than silently switching to CPU inference.

## Permissions and privacy

- The app opens on the full-screen Camera tab and requests camera access for its live preview when needed.
  Recording also requires camera access. If permission is denied, use the on-screen action to try
  again or change access in system settings.
- Microphone access is requested only when audio is enabled in Camera settings and a recording is
  started. Audio is off by default.
- Android starts a camera foreground service while recording. Android 14 and later require
  foreground-service camera permissions; the microphone service type and permission are used when
  audio is enabled. Android 13 and later may ask for notification permission so the ongoing
  recording notification is visible. Denying notification permission does not prevent recording,
  but Android may hide the notification from the notification drawer.
- Foreground trip location is requested only when you start trip tracking. The app ends tracking if
  it backgrounds; it does not request background-location permission.
- Android uses app-private storage; no broad filesystem permission is requested.
- Cloud accounts are not connected in this implementation. No provider tokens are collected.
- Trip coordinates are stored locally only for explicitly started trips. Recording segments include
  the last available trip coordinate; location is null when trip tracking is off.
- On Android, an active VisionCamera session remains active across screen-lock, app-background, and
  tab-focus transitions while the camera/microphone foreground service runs. The service must be
  started while the app is visible and camera/microphone permissions must be granted. Device/OEM
  camera policy, privacy controls, thermal limits, or process termination can still interrupt
  capture; validate locked-screen recording on each target device.
- iOS suspends camera capture when the app is locked or sent to the background; locked-screen
  recording is not supported on iOS by this implementation.

## Local data

Videos are moved from VisionCamera's temporary output into the app's private documents directory
before metadata is inserted into the local SQLite database. The database schema is versioned in
`src/data/migrations/`. A clip is shown in the library only after the video is finalized and its
metadata write succeeds. Clips can be renamed, protected, played, shared through the system share
sheet, or manually deleted. If indexing fails, the error is surfaced and the file is retained for
recovery rather than being silently discarded.

The storage screen supports manual protection and deletion. Optional automatic cleanup is off by
default; when enabled, it removes the oldest eligible unprotected clips if free space falls below
512 MB and aims to restore approximately 1 GB. Protected and queued/transferring clips are skipped.
If cleanup cannot restore the 512 MB minimum, recording stops.

Trip tracking is opt-in and foreground-only. GPS fixes with poor reported accuracy are discarded;
speed and distance values are estimates and are not certified vehicle measurements.

On Android devices that report front/rear concurrent camera support, Record can start two
same-time camera streams and save one clip per camera per segment. Audio, if enabled, is recorded
only on the selected primary camera. This capability has not been verified on physical hardware.
The current iOS capture implementation supports one camera at a time; it does not use
`AVCaptureMultiCamSession`. On iOS, recording is finalized when the app leaves the foreground.

## Checks

```sh
npx tsc --noEmit
npx eslint App.tsx src __tests__ jest.setup.js jest.config.js
npm test -- --runInBand
```

On Windows systems where npm scripts cannot resolve the configured command shell, run Jest
directly with:

```powershell
node node_modules\jest\bin\jest.js --runInBand
```

Android native build:

```powershell
cd android
.\gradlew.bat :app:assembleDebug
```

For an x86_64 emulator using Metro on port 8083:

```powershell
.\gradlew.bat :app:installDebug -PreactNativeArchitectures=x86_64 -PreactNativeDevServerPort=8083
```

The project declares NDK 27.1.12297006, and some native dependencies use the Android Gradle
Plugin's default NDK. In this environment that also required NDK 26.1.10909125; install any NDK
version requested by Gradle through Android Studio's SDK Manager. The emulator smoke build and
installation were verified on Windows; physical-device inference and iOS builds remain unverified
here.

These automated checks do not replace physical-device testing. Before relying on the app, test
camera permissions, front/rear selection, segment finalization, app backgrounding, low storage,
thermal behavior, GPS permissions, and playback on the exact device and OS version in use.
