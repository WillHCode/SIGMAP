import { lonLatToTile } from "../utils/geo"

export interface BasemapOptions {
    zoom: number;
    center: { lat: number; lon: number };
    tilesAround?: number;
    minZoom?: number;
    maxZoom?: number;
}

export class Basemap {
    constructor(private readonly opts: BasemapOptions) {}

    private tileUrl(z: number, x: number, y: number) {
        return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    }

    async init(canvas: HTMLCanvasElement) {
        if (!canvas) {
            throw new Error("Canvas element is required for Basemap initialization.");
        }
        if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error("Provided element is not a canvas.");
        }
        if (!canvas.getContext("2d")) {
            throw new Error("Canvas does not support 2D context.");
        }
        if (canvas.width === 0 || canvas.height === 0) {
            throw new Error("Canvas dimensions are not set. Please set width and height.");
        }
        const ctx = canvas.getContext("2d")!;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        const { zoom, center, tilesAround = 2, minZoom = 0, maxZoom = 19 } = this.opts;
        const tileSize = 256;
        const { x: centerX, y: centerY } = lonLatToTile(center.lon, center.lat, zoom);

        const drawTile = (tx: number, ty: number) => {
            const url = this.tileUrl(zoom, tx, ty);
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const dx = (tx - (centerX - tilesAround)) * tileSize;
                const dy = (ty - (centerY - tilesAround)) * tileSize;
                ctx.drawImage(img, dx, dy, tileSize, tileSize);
            };
            img.src = url;
        };

        for (let dx = -tilesAround; dx <= tilesAround; dx++) {
            for (let dy = -tilesAround; dy <= tilesAround; dy++) {
                drawTile(centerX + dx, centerY + dy);
            }
        }
    }
}
