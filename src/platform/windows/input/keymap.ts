/**
 * Key mapping for Windows input injection.
 * Maps logical keys to Windows virtual key codes and scan codes.
 */

export interface KeyMapping {
  key: string;
  vkCode: number;
  scanCode: number;
  name: string;
}

// Windows Virtual Key Codes
export const VK = {
  BACK: 0x08,
  TAB: 0x09,
  RETURN: 0x0d,
  SHIFT: 0x10,
  CONTROL: 0x11,
  MENU: 0x12, // ALT
  PAUSE: 0x13,
  CAPITAL: 0x14,
  ESCAPE: 0x1b,
  SPACE: 0x20,
  PRIOR: 0x21, // PAGE UP
  NEXT: 0x22, // PAGE DOWN
  END: 0x23,
  HOME: 0x24,
  LEFT: 0x25,
  UP: 0x26,
  RIGHT: 0x27,
  DOWN: 0x28,
  SELECT: 0x29,
  PRINT: 0x2a,
  EXECUTE: 0x2b,
  SNAPSHOT: 0x2c, // PRINT SCREEN
  INSERT: 0x2d,
  DELETE: 0x2e,
  HELP: 0x2f,
  '0': 0x30,
  '1': 0x31,
  '2': 0x32,
  '3': 0x33,
  '4': 0x34,
  '5': 0x35,
  '6': 0x36,
  '7': 0x37,
  '8': 0x38,
  '9': 0x39,
  'A': 0x41,
  'B': 0x42,
  'C': 0x43,
  'D': 0x44,
  'E': 0x45,
  'F': 0x46,
  'G': 0x47,
  'H': 0x48,
  'I': 0x49,
  'J': 0x4a,
  'K': 0x4b,
  'L': 0x4c,
  'M': 0x4d,
  'N': 0x4e,
  'O': 0x4f,
  'P': 0x50,
  'Q': 0x51,
  'R': 0x52,
  'S': 0x53,
  'T': 0x54,
  'U': 0x55,
  'V': 0x56,
  'W': 0x57,
  'X': 0x58,
  'Y': 0x59,
  'Z': 0x5a,
  NUMPAD0: 0x60,
  NUMPAD1: 0x61,
  NUMPAD2: 0x62,
  NUMPAD3: 0x63,
  NUMPAD4: 0x64,
  NUMPAD5: 0x65,
  NUMPAD6: 0x66,
  NUMPAD7: 0x67,
  NUMPAD8: 0x68,
  NUMPAD9: 0x69,
  MULTIPLY: 0x6a,
  ADD: 0x6b,
  SEPARATOR: 0x6c,
  SUBTRACT: 0x6d,
  DECIMAL: 0x6e,
  DIVIDE: 0x6f,
  F1: 0x70,
  F2: 0x71,
  F3: 0x72,
  F4: 0x73,
  F5: 0x74,
  F6: 0x75,
  F7: 0x76,
  F8: 0x77,
  F9: 0x78,
  F10: 0x79,
  F11: 0x7a,
  F12: 0x7b,
  NUMLOCK: 0x90,
  SCROLL: 0x91,
  OEM_1: 0xba, // ;:
  OEM_PLUS: 0xbb, // =+
  OEM_COMMA: 0xbc, // ,<
  OEM_MINUS: 0xbd, // ->
  OEM_PERIOD: 0xbe, // .>
  OEM_2: 0xbf, // /?
  OEM_3: 0xc0, // `~
  OEM_4: 0xdb, // [{
  OEM_5: 0xdc, // \|
  OEM_6: 0xdd, // ]}
  OEM_7: 0xde, // '"
} as const;

// Key name to VK mapping
export const KEY_MAP: Record<string, number> = {
  backspace: VK.BACK,
  tab: VK.TAB,
  enter: VK.RETURN,
  return: VK.RETURN,
  shift: VK.SHIFT,
  control: VK.CONTROL,
  ctrl: VK.CONTROL,
  alt: VK.MENU,
  escape: VK.ESCAPE,
  esc: VK.ESCAPE,
  space: VK.SPACE,
  pageup: VK.PRIOR,
  pagedown: VK.NEXT,
  end: VK.END,
  home: VK.HOME,
  left: VK.LEFT,
  up: VK.UP,
  right: VK.RIGHT,
  down: VK.DOWN,
  insert: VK.INSERT,
  delete: VK.DELETE,
  printscreen: VK.SNAPSHOT,
  numlock: VK.NUMLOCK,
  scrolllock: VK.SCROLL,
  pause: VK.PAUSE,
  capslock: VK.CAPITAL,
};

// Add letter and number keys
for (let i = 0; i < 26; i++) {
  KEY_MAP[String.fromCharCode(97 + i)] = VK[String.fromCharCode(65 + i) as keyof typeof VK];
  KEY_MAP[String.fromCharCode(65 + i)] = VK[String.fromCharCode(65 + i) as keyof typeof VK];
}
for (let i = 0; i < 10; i++) {
  KEY_MAP[String(i)] = VK[String(i) as keyof typeof VK];
}

// Function keys
for (let i = 1; i <= 12; i++) {
  KEY_MAP[`f${i}`] = VK[`F${i}` as keyof typeof VK];
  KEY_MAP[`F${i}`] = VK[`F${i}` as keyof typeof VK];
}

// Special keys
KEY_MAP[';'] = VK.OEM_1;
KEY_MAP['='] = VK.OEM_PLUS;
KEY_MAP[','] = VK.OEM_COMMA;
KEY_MAP['-'] = VK.OEM_MINUS;
KEY_MAP['.'] = VK.OEM_PERIOD;
KEY_MAP['/'] = VK.OEM_2;
KEY_MAP['`'] = VK.OEM_3;
KEY_MAP['['] = VK.OEM_4;
KEY_MAP['\\'] = VK.OEM_5;
KEY_MAP[']'] = VK.OEM_6;
KEY_MAP["'"] = VK.OEM_7;

export function getVkCode(key: string): number | undefined {
  return KEY_MAP[key.toLowerCase()] ?? KEY_MAP[key];
}

export function isValidKey(key: string): boolean {
  return getVkCode(key) !== undefined;
}

export function getKeyName(vkCode: number): string | undefined {
  for (const [name, code] of Object.entries(KEY_MAP)) {
    if (code === vkCode) {
      return name;
    }
  }
  return undefined;
}
