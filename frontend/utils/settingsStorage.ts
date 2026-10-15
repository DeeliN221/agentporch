// PURPOSE: Centralize provider-neutral browser settings persistence.
export const AGENTPORCH_SETTINGS_KEY = 'agentporch-settings';

type StoredSettings = {
  lastUpdated?: string;
  [key: string]: unknown;
};

/**
 * Parse a settings blob from localStorage without letting malformed data escape.
 */
const parseSettings = (raw: string | null): StoredSettings => {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as StoredSettings : {};
  } catch {
    return {};
  }
};

/**
 * Read the active provider-neutral settings.
 */
export const readAgentPorchSettings = (): StoredSettings => {
  try {
    return parseSettings(localStorage.getItem(AGENTPORCH_SETTINGS_KEY));
  } catch {
    return {};
  }
};
