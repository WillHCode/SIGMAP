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

    async renderPolygons() {
        try {
            // ensure metadata + device/context ready
            await this.ensureReady();

            if (!this.canvas || !this.device || !this.context) {
                console.error("Canvas / device / context not ready");
                return;
            }

            console.log("[renderPolygons] loading:", this.polygonsFilePath);
            const polygonsData = await this.loadShpb(this.polygonsFilePath);

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

            // Create shader modules (WGSL strings)
            const vsModule = this.device.createShaderModule({ code: (vertexShader as any).default ?? vertexShader });
            const fsModule = this.device.createShaderModule({ code: (fragmentShader as any).default ?? fragmentShader });

            // Create pipeline (one vec2 position attribute at location 0)
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

            // Per-batch uniform buffers and bind groups (color at binding 0)
            const batchBindGroups: (GPUBindGroup | null)[] = [];
            const bgl = pipeline.getBindGroupLayout(0);

            for (let i = 0; i < batches.length; ++i) {
                const b = batches[i];
                if (!b || !b.index_count) { batchBindGroups.push(null); continue; }

                // create small uniform buffer (vec4f)
                const ub = this.device.createBuffer({
                    size: 16,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                    mappedAtCreation: false
                });

                const color = new Float32Array(b.color); // [r,g,b,a]
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

            // submit and optionally wait for GPU to finish for accurate timing
            this.device.queue.submit([encoder.finish()]);

            // Wait for GPU work submitted above to complete (optional, helps with precise instrumentation)
            await this.device.queue.onSubmittedWorkDone();

            const t1 = performance.now();
            console.log(`[renderPolygons] rendered one-shot in ${(t1 - t0).toFixed(2)} ms`);

            // finished — no render loop
            return;

        } catch (err) {
            console.error("[renderPolygons] error:", err);
        }
    }

}
