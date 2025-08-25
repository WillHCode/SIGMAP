import { Engine } from "./Engine";
import vertexShader from "./shaders/polygons_vertex.wgsl";
import fragmentShader from "./shaders/polygons_fragment.wgsl";

export class Polygon extends Engine {
    polygonsFilePath: string;

    constructor(canvas: HTMLCanvasElement | null, data_folder: string, fileName: string) {
        super();
        this.setup(canvas, data_folder);
        this.polygonsFilePath = data_folder.replace(/\/+$/, "") + "/" + fileName;
    }

    private remapVerticesToGrid(
        vertices: Float32Array,
        shpBox: { xmin: number, ymin: number, xmax: number, ymax: number },
        gridBox: { xmin: number, ymin: number, xmax: number, ymax: number },
    ) {
        const shpW = shpBox.xmax - shpBox.xmin;
        const shpH = shpBox.ymax - shpBox.ymin;
        const gridW = gridBox.xmax - gridBox.xmin;
        const gridH = gridBox.ymax - gridBox.ymin;

        for (let i = 0; i < vertices.length; i += 2) {
            // vertices are currently normalized 0..1 relative to SHP bbox
            const sx = vertices[i];
            const sy = vertices[i + 1];

            // convert back to lon/lat (in degrees)
            const lon = shpBox.xmin + sx * shpW;
            const lat = shpBox.ymin + sy * shpH;

            // re-normalize using the GRID bbox
            let nx = (lon - gridBox.xmin) / gridW;
            let ny = (lat - gridBox.ymin) / gridH;

            // clamp to [0,1] to avoid out-of-range tex lookups
            nx = Math.min(1, Math.max(0, nx));
            ny = Math.min(1, Math.max(0, ny));

            vertices[i] = nx;
            vertices[i + 1] = ny;
        }
    }

    async renderPolygons() {
        await this.ensureReady();

        if (!this.canvas || !this.device || !this.context) {
            console.error("Canvas / device / context not ready");
            return;
        }

        console.log("[renderPolygons] loading:", this.polygonsFilePath);
        const polygonsData = await this.loadShpb(this.polygonsFilePath);

        // TODO find a way to not have to revamp this every time
        const fetchFloat32 = async (path: string): Promise<Float32Array> => {
            const resp = await fetch(path);
            if (!resp.ok) throw new Error(`Failed to fetch ${path}: ${resp.status}`);
            const ab = await resp.arrayBuffer();
            if (ab.byteLength % 4 !== 0) throw new Error(`Bad byte length for ${path}`);
            return new Float32Array(ab);
        };

        const shpBox = {
            xmin: polygonsData.xmin,
            ymin: polygonsData.ymin,
            xmax: polygonsData.xmax,
            ymax: polygonsData.ymax,
        };

        // GridBox from the heatmap's lat/lon files referenced in Engine.
        if (!this.lat_filepath || !this.lon_filepath) {
            new Error('Grid lat/lon file paths are not available in Engine metadata');
        }

        const [latArr, lonArr] = await Promise.all([
            fetchFloat32(this.lat_filepath),
            fetchFloat32(this.lon_filepath),
        ]);

        // min/max of the grid's lat/lon
        let gridLatMin = Number.POSITIVE_INFINITY;
        let gridLatMax = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < latArr.length; i++) {
            const v = latArr[i];
            if (v < gridLatMin) gridLatMin = v;
            if (v > gridLatMax) gridLatMax = v;
        }

        let gridLonMin = Number.POSITIVE_INFINITY;
        let gridLonMax = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < lonArr.length; i++) {
            const v = lonArr[i];
            if (v < gridLonMin) gridLonMin = v;
            if (v > gridLonMax) gridLonMax = v;
        }

        const gridBox = {
            xmin: gridLonMin,
            ymin: gridLatMin,
            xmax: gridLonMax,
            ymax: gridLatMax
        };

        // Convert into the grid-normalized coordinates to heatmap/particles grid.
        this.remapVerticesToGrid(polygonsData.vertices, shpBox, gridBox);

        const { vertices, indices, batches, vertexCount, indexCount } = polygonsData;

        if (!vertices || !indices || !batches) {
            console.error("[renderPolygons] invalid .shpb data");
            return;
        }

        console.log(`[renderPolygons] vertices=${vertexCount}, indices=${indexCount}, batches=${batches.length}`);

        // Create GPU buffers and upload data
        const vertexBuffer = this.device.createBuffer({
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false
        });
        this.device.queue.writeBuffer(vertexBuffer, 0, vertices.buffer, vertices.byteOffset, vertices.byteLength);

        const indexBuffer = this.device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false
        });
        this.device.queue.writeBuffer(indexBuffer, 0, indices.buffer, indices.byteOffset, indices.byteLength);

        // Create shader modules
        const vsModule = this.device.createShaderModule({ code: (vertexShader as any).default ?? vertexShader });
        const fsModule = this.device.createShaderModule({ code: (fragmentShader as any).default ?? fragmentShader });

        // Create pipeline
        const pipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: vsModule,
                entryPoint: "vs",
                buffers: [
                    {
                        arrayStride: 8, // 2 * float32
                        stepMode: "vertex",
                        attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }]
                    }
                ]
            },
            fragment: {
                module: fsModule,
                entryPoint: "fs",
                targets: [{ format: this.format }]
            },
            primitive: {
                topology: "triangle-list",
                cullMode: "none"
            }
        });

        // Per-batch uniform buffers and bind groups
        const batchBindGroups: (GPUBindGroup | null)[] = [];
        const bgl = pipeline.getBindGroupLayout(0);

        for (let i = 0; i < batches.length; ++i) {
            const b = batches[i];
            if (!b || !b.index_count) { batchBindGroups.push(null); continue; }

            const ub = this.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                mappedAtCreation: false
            });

            const color = new Float32Array([0.1, 0.3, 0.5, 1]); // RGBA or b.color
            this.device.queue.writeBuffer(ub, 0, color.buffer, color.byteOffset, color.byteLength);

            const bindGroup = this.device.createBindGroup({
                layout: bgl,
                entries: [{ binding: 0, resource: { buffer: ub } }]
            });

            batchBindGroups.push(bindGroup);
        }

        const t0 = performance.now();

        const encoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0, g: 0, b: 0, a: 0.0 },
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, vertexBuffer);
        pass.setIndexBuffer(indexBuffer, "uint32");

        for (let bi = 0; bi < batches.length; ++bi) {
            const b = batches[bi];
            if (!b || b.index_count === 0) continue;
            const bg = batchBindGroups[bi];
            if (!bg) continue;
            pass.setBindGroup(0, bg);
            pass.drawIndexed(b.index_count, 1, b.index_offset, 0, 0);
        }

        pass.end();

        // TODO: Avoid waiting here for better performance ?
        this.device.queue.submit([encoder.finish()]); // Wait for GPU to finish
        await this.device.queue.onSubmittedWorkDone(); // Wait for GPU work submitted

        const t1 = performance.now();
        console.log(`[renderPolygons] rendered one-shot in ${(t1 - t0).toFixed(2)} ms`);
        return;
    }

}
