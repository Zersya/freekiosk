const CookieManager = {
  clearAll: async (): Promise<boolean> => {
    console.warn('[cookies] clearAll is not supported on Windows');
    return false;
  },
};

export default CookieManager;
