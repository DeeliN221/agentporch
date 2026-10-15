/**
 * Define console output emitted after backend startup.
 * Keep operational banners separate from database, HTTP, and WebSocket lifecycle implementation.
 */

/**
 * Print the service-ready banner.
 */
export function printStartupBanner(deps: any): void {
    /**
     * PURPOSE: Preserve the existing operator-facing output while keeping the
     * bootstrap listen callback focused on follow-up startup work.
     */
    const { c, appInstallPath, displayHost, port } = deps;

    console.log('');
    console.log(c.dim('═'.repeat(63)));
    console.log(`  ${c.bright('agentporch Server - Ready')}`);
    console.log(c.dim('═'.repeat(63)));
    console.log('');
    console.log(`${c.info('[INFO]')} Server URL:  ${c.bright('http://' + displayHost + ':' + port)}`);
    console.log(`${c.info('[INFO]')} Installed at: ${c.dim(appInstallPath)}`);
    console.log(`${c.tip('[TIP]')}  Run "agentporch status" for full configuration details`);
    console.log('');
}
