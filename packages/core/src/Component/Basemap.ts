import {latLonToTile} from '../utils/geo';

export interface BasemapOptions {
    zoom: number;
    center: { lat: number; lon: number };
    minZoom?: number;
    maxZoom?: number;
    tileUrlTemplate?: string;
    zoomEasing?: number;
}

export class Basemap {
    private canvas!: HTMLCanvasElement;
    private ctx!: CanvasRenderingContext2D;
    private width = 0;
    private height = 0;

    private currentZoom: number;
    private targetZoom: number;
    private readonly zoomEasing: number;
    private isZooming = false;

    private center: { lat: number; lon: number };
    private readonly minZoom: number;
    private readonly maxZoom: number;

    private readonly tileUrlTemplate: string;
    private tileCache = new Map<string, HTMLImageElement | HTMLCanvasElement>();

    constructor(opts: BasemapOptions) {
        const initial = Math.max(1, Math.floor(opts.zoom));
        this.currentZoom = initial;
        this.targetZoom = initial;
        this.zoomEasing = opts.zoomEasing ?? 0.2; // smaller values = slower easing

        this.center = opts.center;
        this.minZoom = opts.minZoom ?? 1;
        this.maxZoom = opts.maxZoom ?? 19;
        this.tileUrlTemplate = opts.tileUrlTemplate ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    }

    public init(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2D context not supported');
        this.ctx = ctx;
        this.resize();
        this.installEventListeners();
        this.draw().then(_ => null );
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
        });

        window.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const resolution = 360 / (256 * Math.pow(2, this.currentZoom));
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            this.center.lon -= dx * resolution;
            this.center.lat += dy * resolution;
            startX = e.clientX;
            startY = e.clientY;
            this.draw().then(_ => null );
        });

        window.addEventListener('mouseup', () => (isDragging = false));

        // DO NOT WORK FOR NOW
        // this.canvas.addEventListener('wheel', e => {
        //     e.preventDefault();
        //     const rect = this.canvas.getBoundingClientRect();
        //     const px = e.clientX - rect.left;
        //     const py = e.clientY - rect.top;
        //
        //     const preZoomTile = this.latLonToTile(this.center.lat, this.center.lon, this.currentZoom);
        //     const dxTilePre = (px - this.width / 2) / 256;
        //     const dyTilePre = (py - this.height / 2) / 256;
        //     const cursorTilePre = { x: preZoomTile.x + dxTilePre, y: preZoomTile.y + dyTilePre };
        //
        //     const delta = e.deltaY < 0 ? 1 : -1;
        //     this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom + delta));
        //
        //     const newZoom = this.targetZoom;
        //     // Center so cursor stays fixed
        //     const centerTileX = cursorTilePre.x - (px - this.width / 2) / 256;
        //     const centerTileY = cursorTilePre.y - (py - this.height / 2) / 256;
        //     this.center = this.tileToLatLon(centerTileX, centerTileY, newZoom);
        //
        //     if (!this.isZooming) this.animateZoom();
        // });

        window.addEventListener('keydown', e => {
            if (e.key !== '+' && e.key !== '-' && e.key !== '=' && e.key !== '_') return;

            const delta = (e.key === '+' || e.key === '=') ? 1 : -1;
            this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom + delta));

            if (!this.isZooming) {
                this.animateZoom();
            }
        });

        window.addEventListener('resize', () => {
            this.resize();
            this.draw().then(_ => null );
        });
    }

    private animateZoom() {
        this.isZooming = true;
        const step = () => {
            const diff = this.targetZoom - this.currentZoom;
            if (Math.abs(diff) < 0.001) {
                this.currentZoom = this.targetZoom;
                this.isZooming = false;
                this.draw().then(_ => null );
                return;
            }
            this.currentZoom += diff * this.zoomEasing;
            this.draw().then(_ => null );
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    private async draw() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        const tileSize = 256;

        const effectiveZoom = Math.floor(this.currentZoom);
        const scaleFactor = Math.pow(2, this.currentZoom - effectiveZoom);
        const tileRenderSize = tileSize * scaleFactor;
        const centerTile = latLonToTile(this.center.lat, this.center.lon, effectiveZoom);

        const halfW = this.width / tileRenderSize / 2;
        const halfH = this.height / tileRenderSize / 2;

        const startX = Math.floor(centerTile.x - halfW);
        const startY = Math.floor(centerTile.y - halfH);
        const endX = Math.ceil(centerTile.x + halfW);
        const endY = Math.ceil(centerTile.y + halfH);

        const maxTiles = Math.pow(2, Math.floor(this.currentZoom));

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                const z = Math.floor(this.currentZoom);
                const url = this.makeTileURL(x, y, z);

                // Skip out-of-bounds tiles
                if (x < 0 || x >= maxTiles || y < 0 || y >= maxTiles) continue;

                // draw each tile
                const img = await this.loadTileImage(url);
                const dx = (x - centerTile.x) * tileRenderSize + this.width / 2;
                const dy = (y - centerTile.y) * tileRenderSize + this.height / 2;
                this.ctx.drawImage(img, dx, dy, tileRenderSize, tileRenderSize);

                // Debug rectangle and text on each tile
                this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(dx, dy, tileRenderSize, tileRenderSize);

                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                this.ctx.font = `${12 * scaleFactor}px sans-serif`;
                this.ctx.fillText(`z:${z} x:${x} y:${y}`, dx + 4, dy + 16 * scaleFactor);
            }
        }
    }

    private makeTileURL(x: number, y: number, z: number) {
        return this.tileUrlTemplate
            .replace('{x}', String(x))
            .replace('{y}', String(y))
            .replace('{z}', String(z))
    }

    private loadTileImage(url: string): Promise<HTMLImageElement | HTMLCanvasElement> {
        if (this.tileCache.has(url)) {
            return Promise.resolve(this.tileCache.get(url)!);
        }
        return new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.tileCache.set(url, img);
                resolve(img);
            };
            img.onerror = () => {
                console.warn('Tile load failed, using blank placeholder:', url);
                const placeholder = document.createElement('canvas');
                placeholder.width = placeholder.height = 256;
                this.tileCache.set(url, placeholder);
                resolve(placeholder);
            };
            img.src = url;
        });
    }
}