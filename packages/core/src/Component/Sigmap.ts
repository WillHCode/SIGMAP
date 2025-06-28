import { DeviceManager } from "../gpu/DeviceManager";
import { CSVLoader } from "../data/CSVLoader";
import { MapRenderer, HeatmapOptions } from "../map/MapRenderer";
import { Basemap, BasemapOptions } from "./Basemap";

export interface SigmapOptions {
    canvas: HTMLCanvasElement;
}

export class Sigmap {
    private readonly deviceMgr: DeviceManager;
    private readonly mapRenderer: MapRenderer;
    private basemap?: Basemap;

    constructor(private opts: SigmapOptions) {
        this.deviceMgr = new DeviceManager(opts.canvas);
        this.mapRenderer = new MapRenderer(this.deviceMgr);
    }

    async init() {
        await this.deviceMgr.initialize();
    }

    async loadMapShaders(heatmapWGSL: string) {
        await this.mapRenderer.loadShaders({ heatmapWGSL });
    }

    async loadCSV(text: string) {
        return CSVLoader.load(text);
    }

    renderHeatmap(rows: Record<string, string>[], opts: HeatmapOptions) {
        this.mapRenderer.renderHeatmap(rows, opts);
    }

    async setBasemap(opts: BasemapOptions) {
        // create a second canvas under the WebGPU one
        if (!this.basemap) {
            this.basemap = new Basemap(opts);
        }
        // assume HTML has a #basemap-canvas behind the GPU canvas
        const tileCanvas = document.getElementById("basemap-canvas") as HTMLCanvasElement;
        await this.basemap.init(tileCanvas);
    }
}
