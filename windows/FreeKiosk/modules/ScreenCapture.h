#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include <windows.h>

namespace FreeKiosk::Capture {

struct Frame {
  std::vector<uint8_t> bytes;
  int width;
  int height;
};

enum class ImageFormat { Jpeg, Png };

SIZE PrimaryScreenSize() noexcept;

SIZE FitWithin(int w, int h, int maxDim) noexcept;

bool CapturePrimary(ImageFormat fmt, int quality, int maxDim, Frame &out, std::string &error) noexcept;

} // namespace FreeKiosk::Capture
