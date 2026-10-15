/**
 * Define shared dependency-injection types for HTTP route registration.
 * Keep injected app, authentication, data, and workflow contracts explicit rather than using any.
 */

import type { RequestHandler } from 'express';

export type HttpRouteApp = {
    get(path: string, ...handlers: RequestHandler[]): unknown;
    post(path: string, ...handlers: RequestHandler[]): unknown;
    put(path: string, ...handlers: RequestHandler[]): unknown;
    delete(path: string, ...handlers: RequestHandler[]): unknown;
};

export type AuthMiddleware = RequestHandler;

export type LooseRecord = Record<string, unknown>;

export type ProjectLike = LooseRecord & {
    name?: string;
    routePath?: string;
    path?: string;
    fullPath?: string;
};

export type WorkflowLike = LooseRecord & {
    id?: string;
    name?: string;
};

export type ProjectInvalidationEvent = {
    reason: string;
    changedProjectPath?: string;
};

export type HeavyReadCoalescer = {
    run<T>(key: string, producer: () => T | Promise<T>): Promise<T>;
};

export type FsPromisesDeps = {
    stat(path: string): Promise<{ isDirectory(): boolean }>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
    unlink(path: string): Promise<unknown>;
    readFile(path: string, encoding: BufferEncoding): Promise<string>;
};

export type PathDeps = {
    join(...paths: string[]): string;
};

export type OsDeps = {
    homedir(): string;
};

export type ChildProcessLike = {
    stdout: { on(event: 'data', listener: (data: Buffer) => void): unknown };
    stderr: { on(event: 'data', listener: (data: Buffer) => void): unknown };
    on(event: 'close', listener: (code: number | null) => void): unknown;
    on(event: 'error', listener: (error: Error) => void): unknown;
};

export type SpawnDeps = (command: string, args: string[], options: LooseRecord) => ChildProcessLike;

export type FetchDeps = typeof fetch;

export type UploadedFileLike = {
    path: string;
    originalname?: string;
    mimetype?: string;
    buffer?: Buffer;
};
