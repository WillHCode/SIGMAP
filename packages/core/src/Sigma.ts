import { DeviceManager } from "./gpu/DeviceManager";
import { CSVLoader } from "./data/CSVLoader";
import { MapRenderer, HeatmapOptions } from "./map/MapRenderer";

export interface SigmaOptions {
    canvas: HTMLCanvasElement;
}

export class Sigma {
    private readonly deviceMgr: DeviceManager;
    private mapRenderer: MapRenderer;

    constructor(opts: SigmaOptions) {
        this.deviceMgr = new DeviceManager(opts.canvas);
        this.mapRenderer = new MapRenderer(this.deviceMgr);
    }

    /** initialize WebGPU and any resources */
    async init() {
        await this.deviceMgr.initialize();
    }

    /** load your WGSL shaders */
    async loadMapShaders(heatmapWGSL: string) {
        await this.mapRenderer.loadShaders({ heatmapWGSL });
    }

    /** load CSV text (e.g. fetched or FileReader) */
    async loadCSV(text: string) {
        return CSVLoader.load(text);
    }

    /** high-level call to render a geographic heatmap */
    renderHeatmap(
        rows: Record<string,string>[],
        opts: HeatmapOptions
    ) {
        this.mapRenderer.renderHeatmap(rows, opts);
    }
}
