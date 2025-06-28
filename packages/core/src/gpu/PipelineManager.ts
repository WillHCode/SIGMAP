import { ShaderModule } from "./ShaderModule";

export class PipelineManager {
    constructor(private device: GPUDevice) {}

    createComputePipeline(shader: ShaderModule, entryPoint = "main") {
        return this.device.createComputePipeline({
            compute: {module: shader.module, entryPoint},
            layout: "auto"
        });
    }

    createRenderPipeline(descriptor: GPURenderPipelineDescriptor) {
        return this.device.createRenderPipeline(descriptor);
    }
}