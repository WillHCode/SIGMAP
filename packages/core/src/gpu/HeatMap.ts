import vsCode from './shaders/heatmap_vertex.wgsl';
import fsCode from './shaders/heatmap_fragment.wgsl';
import {Engine} from "./Engine";

export class HeatMap extends Engine{

    constructor(canvas: HTMLCanvasElement | null, data_folder: string) {
        super();
        this.setup(canvas, data_folder);
    }

    create_texture(values: Float32Array, width: number, height: number) {
        if (values.length !== width * height) {
            throw new Error(`create_texture: values length ${values.length} != width*height ${width}*${height}`);
        }

        const texture = this.device.createTexture({
            size: [width, height, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        const textureData = new Uint8Array(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            textureData[i * 4] = Math.min(255, Math.max(0, Math.floor(values[i] * 255)));
        }

        this.device.queue.writeTexture(
            { texture: texture },
            textureData,
            { bytesPerRow: width * 4 },
            { width, height, depthOrArrayLayers: 1 }
        );

        return texture;
    }

    async computeSpeed(u: Float32Array, v: Float32Array): Promise<Float32Array> {
        if (u.length !== v.length) {
            throw new Error(`u and v length mismatch: u=${u.length} v=${v.length}`);
        }

        const n = u.length;
        const speed = new Float32Array(n);

        let min_speed = Number.POSITIVE_INFINITY;
        let max_speed = Number.NEGATIVE_INFINITY;

        for (let i = 0; i < n; i++) {
            const ui = u[i];
            const vi = v[i];
            //  treat sentinel values
            if (ui <= this.min_u || vi <= this.min_v) { speed[i] = 0; continue; }
            const s = Math.hypot(ui, vi);
            speed[i] = s;
            if (s < min_speed) min_speed = s;
            if (s > max_speed) max_speed = s;
        }

        const range = (max_speed - min_speed) || 1.0;
        const norm = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            norm[i] = (speed[i] - min_speed) / range;
        }
        return norm;
    }

    async renderHeatmap() {
        await this.metadataLoaded;

        if (!this.dataCols || !this.dataRows) {
            throw new Error('Data shape not available (rows/cols missing from metadata)');
        }

        const [u, v] = await this.read_binary_files();

        // sanity check lengths
        const expected = this.dataCols * this.dataRows;
        if (u.length !== expected || v.length !== expected) {
            throw new Error(`u/v length mismatch with metadata. expected=${expected}, u=${u.length}, v=${v.length}`);
        }

        const normSpeed = await this.computeSpeed(u, v);

        const vsModule = this.device.createShaderModule({ code: vsCode });
        const fsModule = this.device.createShaderModule({ code: fsCode });
        await Promise.all([vsModule, fsModule]);

        const pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: vsModule, entryPoint: 'vs' },
            fragment: { module: fsModule, entryPoint: 'fs', targets: [{ format: this.format }] },
            primitive: { topology: 'triangle-strip' },
        });

        const heatmapTexture = this.create_texture(normSpeed, this.dataCols, this.dataRows);

        await this.device.queue.onSubmittedWorkDone();

        const bindGroup = this.device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: heatmapTexture.createView() },
                { binding: 1, resource: this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' }) }
            ]
        });

        const renderLoop = () => {
            const commandEncoder = this.device.createCommandEncoder();
            const renderPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: this.context.getCurrentTexture().createView(),
                    clearValue: [0, 0, 0, 0],
                    loadOp: 'clear',
                    storeOp: 'store',
                }]
            });
            renderPass.setPipeline(pipeline);
            renderPass.setBindGroup(0, bindGroup);
            renderPass.draw(4);
            renderPass.end();
            this.device.queue.submit([commandEncoder.finish()]);
            requestAnimationFrame(renderLoop);
        };
        requestAnimationFrame(renderLoop);
    }

}