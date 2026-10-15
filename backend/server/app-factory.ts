/**
 * Define the Express application assembly boundary.
 * Keep static assets, middleware, and SPA fallback in the application shell.
 */
import express from 'express';

/**
 * Set static-asset caching policy.
 */
function setStaticCacheHeaders(res: any, filePath: string): void {
    /**
     * PWA shell files need quick update checks, while hashed build assets and
     * install icons can use long-lived browser caches.
     */
    const fileName = filePath.split(/[\\/]/).pop() || '';

    if (filePath.endsWith('.html') || fileName === 'sw.js' || fileName === 'manifest.webmanifest') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return;
    }

    if (filePath.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
}

/**
 * Create the backend Express application.
 */
export function createBackendApp(): express.Express {
    return express();
}

/**
 * Register base middleware, health checks, and API-key boundaries.
 */
export function configureAppMiddleware(deps: any): void {
    const { app, cors, express, installMode, isAllowedCorsOrigin, validateApiKey } = deps;
    app.use(cors({
      origin: (origin: any, callback: any) => {
        callback(null, isAllowedCorsOrigin(origin));
      },
      credentials: true,
    }));
    app.use(express.json({
        limit: '50mb',
        type: (req: any) => {
            // Skip multipart/form-data requests (for file uploads like images)
            const contentType = req.headers['content-type'] || '';
            if (contentType.includes('multipart/form-data')) {
                return false;
            }
            return contentType.includes('json');
        }
    }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    // Public health check endpoint (no authentication required)
    app.get('/health', (req: any, res: any) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            installMode
        });
    });

    // Optional API key validation (if configured)
    app.use('/api', validateApiKey);
}

/**
 * Register public/dist static assets.
 */
export function registerStaticAssets(deps: any): void {
    const { app, express, path, PKG_ROOT } = deps;
    // Serve static public assets.
    app.use(express.static(path.join(PKG_ROOT, 'public'), {
        setHeaders: setStaticCacheHeaders,
    }));

    // Static files served after API routes
    // Add cache control: HTML files should not be cached, but assets can be cached
    app.use(express.static(path.join(PKG_ROOT, 'dist'), {
        setHeaders: setStaticCacheHeaders,
    }));
}

/**
 * Register API 404 handling and the SPA fallback.
 */
export function registerSpaFallback(deps: any): void {
    const { app, fs, path, PKG_ROOT, shouldServeSpaIndex } = deps;
    // Serve React app for all other routes (excluding static files)
    app.use('/api', (req: any, res: any) => {
        res.status(404).json({ error: `Unknown API route: ${req.method} ${req.originalUrl}` });
    });

    // Serve React app for all other routes (excluding static files)
    app.get('*', (req: any, res: any) => {
        // Skip static asset requests while still serving dotted workflow run ids.
        if (!shouldServeSpaIndex(req)) {
            return res.status(404).send('Not found');
        }

        // Only serve index.html for HTML routes, not for static assets
        // Static assets should already be handled by express.static middleware above
        const indexPath = path.join(PKG_ROOT, 'dist/index.html');

        // Check if dist/index.html exists (production build available)
        if (fs.existsSync(indexPath)) {
            // Set no-cache headers for HTML to prevent service worker issues
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.sendFile(indexPath);
        } else {
            // In development, redirect to Vite dev server only if dist doesn't exist
            res.redirect(`http://localhost:${process.env.VITE_PORT || 5173}`);
        }
    });
}
