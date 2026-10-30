import type {Recording} from '../../data/models';

export type CloudProviderId = 'google-drive' | 'onedrive' | 'dropbox';

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpirationDate?: string;
  tokenType: string;
}

export interface ProviderConfiguration {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
}

export interface ProviderUploadReceipt {
  remoteFileId: string;
  remoteName: string;
  checksum?: string;
}

export interface StorageProvider {
  readonly id: CloudProviderId;
  readonly displayName: string;
  authorize(configuration: ProviderConfiguration): Promise<OAuthTokenSet>;
  upload(
    recording: Recording,
    token: OAuthTokenSet,
    onProgress: (progress: UploadProgress) => void,
    signal?: AbortSignal,
  ): Promise<ProviderUploadReceipt>;
  verifyUpload(
    receipt: ProviderUploadReceipt,
    token: OAuthTokenSet,
    expectedSizeBytes: number,
  ): Promise<boolean>;
  cancelUpload?(uploadId: string): Promise<void>;
  disconnect(token: OAuthTokenSet): Promise<void>;
}
