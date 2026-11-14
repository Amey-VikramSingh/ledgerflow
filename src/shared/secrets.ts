import { config } from '../config';
import { createSecretBox } from './secret-box';

/** The app-wide secret box, keyed from SECRETS_ENCRYPTION_KEY. */
export const secretBox = createSecretBox(config.SECRETS_ENCRYPTION_KEY);
