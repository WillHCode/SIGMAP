import { DeviceManager } from "../gpu/DeviceManager";
import { ShaderModule } from "../gpu/ShaderModule";
import { PipelineManager } from "../gpu/PipelineManager";

export interface HeatmapOptions {
    latField: string;
    lngField: string;
    valueField: string;
}

export class MapRenderer {
    private pipelineMgr: PipelineManager;
    private heatmapShader!: ShaderModule;

    constructor(private deviceMgr: DeviceManager) {
        this.pipelineMgr = new PipelineManager(deviceMgr.device);
    }

    async loadShaders({ heatmapWGSL }: { heatmapWGSL: string }) {
        this.heatmapShader = await ShaderModule.fromURL(
            this.deviceMgr.device, heatmapWGSL
        );
    }

    latLngToMercator(lat: number, lon: number): [number, number] {
        const R = 6378137; // Radius of the Earth in meters
        const x = R * (lon * Math.PI / 180);
        const y = R * Math.log(Math.tan((90 + lat) * Math.PI / 360));
        return [x, y];
    }

    renderHeatmap(
        data: Record<string,string>[],
        opts: HeatmapOptions
    ): void {
        const points = data.map(row => {
            const [x,y] = this.latLngToMercator(
                parseFloat(row[opts.latField]),
                parseFloat(row[opts.lngField])
            );
            return [x, y, parseFloat(row[opts.valueField])];
        });
        const pipeline = this.pipelineMgr.createComputePipeline(this.heatmapShader);

    }
}
