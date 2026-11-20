export interface CertificateInfo {
  fingerprint: string;
  url: string;
  expiryTime: number;
  expiryDate: string;
  isExpired: boolean;
}

interface ICertificateModule {
  clearAcceptedCertificates(): Promise<boolean>;
  getAcceptedCertificates(): Promise<CertificateInfo[]>;
  removeCertificate(fingerprint: string): Promise<boolean>;
}

const CertificateModule: ICertificateModule = {
  clearAcceptedCertificates: () => Promise.resolve(true),
  getAcceptedCertificates: () => Promise.resolve([]),
  removeCertificate: () => Promise.resolve(true),
};

export default CertificateModule;
