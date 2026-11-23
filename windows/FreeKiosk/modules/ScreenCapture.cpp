#include "pch.h"
#include "ScreenCapture.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <wincodec.h>
#include <wrl/client.h>
#include <combaseapi.h>

#pragma comment(lib, "windowscodecs.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "ole32.lib")

namespace FreeKiosk::Capture {

namespace {

std::string HresultError(char const *what, HRESULT hr) {
  char buf[96];
  snprintf(buf, sizeof(buf), "%s: 0x%08X", what, static_cast<unsigned>(hr));
  return std::string(buf);
}

} // namespace

SIZE PrimaryScreenSize() noexcept {
  SIZE size;
  size.cx = GetSystemMetrics(SM_CXSCREEN);
  size.cy = GetSystemMetrics(SM_CYSCREEN);
  return size;
}

SIZE FitWithin(int w, int h, int maxDim) noexcept {
  if (maxDim <= 0 || std::max(w, h) <= maxDim) {
    return {w, h};
  }
  double scale = static_cast<double>(maxDim) / static_cast<double>(std::max(w, h));
  return {static_cast<LONG>(std::lround(w * scale)), static_cast<LONG>(std::lround(h * scale))};
}

bool CapturePrimary(ImageFormat fmt, int quality, int maxDim, Frame &out, std::string &error) noexcept {
  SIZE screen = PrimaryScreenSize();
  if (screen.cx <= 0 || screen.cy <= 0) {
    error = "Could not determine screen size";
    return false;
  }

  SIZE target = FitWithin(static_cast<int>(screen.cx), static_cast<int>(screen.cy), maxDim);
  out.width = target.cx;
  out.height = target.cy;

  // --- GDI capture into a top-down 32-bpp DIB section ---
  HDC screenDC = GetDC(nullptr);
  if (!screenDC) {
    error = "GetDC failed";
    return false;
  }

  HDC memDC = CreateCompatibleDC(screenDC);
  if (!memDC) {
    error = "CreateCompatibleDC failed";
    ReleaseDC(nullptr, screenDC);
    return false;
  }

  BITMAPINFO bmi = {};
  bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
  bmi.bmiHeader.biWidth = target.cx;
  bmi.bmiHeader.biHeight = -target.cy; // top-down
  bmi.bmiHeader.biPlanes = 1;
  bmi.bmiHeader.biBitCount = 32;
  bmi.bmiHeader.biCompression = BI_RGB;

  void *bits = nullptr;
  HBITMAP dib = CreateDIBSection(memDC, &bmi, DIB_RGB_COLORS, &bits, nullptr, 0);
  if (!dib || !bits) {
    error = "CreateDIBSection failed";
    if (dib) DeleteObject(dib);
    DeleteDC(memDC);
    ReleaseDC(nullptr, screenDC);
    return false;
  }

  BOOL copied;
  {
    HGDIOBJ oldBmp = SelectObject(memDC, dib);
    if (target.cx == screen.cx && target.cy == screen.cy) {
      copied = BitBlt(memDC, 0, 0, target.cx, target.cy, screenDC, 0, 0, SRCCOPY | CAPTUREBLT);
      if (!copied) {
        error = "BitBlt failed";
      }
    } else {
      SetStretchBltMode(memDC, HALFTONE);
      SetBrushOrgEx(memDC, 0, 0, nullptr);
      copied = StretchBlt(memDC, 0, 0, target.cx, target.cy, screenDC, 0, 0, screen.cx, screen.cy,
                          SRCCOPY | CAPTUREBLT);
      if (!copied) {
        error = "StretchBlt failed";
      }
    }
    SelectObject(memDC, oldBmp);
  }

  DeleteDC(memDC);
  ReleaseDC(nullptr, screenDC);

  if (!copied) {
    DeleteObject(dib);
    return false;
  }

  // --- WIC encode ---
  const UINT stride = static_cast<UINT>(target.cx) * 4;
  const UINT imageSize = stride * static_cast<UINT>(target.cy);

  Microsoft::WRL::ComPtr<IWICImagingFactory> factory;
  HRESULT hr = CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory));
  if (FAILED(hr)) {
    error = HresultError("WIC factory failed", hr);
    DeleteObject(dib);
    return false;
  }

  Microsoft::WRL::ComPtr<IWICBitmap> bitmap;
  hr = factory->CreateBitmapFromMemory(static_cast<UINT>(target.cx), static_cast<UINT>(target.cy),
                                       GUID_WICPixelFormat32bppBGR, stride, imageSize,
                                       static_cast<BYTE *>(bits), &bitmap);
  DeleteObject(dib); // WIC copied the pixels
  if (FAILED(hr)) {
    error = HresultError("WIC bitmap failed", hr);
    return false;
  }

  Microsoft::WRL::ComPtr<IWICFormatConverter> converter;
  hr = factory->CreateFormatConverter(&converter);
  if (SUCCEEDED(hr)) {
    hr = converter->Initialize(bitmap.Get(), GUID_WICPixelFormat24bppBGR, WICBitmapDitherTypeNone, nullptr, 0.0,
                               WICBitmapPaletteTypeCustom);
  }
  if (FAILED(hr)) {
    error = HresultError("WIC convert failed", hr);
    return false;
  }

  Microsoft::WRL::ComPtr<IStream> stream;
  hr = CreateStreamOnHGlobal(nullptr, TRUE, &stream);
  if (FAILED(hr)) {
    error = HresultError("CreateStreamOnHGlobal failed", hr);
    return false;
  }

  Microsoft::WRL::ComPtr<IWICBitmapEncoder> encoder;
  GUID containerFormat = (fmt == ImageFormat::Jpeg) ? GUID_ContainerFormatJpeg : GUID_ContainerFormatPng;
  hr = factory->CreateEncoder(containerFormat, nullptr, &encoder);
  if (SUCCEEDED(hr)) {
    hr = encoder->Initialize(stream.Get(), WICBitmapEncoderNoCache);
  }
  if (FAILED(hr)) {
    error = HresultError("WIC encoder init failed", hr);
    return false;
  }

  Microsoft::WRL::ComPtr<IWICBitmapFrameEncode> frameEncode;
  Microsoft::WRL::ComPtr<IPropertyBag2> props;
  hr = encoder->CreateNewFrame(&frameEncode, &props);
  if (FAILED(hr)) {
    error = HresultError("WIC frame create failed", hr);
    return false;
  }

  if (fmt == ImageFormat::Jpeg) {
    int q = std::clamp(quality, 1, 100);
    PROPBAG2 option = {};
    option.pstrName = const_cast<LPOLESTR>(L"ImageQuality");
    VARIANT value;
    VariantInit(&value);
    value.vt = VT_R4;
    value.fltVal = static_cast<float>(q) / 100.0f;
    hr = props->Write(1, &option, &value);
    if (FAILED(hr)) {
      error = HresultError("WIC quality property failed", hr);
      return false;
    }
  }

  hr = frameEncode->Initialize(props.Get());
  if (SUCCEEDED(hr)) {
    hr = frameEncode->SetSize(static_cast<UINT>(target.cx), static_cast<UINT>(target.cy));
  }
  WICPixelFormatGUID pixelFormat = GUID_WICPixelFormat24bppBGR;
  if (SUCCEEDED(hr)) {
    hr = frameEncode->SetPixelFormat(&pixelFormat);
  }
  if (SUCCEEDED(hr)) {
    if (IsEqualGUID(pixelFormat, GUID_WICPixelFormat24bppBGR)) {
      hr = frameEncode->WriteSource(converter.Get(), nullptr);
    } else {
      // Encoder picked another format; convert to whatever it requested.
      Microsoft::WRL::ComPtr<IWICFormatConverter> converter2;
      hr = factory->CreateFormatConverter(&converter2);
      if (SUCCEEDED(hr)) {
        hr = converter2->Initialize(bitmap.Get(), pixelFormat, WICBitmapDitherTypeNone, nullptr, 0.0,
                                  WICBitmapPaletteTypeCustom);
      }
      if (SUCCEEDED(hr)) {
        hr = frameEncode->WriteSource(converter2.Get(), nullptr);
      }
    }
  }
  if (SUCCEEDED(hr)) {
    hr = frameEncode->Commit();
  }
  if (SUCCEEDED(hr)) {
    hr = encoder->Commit();
  }
  if (FAILED(hr)) {
    error = HresultError("WIC encode failed", hr);
    return false;
  }

  // Copy the stream contents into out.bytes.
  LARGE_INTEGER seek = {};
  hr = stream->Seek(seek, STREAM_SEEK_SET, nullptr);
  if (FAILED(hr)) {
    error = HresultError("Stream seek failed", hr);
    return false;
  }
  STATSTG stat = {};
  hr = stream->Stat(&stat, STATFLAG_NONAME);
  if (FAILED(hr)) {
    error = HresultError("Stream stat failed", hr);
    return false;
  }
  ULONGLONG size = stat.cbSize.QuadPart;
  if (size == 0 || size > 256ull * 1024 * 1024) {
    error = "Invalid encoded size";
    return false;
  }
  out.bytes.resize(static_cast<size_t>(size));
  ULONG readBytes = 0;
  hr = stream->Read(out.bytes.data(), static_cast<ULONG>(size), &readBytes);
  if (FAILED(hr) || readBytes != size) {
    error = HresultError("Stream read failed", hr);
    return false;
  }

  return true;
}

} // namespace FreeKiosk::Capture
