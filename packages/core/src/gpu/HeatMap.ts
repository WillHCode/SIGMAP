import vsCode from './shaders/heatmap_vertex.wgsl';
import fsCode from './shaders/heatmap_fragment.wgsl';
import cpCode from './shaders/heatmap_computeShader.wgsl';
import {Engine} from "./Engine";

export class HeatMap extends Engine{

    constructor(canvas: HTMLCanvasElement | null, data_folder: string) {
        super();
        this.setup(canvas, data_folder);
    }

    async renderHeatmap() {
        await this.metadataLoaded;

        if (!this.dataCols || !this.dataRows) {
            throw new Error('Data shape not available (rows/cols missing from metadata)');
        }

        const [u, v] = await this.read_binary_files();
        const cols = this.dataCols;
        const rows = this.dataRows;
        const expected = cols * rows;
        if (u.length !== expected || v.length !== expected) {
            throw new Error(`u/v length mismatch with metadata. expected=${expected}, u=${u.length}, v=${v.length}`);
        }

        // Pre compute some values for the shader
        const clamp = (x: number, a: number, b: number) => (x < a ? a : (x > b ? b : x));
        const abs = Math.abs;
        const sqrt = Math.sqrt;

        const cu0 = clamp(0, this.min_u, this.max_u);
        const cv0 = clamp(0, this.min_v, this.max_v);
        const min_mag = sqrt(cu0 * cu0 + cv0 * cv0);

        const u_corner = (abs(this.min_u) > abs(this.max_u)) ? this.min_u : this.max_u;
        const v_corner = (abs(this.min_v) > abs(this.max_v)) ? this.min_v : this.max_v;
        const max_mag = sqrt(u_corner * u_corner + v_corner * v_corner);
        const mag_range = (max_mag - min_mag) || 1.0;

        const tUploadStart = performance.now();

        // Storage buffers for u & v
        const uBuffer = this.device.createBuffer({
            size: u.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        const vBuffer = this.device.createBuffer({
            size: v.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.device.queue.writeBuffer(uBuffer, 0, u.buffer, u.byteOffset, u.byteLength);
        this.device.queue.writeBuffer(vBuffer, 0, v.buffer, v.byteOffset, v.byteLength);

        // Params buffer (same as before)
        const paramsBufferSize = 32;
        const paramsArrayBuf = new ArrayBuffer(paramsBufferSize);
        {
            const dv = new DataView(paramsArrayBuf);
            let off = 0;
            dv.setUint32(off, cols, true); off += 4;
            dv.setUint32(off, rows, true); off += 4;
            dv.setUint32(off, 0, true); off += 4; // unused
            dv.setUint32(off, 0, true); off += 4; // padding
            dv.setFloat32(off, this.min_u, true); off += 4;
            dv.setFloat32(off, this.min_v, true); off += 4;
            dv.setFloat32(off, min_mag, true); off += 4;
            dv.setFloat32(off, mag_range, true); off += 4;
        }
        const paramsBuffer = this.device.createBuffer({
            size: paramsBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(paramsBuffer, 0, paramsArrayBuf);

        const tUploadEnd = performance.now();
        const uploadMs = tUploadEnd - tUploadStart;

        // Compute pipeline
        const computeModule = this.device.createShaderModule({ code: cpCode });
        const computePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: { module: computeModule, entryPoint: 'main' }
        });

        const heatmapTexture = this.device.createTexture({
            size: [cols, rows, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        });

        const computeBindGroup = this.device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: uBuffer } },
                { binding: 1, resource: { buffer: vBuffer } },
                { binding: 2, resource: heatmapTexture.createView() }, // DIRECT OUTPUT
                { binding: 3, resource: { buffer: paramsBuffer } },
            ]
        });

        // Compute pass
        const tGpuStart = performance.now();
        const encoder = this.device.createCommandEncoder();
        const cpass = encoder.beginComputePass();
        cpass.setPipeline(computePipeline);
        cpass.setBindGroup(0, computeBindGroup);
        cpass.dispatchWorkgroups(Math.ceil(cols / 16), Math.ceil(rows / 16));
        cpass.end();
        this.device.queue.submit([encoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();
        const tGpuEnd = performance.now();
        const gpuComputeMs = tGpuEnd - tGpuStart;

        // Render pass
        const vsModule = this.device.createShaderModule({ code: vsCode });
        const fsModule = this.device.createShaderModule({ code: fsCode });
        await Promise.all([vsModule, fsModule]);

        const pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: vsModule, entryPoint: 'vs' },
            fragment: { module: fsModule, entryPoint: 'fs', targets: [{ format: this.format }] },
            primitive: { topology: 'triangle-strip' },
        });

        const bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: heatmapTexture.createView() },
                { binding: 1, resource: this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) }
            ]

        });

        const tRenderStart = performance.now();
        const encoder2 = this.device.createCommandEncoder();
        const rp = encoder2.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: [0, 0, 0, 0],
                loadOp: 'clear',
                storeOp: 'store',
            }]
        });
        rp.setPipeline(pipeline);
        rp.setBindGroup(0, bindGroup);
        rp.draw(4);
        rp.end();
        this.device.queue.submit([encoder2.finish()]);
        await this.device.queue.onSubmittedWorkDone();
        const tRenderEnd = performance.now();
        const renderMs = tRenderEnd - tRenderStart;

        console.log(`[renderHeatmap] upload: ${uploadMs.toFixed(2)} ms | gpu compute: ${gpuComputeMs.toFixed(2)} ms | render: ${renderMs.toFixed(2)} ms | total: ${(uploadMs + gpuComputeMs + renderMs).toFixed(2)} ms`);
    }
}