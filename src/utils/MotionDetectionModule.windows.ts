interface IMotionDetectionModule {
  compareImages(imagePath: string, threshold: number): Promise<boolean>;
  reset(): Promise<boolean>;
}

const MotionDetectionModule: IMotionDetectionModule = {
  compareImages: () => Promise.resolve(false),
  reset: () => Promise.resolve(true),
};

export default MotionDetectionModule;
