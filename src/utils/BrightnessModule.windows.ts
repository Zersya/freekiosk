const BrightnessModule = {
  async setBrightnessLevel(_brightnessLevel: number): Promise<void> {
    // Brightness control is not in the Windows port's scope.
  },

  async getBrightnessLevel(): Promise<number> {
    return 1;
  },
};

export default BrightnessModule;
