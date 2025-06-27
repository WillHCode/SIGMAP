export class Sigma {
    constructor(public options: { canvas: HTMLCanvasElement }) {
        // ...
    }

    async init() {
        console.log("SIGma initialized with canvas:", this.options.canvas);
    }

    async loadMapShaders(url: string) {
        // Load WGSL shaders
        console.log("Loading shaders from:", url);
    }

    async loadCSV(text: string) {
        console.log("Loading CSV data");
        return [];
    }

    renderHeatmap(data: any[], opts: {
        latField: string;
        lngField: string;
        valueField: string;
    }) {
        console.log("Rendering heatmap with options:", opts);
        // Heatmap rendering logic
    }

    setBasemapLayer(basemap: Basemap) {
        console.log("Setting basemap layer");
        basemap.init();
    }
}

export class Basemap {
    tileUrl = (z: number, x: number, y: number) =>
        `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`;

    lonLatToTile(lon: number, lat: number, zoom: number) {
        const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
        const y = Math.floor(
            (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)
        );
        return { x, y };
    }

    getTileUrl(lon: number, lat: number, zoom: number): string {
        const { x, y } = this.lonLatToTile(lon, lat, zoom);
        return this.tileUrl(zoom, x, y);
    }

    init(){
        const tileCanvas = document.getElementById('tile-canvas') as HTMLCanvasElement;
        const ctx = tileCanvas.getContext('2d')!;
        tileCanvas.width = window.innerWidth;
        tileCanvas.height = window.innerHeight;

        const tileSize = 256;
        const zoom = 3;
        const center = { lat: 48.8566, lon: 2.3522 }; // e.g. Paris

        const centerTile = this.lonLatToTile(center.lon, center.lat, zoom);
        const tilesAround = 2;

        for (let dx = -tilesAround; dx <= tilesAround; dx++) {
            for (let dy = -tilesAround; dy <= tilesAround; dy++) {
                const tx = centerTile.x + dx;
                const ty = centerTile.y + dy;

                const url = this.tileUrl(zoom, tx, ty);
                const img = new Image();
                img.crossOrigin = "anonymous";

                img.onload = () => {
                    ctx.drawImage(
                        img,
                        (dx + tilesAround) * tileSize,
                        (dy + tilesAround) * tileSize,
                        tileSize,
                        tileSize
                    );
                };
                img.src = url;
            }
        }
    }
}
