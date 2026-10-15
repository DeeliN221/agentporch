/**
 * Initialize AgentPorch user configuration before loading database and server modules.
 */
import { initializeRuntimeUserState } from './runtime-user-state.js';

export const runtimeUserState = await initializeRuntimeUserState();
