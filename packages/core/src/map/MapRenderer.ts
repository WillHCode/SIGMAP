import { DeviceManager } from "../gpu/DeviceManager";
import { ShaderModule } from "../gpu/ShaderModule";
import { PipelineManager } from "../gpu/PipelineManager";
import { latLngToMercator } from "../utils/geo"

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

    renderHeatmap(
        data: Record<string,string>[],
        opts: HeatmapOptions
    ): void {
        const points = data.map(row => {
            const [x,y] = latLngToMercator(
                parseFloat(row[opts.latField]),
                parseFloat(row[opts.lngField])
            );
            return [x, y, parseFloat(row[opts.valueField])];
        });
        const pipeline = this.pipelineMgr.createComputePipeline(this.heatmapShader);

    }
}
