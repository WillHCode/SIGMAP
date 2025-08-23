import {Engine} from "./Engine";
import computeShader from "./shaders/particle_computeShader.wgsl";
import renderShader from "./shaders/particle_renderShader.wgsl";

export interface ParticleParameters {
    numParticles: number;
    simulationSpeed: number;
    maxLifetime: number;
    trailLength: number;
    trailFade: number;
}

export class Particle extends Engine{
    private readonly NUM_PARTICLES: number;
    private readonly SIMULATION_SPEED: number;
    private readonly MAX_LIFETIME: number;
    private readonly TRAIL_LENGTH: number;
    private readonly TRAIL_FADE: number;

    constructor(canvas: HTMLCanvasElement | null, data_folder: string, params : ParticleParameters) {
        super();
        this.setup(canvas, data_folder);

        this.NUM_PARTICLES = params.numParticles;
        this.SIMULATION_SPEED = params.simulationSpeed;
        this.MAX_LIFETIME = params.maxLifetime;
        this.TRAIL_LENGTH = params.trailLength;
        this.TRAIL_FADE = params.trailFade;
    }

    private createParticleBuffer(): GPUBuffer {
        const particleSize = 4 + this.TRAIL_LENGTH * 2; // 4 base + 2*TRAIL_LENGTH positions
        const initialParticles = new Float32Array(this.NUM_PARTICLES * particleSize);

        for (let i = 0; i < this.NUM_PARTICLES; i++) {
            const idx = i * particleSize;
            const x = Math.random();
            const y = Math.random();

            // Base properties
            initialParticles[idx] = x;                      // spawn.x
            initialParticles[idx + 1] = y;                  // spawn.y
            initialParticles[idx + 2] = Math.random() * this.MAX_LIFETIME; // life
            initialParticles[idx + 3] = 0.0;                // angle

            // Position history
            for (let j = 0; j < this.TRAIL_LENGTH; j++) {
                initialParticles[idx + 4 + j*2] = x;        // posX
                initialParticles[idx + 5 + j*2] = y;        // posY
            }
        }

        const buffer = this.device.createBuffer({
            size: initialParticles.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        new Float32Array(buffer.getMappedRange()).set(initialParticles);
        buffer.unmap();
        return buffer;
    }

    async renderParticles() {
        await this.ensureReady();

        if (!this.device) throw new Error('GPU device not ready');
        if (!this.context) throw new Error('GPU context not ready');

        const computeModule = this.device.createShaderModule({ code: computeShader });
        const renderModule = this.device.createShaderModule({ code: renderShader });
        await Promise.all([computeModule, renderModule]);

        const computePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: computeModule,
                entryPoint: 'main'
            }
        });

        // Updated render pipeline
        const renderPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: renderModule,
                entryPoint: 'vs',
                buffers: []
            },
            fragment: {
                module: renderModule,
                entryPoint: 'fs',
                targets: [{
                    format: this.format
                }]
            },
            primitive: {
                topology: 'line-list',
                stripIndexFormat: undefined
            }
        });

        // Create two particle buffers for ping-ponging
        const particleBuffers = [
            this.createParticleBuffer(),
            this.createParticleBuffer()
        ];

        // Create uniform buffer for deltaTime
        const uniformBuffer = this.device.createBuffer({
            size: 8,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        // Create the texture for wind data
        const windTexture = this.device.createTexture({
            size: [this.dataCols, this.dataRows],
            format: 'rgba32float',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        // Create compute bind groups for swapping particle buffers
        const bindGroups = [
            this.device.createBindGroup({
                layout: computePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: particleBuffers[0] } },
                    { binding: 1, resource: { buffer: particleBuffers[1] } },
                    { binding: 2, resource: windTexture.createView() },
                    { binding: 3, resource: { buffer: uniformBuffer } }
                ]
            }),
            this.device.createBindGroup({
                layout: computePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: particleBuffers[1] } },
                    { binding: 1, resource: { buffer: particleBuffers[0] } },
                    { binding: 2, resource: windTexture.createView() },
                    { binding: 3, resource: { buffer: uniformBuffer } }
                ]
            }),
        ];

        // Create render bind groups so the render shader receives the current particle buffer.
        const renderBindGroups = [
            this.device.createBindGroup({
                layout: renderPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: particleBuffers[0] } },
                    {binding: 1, resource: { buffer: uniformBuffer } }
                ]
            }),
            this.device.createBindGroup({
                layout: renderPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: particleBuffers[1] } },
                    {binding: 1, resource: { buffer: uniformBuffer } }
                ]
            })
        ];

        try {
            const [uData, vData] = await this.read_binary_files();
            const cols = this.dataCols;
            const rows = this.dataRows;
            if (uData.length !== cols * rows || vData.length !== cols * rows) {
                console.warn('wind data size mismatch vs metadata; not uploading wind texture');
            } else {
                const texels = new Float32Array(cols * rows * 4);
                for (let i = 0; i < cols * rows; i++) {
                    if (uData[i] < this.min_u || vData[i] < this.min_v) continue; // leave as zero
                    texels[i * 4] = uData[i];
                    texels[i * 4 + 1] = vData[i];
                }

                const bytesPerRow = cols * 4 * 4;
                this.device.queue.writeTexture(
                    { texture: windTexture },
                    texels,
                    { bytesPerRow },
                    { width: cols, height: rows}
                );
                console.log('Uploaded wind texture', { cols, rows, bytesPerRow });
            }
        } catch (e) {
            console.warn('Could not read/upload wind texture:', e);
        }

        const updateUniform = (dtSeconds: number) => {
            const arr = new Float32Array([dtSeconds, this.SIMULATION_SPEED]);
            this.device.queue.writeBuffer(uniformBuffer, 0, arr.buffer, arr.byteOffset, arr.byteLength);
        };

        const WORKGROUP_SIZE = 64; // Must match @workgroup_size in compute shader
        const numWorkgroups = Math.ceil(this.NUM_PARTICLES / WORKGROUP_SIZE);

        const segmentsPerParticle = Math.max(0, this.TRAIL_LENGTH - 1);
        const verticesPerParticle = segmentsPerParticle * 2;
        let ping = 0;

        let lastTime = performance.now();
        const frame = () => {
            const now = performance.now();
            const dtMs = now - lastTime;
            const dt = Math.max(0.000001, dtMs / 1000.0); // in seconds, avoid zero
            lastTime = now;

            updateUniform(dt);

            const encoder = this.device.createCommandEncoder();

            const cpass = encoder.beginComputePass();
            cpass.setPipeline(computePipeline);

            cpass.setBindGroup(0, bindGroups[ping]);

            cpass.dispatchWorkgroups(numWorkgroups);
            cpass.end();

            const colorTextureView = this.context.getCurrentTexture().createView();
            const rpass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: colorTextureView,
                    loadOp: 'clear',
                    clearValue: { r: 0, g: 0, b: 0, a: 0.7 },
                    storeOp: 'store'
                }]
            });
            rpass.setPipeline(renderPipeline);

            rpass.setBindGroup(0, renderBindGroups[1 - ping]);

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
}