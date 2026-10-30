import * as Keychain from 'react-native-keychain';

import type {CloudProviderId, OAuthTokenSet} from './StorageProvider';

const serviceFor = (providerId: CloudProviderId) =>
  `com.roadwatch.dashcam.oauth.${providerId}`;

function isOAuthTokenSet(value: unknown): value is OAuthTokenSet {
  if (typeof value !== 'object' || value === null || !('accessToken' in value)) {
    return false;
  }
  return (
    typeof value.accessToken === 'string' &&
    value.accessToken.length > 0 &&
    'tokenType' in value &&
    typeof value.tokenType === 'string' &&
    (!('refreshToken' in value) || typeof value.refreshToken === 'string') &&
    (!('accessTokenExpirationDate' in value) ||
      typeof value.accessTokenExpirationDate === 'string')
  );
}

export async function saveProviderTokens(
  providerId: CloudProviderId,
  tokens: OAuthTokenSet,
): Promise<void> {
  if (!tokens.accessToken.trim()) {
    throw new Error('An empty access token cannot be stored.');
  }
  await Keychain.setGenericPassword('oauth', JSON.stringify(tokens), {
    service: serviceFor(providerId),
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function readProviderTokens(
  providerId: CloudProviderId,
): Promise<OAuthTokenSet | null> {
  const credentials = await Keychain.getGenericPassword({
    service: serviceFor(providerId),
  });
  if (!credentials) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(credentials.password);
  } catch {
    throw new Error(`Stored ${providerId} credentials are invalid JSON.`);
  }
  if (!isOAuthTokenSet(parsed)) {
    throw new Error(`Stored ${providerId} credentials do not contain a valid access token.`);
  }
  return parsed;
}

export async function removeProviderTokens(providerId: CloudProviderId): Promise<void> {
  await Keychain.resetGenericPassword({service: serviceFor(providerId)});
}
