#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace FreeKiosk::Base64 {

inline std::string Encode(uint8_t const *data, size_t len) {
  static const char *kAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  out.reserve(((len + 2) / 3) * 4);
  for (size_t i = 0; i < len; i += 3) {
    uint32_t n = static_cast<uint32_t>(data[i]) << 16;
    bool has2 = i + 1 < len;
    bool has3 = i + 2 < len;
    if (has2) n |= static_cast<uint32_t>(data[i + 1]) << 8;
    if (has3) n |= static_cast<uint32_t>(data[i + 2]);
    out += kAlphabet[(n >> 18) & 0x3F];
    out += kAlphabet[(n >> 12) & 0x3F];
    out += has2 ? kAlphabet[(n >> 6) & 0x3F] : '=';
    out += has3 ? kAlphabet[n & 0x3F] : '=';
  }
  return out;
}

inline bool Decode(std::string_view in, std::vector<uint8_t> &out) {
  auto decodeChar = [](char c) -> int {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
  };

  std::vector<uint8_t> cleaned;
  cleaned.reserve(in.size());
  for (char c : in) {
    if (c == ' ' || c == '\r' || c == '\n' || c == '\t') continue;
    cleaned.push_back(static_cast<uint8_t>(c));
  }
  if (cleaned.size() % 4 != 0) return false;

  out.clear();
  out.reserve((cleaned.size() / 4) * 3);
  for (size_t i = 0; i < cleaned.size(); i += 4) {
    uint8_t c0 = cleaned[i];
    uint8_t c1 = cleaned[i + 1];
    uint8_t c2 = cleaned[i + 2];
    uint8_t c3 = cleaned[i + 3];
    bool lastGroup = (i + 4 == cleaned.size());
    if (c0 == '=' || c1 == '=') return false;
    if (c2 == '=' && (c3 != '=' || !lastGroup)) return false;
    if (c3 == '=' && !lastGroup) return false;
    int v0 = decodeChar((char)c0);
    int v1 = decodeChar((char)c1);
    int v2 = (c2 == '=') ? 0 : decodeChar((char)c2);
    int v3 = (c3 == '=') ? 0 : decodeChar((char)c3);
    if (v0 < 0 || v1 < 0 || (c2 != '=' && v2 < 0) || (c3 != '=' && v3 < 0)) return false;
    uint32_t n = (v0 << 18) | (v1 << 12) | (v2 << 6) | v3;
    out.push_back((n >> 16) & 0xFF);
    if (c2 != '=') out.push_back((n >> 8) & 0xFF);
    if (c3 != '=') out.push_back(n & 0xFF);
  }
  return true;
}

} // namespace FreeKiosk::Base64
