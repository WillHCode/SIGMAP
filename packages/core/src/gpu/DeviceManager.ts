export class DeviceManager {
    public device!: GPUDevice;
    public context!: GPUCanvasContext;
    constructor(private canvas: HTMLCanvasElement) {}

    async initialize(): Promise<void> {
        if (!navigator.gpu)
            throw new Error("WebGPU not supported on this browser.");

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("Failed to get GPU adapter.");

        this.device = await adapter.requestDevice();
        this.context = this.canvas.getContext("webgpu")!;
        this.context.configure({
            device: this.device,
            format: navigator.gpu.getPreferredCanvasFormat(),
        });
    }
}
