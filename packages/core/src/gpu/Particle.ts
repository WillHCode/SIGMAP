import {Engine, Transform, WindowState} from "./Engine";
import computeShader from "./shaders/particle_computeShader.wgsl";
import renderShader from "./shaders/particle_renderShader.wgsl";

export interface ParticleParameters {
    numParticles: number;
    simulationSpeed: number;
    maxLifetime: number;
    trailLength: number;
    trailFade: number;
}

export class Particle extends Engine {
    private readonly NUM_PARTICLES: number;
    private readonly SIMULATION_SPEED: number;
    private readonly MAX_LIFETIME: number;
    private readonly TRAIL_LENGTH: number;
    private readonly TRAIL_FADE: number;

    private particleBuffers: GPUBuffer[] | null = null;
    private windTexture: GPUTexture | null = null;
    private uniformBuffer: GPUBuffer | null = null;

    private computeCameraBuffer: GPUBuffer | null = null;
    // render camera uses Engine.cameraBuffer
    private gridBuffer: GPUBuffer | null = null; // vec2(cols, rows)

    private computePipeline: GPUComputePipeline | null = null;
    private renderPipeline: GPURenderPipeline | null = null;
    private computeBindGroups: GPUBindGroup[] | null = null;
    private renderBindGroups: GPUBindGroup[] | null = null;

    // sliding-window state
    private windowState: WindowState | null = null;

    constructor(canvas: HTMLCanvasElement | null, data_folder: string, params: ParticleParameters) {
        super();
        this.setup(canvas, data_folder);
        this.NUM_PARTICLES = params.numParticles;
        this.SIMULATION_SPEED = params.simulationSpeed;
        this.MAX_LIFETIME = params.maxLifetime;
        this.TRAIL_LENGTH = params.trailLength;
        this.TRAIL_FADE = params.trailFade;
    }

    private createParticleBuffer(): GPUBuffer {
        const particleSize = 4 + this.TRAIL_LENGTH * 2; // spawn.x,spawn.y,life,angle + trail (2 floats per step)
        const initialParticles = new Float32Array(this.NUM_PARTICLES * particleSize);

        for (let i = 0; i < this.NUM_PARTICLES; i++) {
            const idx = i * particleSize;
            const x = Math.random();
            const y = Math.random();

            initialParticles[idx] = x;
            initialParticles[idx + 1] = y;
            initialParticles[idx + 2] = Math.random() * this.MAX_LIFETIME;
            initialParticles[idx + 3] = 0.0;

            for (let j = 0; j < this.TRAIL_LENGTH; j++) {
                initialParticles[idx + 4 + j * 2] = x;
                initialParticles[idx + 5 + j * 2] = y;
            }
        }

        const buf = this.device.createBuffer({
            size: initialParticles.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(buf.getMappedRange()).set(initialParticles);
        buf.unmap();
        return buf;
    }

    async renderParticles() {
        await this.ensureReady();

        const computeModule = this.device.createShaderModule({ code: computeShader });
        const renderModule = this.device.createShaderModule({ code: renderShader });
        await Promise.all([computeModule, renderModule]);

        if (!this.computePipeline) {
            this.computePipeline = this.device.createComputePipeline({
                layout: 'auto',
                compute: { module: computeModule, entryPoint: 'main' }
            });
        }
        if (!this.renderPipeline) {
            this.renderPipeline = this.device.createRenderPipeline({
                layout: 'auto',
                vertex: { module: renderModule, entryPoint: 'vs', buffers: [] },
                fragment: { module: renderModule, entryPoint: 'fs', targets: [{ format: this.format }] },
                primitive: { topology: 'line-list' }
            });
        }

        if (!this.particleBuffers) {
            this.particleBuffers = [this.createParticleBuffer(), this.createParticleBuffer()];
        }

        if (!this.uniformBuffer) {
            this.uniformBuffer = this.device.createBuffer({
                size: 8,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
        }

        if (!this.windTexture) {
            this.windTexture = this.device.createTexture({
                size: [this.dataCols, this.dataRows],
                format: 'rgba32float',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            });
        }

        try {
            const [uData, vData] = await this.read_binary_files();
            const cols = this.dataCols;
            const rows = this.dataRows;
            if (uData.length === cols * rows && vData.length === cols * rows) {
                const texels = new Float32Array(cols * rows * 4);
                for (let i = 0; i < cols * rows; i++) {
                    if (uData[i] < this.min_u || vData[i] < this.min_v) continue;
                    texels[i * 4] = uData[i];
                    texels[i * 4 + 1] = vData[i];
                }
                const bytesPerRow = cols * 4 * 4;
                this.device.queue.writeTexture({ texture: this.windTexture }, texels, { bytesPerRow }, { width: cols, height: rows });
            } else {
                console.warn('wind data size mismatch; not uploaded');
            }
        } catch (e) {
            console.warn('Could not read/upload wind texture', e);
        }

        if (!this.computeCameraBuffer) {
            this.computeCameraBuffer = this.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            this.device.queue.writeBuffer(this.computeCameraBuffer, 0, new Float32Array([1.0, 0.0, 0.0, 0.0]).buffer);
        }
        if (!this.gridBuffer) {
            this.gridBuffer = this.device.createBuffer({
                size: 8,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            const gridArr = new Float32Array([this.dataCols, this.dataRows]);
            this.device.queue.writeBuffer(this.gridBuffer, 0, gridArr.buffer, gridArr.byteOffset, gridArr.byteLength);
        }

        this.ensureCameraBuffer();

        if (!this.computeBindGroups) {
            const bgl = this.computePipeline!.getBindGroupLayout(0);
            this.computeBindGroups = [
                this.device.createBindGroup({
                    layout: bgl,
                    entries: [
                        { binding: 0, resource: { buffer: this.particleBuffers[0] } }, // input
                        { binding: 1, resource: { buffer: this.particleBuffers[1] } }, // output
                        { binding: 2, resource: this.windTexture!.createView() },
                        { binding: 3, resource: { buffer: this.uniformBuffer! } }, // params
                        { binding: 4, resource: { buffer: this.computeCameraBuffer! } }, // compute camera
                        { binding: 5, resource: { buffer: this.gridBuffer! } } // grid dims
                    ]
                }),
                this.device.createBindGroup({
                    layout: bgl,
                    entries: [
                        { binding: 0, resource: { buffer: this.particleBuffers[1] } }, // input
                        { binding: 1, resource: { buffer: this.particleBuffers[0] } }, // output
                        { binding: 2, resource: this.windTexture!.createView() },
                        { binding: 3, resource: { buffer: this.uniformBuffer! } }, // params
                        { binding: 4, resource: { buffer: this.computeCameraBuffer! } }, // compute camera
                        { binding: 5, resource: { buffer: this.gridBuffer! } } // grid dims
                    ]
                })
            ];
        }

        if (!this.renderBindGroups) {
            const rgl = this.renderPipeline!.getBindGroupLayout(0);
            this.renderBindGroups = [
                this.device.createBindGroup({
                    layout: rgl,
                    entries: [
                        { binding: 0, resource: { buffer: this.particleBuffers[0] } },
                        { binding: 1, resource: { buffer: this.uniformBuffer! } },
                        { binding: 2, resource: { buffer: this.cameraBuffer! } } // render camera
                    ]
                }),
                this.device.createBindGroup({
                    layout: rgl,
                    entries: [
                        { binding: 0, resource: { buffer: this.particleBuffers[1] } },
                        { binding: 1, resource: { buffer: this.uniformBuffer! } },
                        { binding: 2, resource: { buffer: this.cameraBuffer! } }
                    ]
                })
            ];
        }

        const WORKGROUP_SIZE = 64;
        const numWorkgroups = Math.ceil(this.NUM_PARTICLES / WORKGROUP_SIZE);
        const segmentsPerParticle = Math.max(0, this.TRAIL_LENGTH - 1);
        const verticesPerParticle = segmentsPerParticle * 2;
        let ping = 0;
        let lastTime = performance.now();

        const frame = () => {
            const now = performance.now();
            const dtMs = now - lastTime;
            const dt = Math.max(1e-6, dtMs / 1000.0);
            lastTime = now;

            this.device.queue.writeBuffer(this.uniformBuffer!, 0, new Float32Array([dt, this.SIMULATION_SPEED]).buffer);

            // compute pass
            const encoder = this.device.createCommandEncoder();
            const cpass = encoder.beginComputePass();
            cpass.setPipeline(this.computePipeline!);
            cpass.setBindGroup(0, this.computeBindGroups![ping]);
            cpass.dispatchWorkgroups(numWorkgroups);
            cpass.end();

            // render pass
            const colorView = this.context.getCurrentTexture().createView();
            const rpass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: colorView,
                    loadOp: 'clear',
                    clearValue: { r: 0, g: 0, b: 0, a: 0.7 },
                    storeOp: 'store'
                }]
            });
            rpass.setPipeline(this.renderPipeline!);
            rpass.setBindGroup(0, this.renderBindGroups![1 - ping]);
            if (verticesPerParticle > 0 && this.NUM_PARTICLES > 0) {
                rpass.draw(verticesPerParticle, this.NUM_PARTICLES, 0, 0);
            }
            rpass.end();

            this.device.queue.submit([encoder.finish()]);
            ping = 1 - ping;
            requestAnimationFrame(frame);
        };

        lastTime = performance.now();
        requestAnimationFrame(frame);
    }

    // called by MovementHandler to write compute-camera immediately
    public updateCameraFromTransform(transform: { scale: number, tx: number, ty: number }) {
        if (!this.computeCameraBuffer) {
            this.computeCameraBuffer = this.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
        }

        const W = this.canvas ? this.canvas.clientWidth || 1 : window.innerWidth;
        const H = this.canvas ? this.canvas.clientHeight || 1 : window.innerHeight;
        const invScaleFull = 1.0 / transform.scale;
        const offsetUFull = -transform.tx / (transform.scale * W);
        const offsetVFull = -transform.ty / (transform.scale * H);

        this.device.queue.writeBuffer(this.computeCameraBuffer, 0, new Float32Array([invScaleFull, offsetUFull, offsetVFull, 0.0]).buffer);
    }

    // Sliding-window : compute window, update windowState, write both compute and render camera buffers.
    public async setWindowFromTransform(t: Transform) {
        await this.ensureReady();

        const w = this.computeWindowFromTransform(t);

        if (!this.windowState || this.windowState.width !== w.windowCols || this.windowState.height !== w.windowRows) {
            this.windowState = { startU: w.startUWrapped, startV: w.startVClamped, width: w.windowCols, height: w.windowRows };
        } else {
            this.windowState.startU = w.startUWrapped;
            this.windowState.startV = w.startVClamped;
            this.windowState.width = w.windowCols;
            this.windowState.height = w.windowRows;
        }

        // write compute camera to keep sampling aligned with the window
        const W = this.canvas ? this.canvas.clientWidth || 1 : window.innerWidth;
        const invScaleFull = 1.0 / t.scale;
        const offsetUFull = -t.tx / (t.scale * W);
        const offsetVFull = -t.ty / (t.scale * (this.canvas ? this.canvas.clientHeight || 1 : window.innerHeight)); // V uses H, but we only need same formula

        if (!this.computeCameraBuffer) {
            this.computeCameraBuffer = this.device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
        }
        this.device.queue.writeBuffer(this.computeCameraBuffer, 0, new Float32Array([invScaleFull, offsetUFull, offsetVFull, 0.0]).buffer);

        // write render camera into Engine.cameraBuffer so render shader aligns with heatmap
        this.ensureCameraBuffer();
        const offsetU_for_window = w.fracX / this.windowState.width;
        const offsetV_for_window = w.fracY / this.windowState.height;
        this.device.queue.writeBuffer(this.cameraBuffer!, 0, new Float32Array([1.0, offsetU_for_window, offsetV_for_window, 0.0]).buffer);
        this.writeCameraBuffer(1.0, offsetU_for_window, offsetV_for_window);
    }
}
