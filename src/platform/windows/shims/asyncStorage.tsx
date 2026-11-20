import { NativeModules } from 'react-native';

const { KioskModule } = NativeModules;

const STORE_PATH = 'freekiosk_storage.json';

let store: Record<string, string> = {};
let initialized = false;
let initPromise: Promise<void> | null = null;

async function init(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const exists = await KioskModule.fileExists(STORE_PATH);
      if (exists) {
        const data = await KioskModule.readFile(STORE_PATH);
        store = JSON.parse(data);
      }
    } catch {
      store = {};
    }
    initialized = true;
  })();

  return initPromise;
}

async function save(): Promise<void> {
  try {
    await KioskModule.writeFile(STORE_PATH, JSON.stringify(store));
  } catch {
    // Ignore write errors
  }
}

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    await init();
    return store[key] ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    await init();
    store[key] = value;
    await save();
  },

  async removeItem(key: string): Promise<void> {
    await init();
    delete store[key];
    await save();
  },

  async multiGet(keys: string[]): Promise<[string, string | null][]> {
    await init();
    return keys.map(key => [key, store[key] ?? null]);
  },

  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    await init();
    for (const [key, value] of keyValuePairs) {
      store[key] = value;
    }
    await save();
  },

  async multiRemove(keys: string[]): Promise<void> {
    await init();
    for (const key of keys) {
      delete store[key];
    }
    await save();
  },

  async getAllKeys(): Promise<string[]> {
    await init();
    return Object.keys(store);
  },

  async clear(): Promise<void> {
    await init();
    store = {};
    await save();
  },
};

export default AsyncStorage;
