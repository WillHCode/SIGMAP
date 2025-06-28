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
        return `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`;
    }

    async init(canvas: HTMLCanvasElement) {
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
