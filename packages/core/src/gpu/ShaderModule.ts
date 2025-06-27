export class ShaderModule {
    constructor(
        private device: GPUDevice,
        public module: GPUShaderModule
    ) {}

    static async fromURL(device: GPUDevice, url: string): Promise<ShaderModule> {
        const wgsl = await fetch(url).then(r => r.text());
        const module = device.createShaderModule({ code: wgsl });
        // Optionally check compilation info here...
        return new ShaderModule(device, module);
    }
}