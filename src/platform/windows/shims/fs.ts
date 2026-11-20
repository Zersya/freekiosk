const RNFS = {
  DownloadDirectoryPath: '',
  DocumentDirectoryPath: '',
  exists: (): Promise<boolean> =>
    Promise.reject(new Error('react-native-fs is not available on Windows')),
  mkdir: (): Promise<void> =>
    Promise.reject(new Error('react-native-fs is not available on Windows')),
  writeFile: (): Promise<void> =>
    Promise.reject(new Error('react-native-fs is not available on Windows')),
  readDir: (): Promise<unknown[]> =>
    Promise.reject(new Error('react-native-fs is not available on Windows')),
  readFile: (): Promise<string> =>
    Promise.reject(new Error('react-native-fs is not available on Windows')),
  unlink: (): Promise<void> =>
    Promise.reject(new Error('react-native-fs is not available on Windows')),
};

export default RNFS;
