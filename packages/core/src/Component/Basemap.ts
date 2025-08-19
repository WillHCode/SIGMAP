import { latLonToTile } from '../utils/geo';

export interface BasemapOptions {
    zoom: number;
    center: { lat: number; lon: number };
    minZoom?: number;
    maxZoom?: number;
    tileUrlTemplate?: string;
    zoomEasing?: number;
    tileCacheLimit?: number;
    tileFadeDurationMs?: number;
}

type TileEntry = {
    promise: Promise<HTMLImageElement | HTMLCanvasElement>;
    img?: HTMLImageElement | HTMLCanvasElement;
    failed?: boolean;
    lastUsed?: number;
    evictionTimer?: number | null;
};

export class Basemap {
    private canvas!: HTMLCanvasElement;
    private ctx!: CanvasRenderingContext2D;
    private width = 0;
    private height = 0;

    private currentZoom: number;
    private targetZoom: number;
    private readonly zoomEasing: number;
    private isZooming = false;

    private readonly center: { lat: number; lon: number };
    private readonly minZoom: number;
    private readonly maxZoom: number;

    private readonly tileUrlTemplate: string;
    private tileCache = new Map<string, TileEntry>();
    private readonly tileCacheLimit: number;

    private drawCounter = 0;
    private pendingFrame = false;

    private currentJobs: Array<any> = [];
    private activeTiles = new Map<string, { img: HTMLImageElement | HTMLCanvasElement; alpha: number; job: any }>();

    private fadeRAF: number | null = null;
    private readonly tileFadeDurationMs: number;

    // Snapshot of the last fully rendered frame (to be used as backdrop during zoom)
    private prevFrameCanvas: HTMLCanvasElement | null = null;
    private prevSnapshotZoom: number | null = null;
    private prevSnapshotCenter: { lat: number; lon: number } | null = null;

    constructor(opts: BasemapOptions) {
        const initial = Math.max(1, Math.floor(opts.zoom));
        this.currentZoom = initial;
        this.targetZoom = initial;
        this.zoomEasing = opts.zoomEasing ?? 0.2;

        this.center = opts.center;
        this.minZoom = opts.minZoom ?? 1;
        this.maxZoom = opts.maxZoom ?? 18;
        this.tileUrlTemplate = opts.tileUrlTemplate ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

        this.tileCacheLimit = opts.tileCacheLimit ?? 256;
        this.tileFadeDurationMs = opts.tileFadeDurationMs ?? 200;
    }

    public init(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2D context not supported');
        this.ctx = ctx;
        this.resize();
        this.installEventListeners();
        this.draw().then(_ => null);
    }

    private resize() {
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    private installEventListeners() {
        let isDragging = false;
        let startX = 0;
        let startY = 0;

        this.canvas.addEventListener('mousedown', e => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            this.draw().then(_ => null);
        });

        window.addEventListener('mousemove', e => {
            if (!isDragging) return;
            e.preventDefault();
            if (this.isZooming) return;

            const resolution = 360 / (256 * Math.pow(2, this.currentZoom));
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            this.center.lon -= dx * resolution;
            this.center.lat += dy * resolution;
            startX = e.clientX;
            startY = e.clientY;

            if (!this.pendingFrame) {
                this.pendingFrame = true;
                requestAnimationFrame(() => {
                    this.pendingFrame = false;
                    this.draw().then(_ => null);
                });
            }
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            this.draw().then(_ => null);
        });

        window.addEventListener('keydown', e => {
            if (e.key !== '+' && e.key !== '-' && e.key !== '=' && e.key !== '_') return;

            const delta = (e.key === '+' || e.key === '=') ? 1 : -1;
            if (this.targetZoom + delta < this.minZoom || this.targetZoom + delta > this.maxZoom) return;
            this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom + delta));

            if (!this.isZooming) {
                this.animateZoom();
            }
        });

        window.addEventListener('resize', () => {
            this.resize();
            this.draw().then(_ => null);
        });
    }

    private animateZoom() {
        this.isZooming = true;
        const step = () => {
            const diff = this.targetZoom - this.currentZoom;
            if (Math.abs(diff) < 0.001) {
                this.currentZoom = this.targetZoom;
                this.isZooming = false;
                this.draw().then(_ => null);
                return;
            }
            this.currentZoom += diff * this.zoomEasing;
            this.draw().then(_ => null);
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    private async draw() {
        const drawId = ++this.drawCounter;

        const effectiveZoom = Math.floor(this.currentZoom);
        const tileSize = 256;
        const scaleFactor = Math.pow(2, this.currentZoom - effectiveZoom);
        const tileRenderSize = tileSize * scaleFactor;
        const centerTile = latLonToTile(this.center.lat, this.center.lon, effectiveZoom);

        const halfW = this.width / tileRenderSize / 2;
        const halfH = this.height / tileRenderSize / 2;

        const startX = Math.floor(centerTile.x - halfW);
        const startY = Math.floor(centerTile.y - halfH);
        const endX = Math.ceil(centerTile.x + halfW);
        const endY = Math.ceil(centerTile.y + halfH);

        const maxTiles = Math.pow(2, effectiveZoom);

        type Job = {
            x: number;
            y: number;
            dx: number;
            dy: number;
            urlX: number;
            urlY: number;
            z: number;
            url: string;
            placementKey: string;
        };

        const jobs: Job[] = [];
        const seenPlacement = new Set<string>();

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                if (y < 0 || y >= maxTiles) continue;

                const placementKey = `${x}:${y}:${effectiveZoom}`;
                if (seenPlacement.has(placementKey)) continue;
                seenPlacement.add(placementKey);

                const urlX = ((x % maxTiles) + maxTiles) % maxTiles;
                const urlY = Math.max(0, Math.min(maxTiles - 1, y));

                const url = this.makeTileURL(urlX, urlY, effectiveZoom);

                const dxRaw = (x - centerTile.x) * tileRenderSize + this.width / 2;
                const dyRaw = (y - centerTile.y) * tileRenderSize + this.height / 2;

                const dx = Math.round(dxRaw);
                const dy = Math.round(dyRaw);

                jobs.push({ x, y, dx, dy, urlX, urlY, z: effectiveZoom, url, placementKey });
            }
        }

        this.currentJobs = jobs;
        this.activeTiles.clear();

        for (const job of jobs) {
            const entry = this.tileCache.get(job.url);
            if (entry && entry.img && !entry.failed) {
                this.activeTiles.set(job.placementKey, { img: entry.img, alpha: 1, job });
                entry.lastUsed = Date.now();
                this.tileCache.delete(job.url);
                this.tileCache.set(job.url, entry);
            }
        }

        if (drawId !== this.drawCounter) return;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.drawPrevFrameIfRelevant();

        this.repaintForDraw(drawId, tileRenderSize, scaleFactor);

        if (this.activeTiles.size === jobs.length) {
            this.snapshotPrevFrame(this.currentZoom, this.center);
        }

        for (const job of jobs) {
            if (this.activeTiles.has(job.placementKey)) continue;

            this.loadTileImage(job.url).then(img => {
                if (drawId !== this.drawCounter) return;
                // set job added time so fade loop can compute timings
                (job as any)._addedTime = performance.now();
                this.activeTiles.set(job.placementKey, { img, alpha: 0, job });

                // start fade loop (if not running)
                if (this.fadeRAF == null) {
                    this.startFadeLoop(drawId, tileRenderSize, scaleFactor);
                }
            }).catch(() => {});
        }
    }

    private drawPrevFrameIfRelevant() {
        if (!this.prevFrameCanvas || this.prevSnapshotZoom == null || !this.prevSnapshotCenter) return;

        const center = this.center;
        const eps = 1e-9;
        if (Math.abs(center.lat - this.prevSnapshotCenter.lat) > eps ||
            Math.abs(center.lon - this.prevSnapshotCenter.lon) > eps) {
            return;
        }

        const s = Math.pow(2, this.currentZoom - this.prevSnapshotZoom);
        const w = this.width;
        const h = this.height;
        const sw = w * s;
        const sh = h * s;
        const dx = (w - sw) / 2;
        const dy = (h - sh) / 2;

        this.ctx.drawImage(this.prevFrameCanvas, dx, dy, sw, sh);
    }

    private repaintForDraw(drawId: number, tileRenderSize: number, scaleFactor: number) {
        if (drawId !== this.drawCounter) return;
        // (Note: drawPrevFrameIfRelevant was already called by draw() before this, but for safety call again)
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.drawPrevFrameIfRelevant();

        for (const job of this.currentJobs) {
            const key = job.placementKey;
            const tile = this.activeTiles.get(key);
            if (!tile) continue;
            const alpha = tile.alpha ?? 1;

            const prevAlpha = this.ctx.globalAlpha;
            this.ctx.globalAlpha = alpha;
            this.ctx.drawImage(tile.img, job.dx, job.dy, tileRenderSize, tileRenderSize);
            this.ctx.globalAlpha = prevAlpha;

            // debug overlay
            this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(job.dx, job.dy, tileRenderSize, tileRenderSize);

            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            this.ctx.font = `${12 * scaleFactor}px sans-serif`;
            this.ctx.fillText(`z:${job.z} x:${job.urlX} y:${job.urlY}`, job.dx + 4, job.dy + 16 * scaleFactor);
        }
    }

    private startFadeLoop(drawId: number, tileRenderSize: number, scaleFactor: number) {
        const duration = Math.max(1, this.tileFadeDurationMs);

        const tick = () => {
            if (drawId !== this.drawCounter) {
                this.fadeRAF = null;
                return;
            }
            const now = performance.now();
            let anyAnimating = false;

            for (const [_, val] of this.activeTiles.entries()) {
                if (val.alpha >= 1) continue;
                const addedTime = (val.job as any)._addedTime ?? now;
                const elapsed = Math.max(0, now - addedTime);
                const a = Math.min(1, elapsed / duration);
                val.alpha = a;
                if (a < 1) anyAnimating = true;
            }

            this.repaintForDraw(drawId, tileRenderSize, scaleFactor);

            if (anyAnimating) {
                this.fadeRAF = requestAnimationFrame(tick);
            } else {
                this.fadeRAF = null;
                if (drawId === this.drawCounter) {
                    this.snapshotPrevFrame(this.currentZoom, this.center);
                }
            }
        };

        const now = performance.now();
        for (const [, val] of this.activeTiles.entries()) {
            if (val.alpha === 0 && (val.job as any)._addedTime === undefined) {
                (val.job as any)._addedTime = now;
            } else if ((val.job as any)._addedTime === undefined) {
                (val.job as any)._addedTime = now - duration;
            }
        }

        this.fadeRAF = requestAnimationFrame(tick);
    }

    // create an offscreen snapshot of the current canvas to reuse as backdrop during zoom
    private snapshotPrevFrame(snapshotZoom: number, snapshotCenter: { lat: number; lon: number }) {
        try {
            const off = document.createElement('canvas');
            off.width = this.width;
            off.height = this.height;
            const c = off.getContext('2d');
            if (!c) return;
            c.drawImage(this.canvas, 0, 0);
            this.prevFrameCanvas = off;
            this.prevSnapshotZoom = snapshotZoom;
            this.prevSnapshotCenter = { lat: snapshotCenter.lat, lon: snapshotCenter.lon };
        } catch {
            // ignore snapshot errors silently
            this.prevFrameCanvas = null;
            this.prevSnapshotZoom = null;
            this.prevSnapshotCenter = null;
        }
    }

    private makeTileURL(x: number, y: number, z: number) {
        return this.tileUrlTemplate
            .replace('{x}', String(x))
            .replace('{y}', String(y))
            .replace('{z}', String(z));
    }

    private loadTileImage(url: string): Promise<HTMLImageElement | HTMLCanvasElement> {
        const now = Date.now();

        if (this.tileCache.has(url)) {
            const entry = this.tileCache.get(url)!;
            entry.lastUsed = now;
            this.tileCache.delete(url);
            this.tileCache.set(url, entry);

            if (entry.img && !entry.failed) {
                return Promise.resolve(entry.img);
            }
            return entry.promise;
        }

        let resolveFn: (v: HTMLImageElement | HTMLCanvasElement) => void = () => {};
        const promise = new Promise<HTMLImageElement | HTMLCanvasElement>((resolve) => {
            resolveFn = resolve;
        });

        const entry: TileEntry = {
            promise,
            img: undefined,
            failed: false,
            lastUsed: now,
            evictionTimer: null,
        };

        this.tileCache.set(url, entry);
        this.enforceCacheLimit();

        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            entry.img = img;
            entry.failed = false;
            entry.lastUsed = Date.now();
            if (entry.evictionTimer != null) {
                clearTimeout(entry.evictionTimer);
                entry.evictionTimer = null;
            }
            entry.promise = Promise.resolve(img);
            resolveFn(img);
        };

        img.onerror = () => {
            if (!entry.failed) {
                console.warn('Tile load failed, using blank placeholder:', url);
            }
            entry.failed = true;
            const placeholder = document.createElement('canvas');
            placeholder.width = placeholder.height = 256;

            entry.img = placeholder;
            entry.promise = Promise.resolve(placeholder);
            resolveFn(placeholder);

            if (entry.evictionTimer == null) {
                entry.evictionTimer = window.setTimeout(() => {
                    this.tileCache.delete(url);
                }, 30_000);
            }
        };

        img.src = url;

        return entry.promise;
    }

    private enforceCacheLimit() {
        while (this.tileCache.size > this.tileCacheLimit) {
            const oldestKey = this.tileCache.keys().next().value;
            if (oldestKey === undefined) break;
            const entry = this.tileCache.get(oldestKey);
            if (entry?.evictionTimer != null) {
                clearTimeout(entry.evictionTimer);
            }
            this.tileCache.delete(oldestKey);
        }
    }
}
