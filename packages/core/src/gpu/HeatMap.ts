import vsCode from './shaders/heatmap_vertex.wgsl';
import fsCode from './shaders/heatmap_fragment.wgsl';
import cpWindowCode from './shaders/heatmap_computeShader.wgsl';
import {Engine, Transform, WindowState} from "./Engine";

export class HeatMap extends Engine {
    private uBuffer: GPUBuffer | null = null;
    private vBuffer: GPUBuffer | null = null;
    private paramsBuffer: GPUBuffer | null = null;
    private computePipeline: GPUComputePipeline | null = null;
    private windowTexture: GPUTexture | null = null;
    private sampler: GPUSampler | null = null;
    private windowState: WindowState | null = null;

    constructor(canvas: HTMLCanvasElement | null, data_folder: string) {
        super();
        this.setup(canvas, data_folder);
    }

    public updateCameraFromTransform(transform: { scale: number, tx: number, ty: number }) {
        if (!this.cameraBuffer) return;

        const W = this.canvas ? this.canvas.clientWidth || 1 : window.innerWidth;
        const H = this.canvas ? this.canvas.clientHeight || 1 : window.innerHeight;
        const cols = this.dataCols;
        const rows = this.dataRows;

        const invScaleFull = 1.0 / transform.scale;
        const offsetUFull = -transform.tx / (transform.scale * W);
        const offsetVFull = -transform.ty / (transform.scale * H);

        if (!this.windowState) {
            this.device.queue.writeBuffer(this.cameraBuffer, 0, new Float32Array([invScaleFull, offsetUFull, offsetVFull, 0.0]).buffer);
            return;
        }

        // compute raw texel coords and their fractional part
        const rawTexelX = offsetUFull * cols;
        const rawTexelY = offsetVFull * rows;
        const startUFloor = Math.floor(rawTexelX);
        const startVFloor = Math.floor(rawTexelY);
        const fracX = rawTexelX - startUFloor;
        const fracY = rawTexelY - startVFloor;

        const offsetU_for_window = fracX / this.windowState.width;
        const offsetV_for_window = fracY / this.windowState.height;

        this.device.queue.writeBuffer(this.cameraBuffer, 0, new Float32Array([1.0, offsetU_for_window, offsetV_for_window, 0.0]).buffer);
    }

    async renderHeatmap() {
        await this.ensureReady();

        const [u, v] = await this.read_binary_files();
        const cols = this.dataCols;
        const rows = this.dataRows;

        if (!this.uBuffer) {
            this.uBuffer = this.device.createBuffer({
                size: u.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(this.uBuffer, 0, u.buffer, u.byteOffset, u.byteLength);
        }
        if (!this.vBuffer) {
            this.vBuffer = this.device.createBuffer({
                size: v.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(this.vBuffer, 0, v.buffer, v.byteOffset, v.byteLength);
        }

        if (!this.computePipeline) {
            const cm = this.device.createShaderModule({ code: cpWindowCode });
            this.computePipeline = this.device.createComputePipeline({
                layout: 'auto',
                compute: { module: cm, entryPoint: 'main' }
            });
        }

        if (!this.sampler) {
            this.sampler = this.device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge',
            });
        }

        if (!this.windowState) {
            this.windowState = { startU: 0, startV: 0, width: cols, height: rows };
            this.createOrResizeWindowTexture(cols, rows);
        }

        await this.updateWindowWithBuffers();
        this.drawWindowTexture();
    }

    private createOrResizeWindowTexture(w: number, h: number) {
        if (this.windowTexture) {
            this.windowTexture = undefined as any;
        }
        this.windowTexture = this.device.createTexture({
            size: [w, h, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    private async updateWindowWithBuffers() {
        if (!this.windowState || !this.uBuffer || !this.vBuffer || !this.computePipeline || !this.windowTexture) return;

        const cols = this.dataCols;
        const rows = this.dataRows;
        const p = this.windowState;

        const clamp = (x:number,a:number,b:number) => (x<a? a: (x>b? b: x));
        const abs = Math.abs;
        const sqrt = Math.sqrt;
        const cu0 = clamp(0, this.min_u, this.max_u);
        const cv0 = clamp(0, this.min_v, this.max_v);
        const min_mag = sqrt(cu0*cu0 + cv0*cv0);
        const u_corner = (abs(this.min_u) > abs(this.max_u)) ? this.min_u : this.max_u;
        const v_corner = (abs(this.min_v) > abs(this.max_v)) ? this.min_v : this.max_v;
        const max_mag = sqrt(u_corner*u_corner + v_corner*v_corner);
        const mag_range = (max_mag - min_mag) || 1.0;

        const paramsBuf = new ArrayBuffer(32);
        const dv = new DataView(paramsBuf);
        let off = 0;
        dv.setUint32(off, cols, true); off += 4;
        dv.setUint32(off, rows, true); off += 4;
        dv.setUint32(off, p.startU >>> 0, true); off += 4;
        dv.setUint32(off, p.startV >>> 0, true); off += 4;
        dv.setFloat32(off, this.min_u, true); off += 4;
        dv.setFloat32(off, this.min_v, true); off += 4;
        dv.setFloat32(off, min_mag, true); off += 4;
        dv.setFloat32(off, mag_range, true); off += 4;

        if (!this.paramsBuffer) {
            this.paramsBuffer = this.device.createBuffer({
                size: 32,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
        }
        this.device.queue.writeBuffer(this.paramsBuffer, 0, paramsBuf);

        const bgl = this.computePipeline.getBindGroupLayout(0);
        const computeBindGroup = this.device.createBindGroup({
            layout: bgl,
            entries: [
                { binding: 0, resource: { buffer: this.uBuffer } },
                { binding: 1, resource: { buffer: this.vBuffer } },
                { binding: 2, resource: this.windowTexture.createView() },
                { binding: 3, resource: { buffer: this.paramsBuffer } },
            ]
        });

        // dispatch compute
        const encoder = this.device.createCommandEncoder();
        const cpass = encoder.beginComputePass();
        cpass.setPipeline(this.computePipeline);
        cpass.setBindGroup(0, computeBindGroup);

        const workX = Math.ceil(p.width / 16);
        const workY = Math.ceil(p.height / 16);
        cpass.dispatchWorkgroups(workX, workY);
        cpass.end();

        this.device.queue.submit([encoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();
    }

    private drawWindowTexture() {
        if (!this.windowTexture || !this.sampler) return;
        this.ensureCameraBuffer();

        const vsModule = this.device.createShaderModule({ code: vsCode });
        const fsModule = this.device.createShaderModule({ code: fsCode });
        const pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: vsModule, entryPoint: 'vs' },
            fragment: { module: fsModule, entryPoint: 'fs', targets: [{ format: this.format }] },
            primitive: { topology: 'triangle-strip' },
        });

        const bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.windowTexture.createView() },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: { buffer: this.cameraBuffer! } },
            ]
        });

        const encoder = this.device.createCommandEncoder();
        const rp = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: [0,0,0,0],
                loadOp: 'clear',
                storeOp: 'store',
            }]
        });
        rp.setPipeline(pipeline);
        rp.setBindGroup(0, bindGroup);
        rp.draw(4);
        rp.end();
        this.device.queue.submit([encoder.finish()]);
    }

    public async setWindowFromTransform(t: Transform) {
        const w = this.computeWindowFromTransform(t);
        if (!this.windowState || this.windowState.width !== w.windowCols || this.windowState.height !== w.windowRows) {
            this.windowState = {
                startU: w.startUWrapped,
                startV: w.startVClamped,
                width: w.windowCols,
                height: w.windowRows
            };
            this.createOrResizeWindowTexture(w.windowCols, w.windowRows);
        } else {
            this.windowState.startU = w.startUWrapped;
            this.windowState.startV = w.startVClamped;
            this.windowState.width = w.windowCols;
            this.windowState.height = w.windowRows;
        }

        await this.updateWindowWithBuffers();

        this.ensureCameraBuffer();
        const offsetU_for_window = w.fracX / this.windowState.width;
        const offsetV_for_window = w.fracY / this.windowState.height;
        this.device.queue.writeBuffer(
            this.cameraBuffer!,
            0,
            new Float32Array([1.0, offsetU_for_window, offsetV_for_window, 0.0]).buffer
        );
        this.writeCameraBuffer(1.0, offsetU_for_window, offsetV_for_window);
        this.drawWindowTexture();
    }
}
