interface PrintModuleType {
  printWebView(title: string | null, paperSize: string | null): Promise<boolean>;
  isPrintAvailable(): Promise<boolean>;
  getPrintSpoolerPackages(): Promise<string[]>;
}

const PrintModule: PrintModuleType = {
  printWebView: () => Promise.reject(new Error('Printing via PrintModule is not available on Windows')),
  isPrintAvailable: () => Promise.resolve(false),
  getPrintSpoolerPackages: () => Promise.resolve([]),
};

export default PrintModule;
