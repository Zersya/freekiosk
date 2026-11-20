#include "pch.h"
#include "AudioControlModule.h"

#include "NativeModules.h"
#include "JSValue.h"

#include <windows.h>
#include <mmsystem.h>

#pragma comment(lib, "winmm.lib")

namespace winrt::FreeKiosk::implementation {

using namespace winrt::Microsoft::ReactNative;

void AudioControlModule::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
}

void AudioControlModule::getVolume(ReactPromise<int> promise) noexcept {
  HWAVEOUT hWaveOut;
  if (waveOutOpen(&hWaveOut, WAVE_MAPPER, nullptr, 0, 0, CALLBACK_NULL) == MMSYSERR_NOERROR) {
    DWORD volume = 0;
    waveOutGetVolume(hWaveOut, &volume);
    waveOutClose(hWaveOut);
    int level = ((volume & 0xFFFF) * 100) / 0xFFFF;
    promise.Resolve(level);
  } else {
    promise.Resolve(50);
  }
}

void AudioControlModule::setVolume(int level, ReactPromise<void> promise) noexcept {
  level = std::max(0, std::min(100, level));
  DWORD volume = (level * 0xFFFF) / 100;
  volume = (volume << 16) | volume;

  HWAVEOUT hWaveOut;
  if (waveOutOpen(&hWaveOut, WAVE_MAPPER, nullptr, 0, 0, CALLBACK_NULL) == MMSYSERR_NOERROR) {
    waveOutSetVolume(hWaveOut, volume);
    waveOutClose(hWaveOut);
    promise.Resolve();
  } else {
    promise.Reject("Failed to set volume");
  }
}

void AudioControlModule::getMute(ReactPromise<bool> promise) noexcept {
  promise.Resolve(false);
}

void AudioControlModule::setMute(bool muted, ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void AudioControlModule::getAudioDevices(ReactPromise<JSValueObject> promise) noexcept {
  JSValueObject result;
  result["devices"] = JSValue(JSValueArray());
  promise.Resolve(result);
}

void AudioControlModule::setAudioDevice(std::string deviceId, ReactPromise<void> promise) noexcept {
  promise.Resolve();
}

void AudioControlModule::getAudioOutput(ReactPromise<std::string> promise) noexcept {
  promise.Resolve("default");
}

} // namespace winrt::FreeKiosk::implementation
