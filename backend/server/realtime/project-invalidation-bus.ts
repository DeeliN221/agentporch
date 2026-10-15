/**
 * Define the debounced project-list invalidation bus.
 * Coalesce watcher event bursts before broadcasting public refreshes.
 */

/**
 * Create the project invalidation bus.
 */
export function createProjectInvalidationBus(deps: any) {
    const { pendingProjectListInvalidations, debounceMs = 100, publish } = deps;

    return {
        invalidate({ reason = 'change', changedProjectPath = '' } = {}) {
            const scopeKey = `${reason}:${changedProjectPath}`;
            const existingTimer = pendingProjectListInvalidations.get(scopeKey);
            if (existingTimer) {
                clearTimeout(existingTimer);
            }
            const timer = setTimeout(() => {
                pendingProjectListInvalidations.delete(scopeKey);
                publish?.({ reason, changedProjectPath });
            }, debounceMs);
            pendingProjectListInvalidations.set(scopeKey, timer);
        },
    };
}
