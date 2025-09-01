import {ResourceCache, ShpbData} from "./ResourceCache";

export type Transform = {
    scale: number;
    tx: number;
    ty: number
};
export type WindowDesc = {
    windowCols: number;
    windowRows: number;
    startUWrapped: number;
    startVClamped: number;
    fracX: number;
    fracY: number;
};

export type WindowState = {
    startU: number;
    startV: number;
    width: number;
    height: number;
};

export abstract class Engine{
    protected canvas: HTMLCanvasElement | null;
    protected device: GPUDevice;
    protected context: GPUCanvasContext;
    protected format: GPUTextureFormat;

    protected min_u: number = -Infinity;
    protected min_v: number = -Infinity;
    protected max_u: number = Infinity;
    protected max_v: number = Infinity;
    protected u_filepath: string = '';
    protected v_filepath: string = '';
    protected lat_filepath: string = '';
    protected lon_filepath: string = '';
    protected dataCols: number = 0;
    protected dataRows: number = 0;
    protected metadataLoaded: Promise<void> = Promise.resolve();

    protected cameraBuffer: GPUBuffer | null = null;

    private isInitialized: boolean = false;

    setup(canvas: HTMLCanvasElement | null, data_folder: string) {
        this.canvas = canvas;
        this.device = null!;
        this.context = null!;
        this.format = 'rgba8unorm';
        const folder = data_folder.replace(/\/+$/, '') + '/';
        const metaUrl = folder + 'meta.json';

        // Use cache
        this.metadataLoaded = ResourceCache.loadMeta(metaUrl).then((data) => {
            this.min_u = data.min_u;
            this.min_v = data.min_v;
            this.max_u = data.max_u;
            this.max_v = data.max_v;

            this.u_filepath = folder + data.u_file;
            this.v_filepath = folder + data.v_file;
            this.lat_filepath = folder + data.lat_file;
            this.lon_filepath = folder + data.lon_file;

            this.dataCols = data.cols;
            this.dataRows = data.rows;

            console.log('Metadata loaded (cached):', this.u_filepath, this.v_filepath, `cols=${this.dataCols}`, `rows=${this.dataRows}`);
        });

        this.init().catch(err => console.error('GPU init failed:', err));
    }

    protected async init(): Promise<void> {
        if (this.isInitialized) return;

        if (!('gpu' in navigator)) {
            throw new Error('WebGPU not supported in this browser (navigator.gpu missing).');
        }

        // Make sure canvas exists and is attached to DOM
        if (!this.canvas) {
            throw new Error('Engine.init: canvas is null. Call setup(canvas, ...) with a valid canvas before init.');
        }
        if (!document.body.contains(this.canvas)) {
            console.warn('Engine.init: canvas is not yet attached to DOM. Proceeding — ensure you attached the element before rendering.');
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error('Failed to get GPU adapter (requestAdapter returned null). Check browser support and flags.');
        }

        try {
            this.device = await adapter.requestDevice();
        } catch (err) {
            console.error('requestDevice() failed:', err);
            throw new Error('Failed to request GPU device. See console for details.');
        }

        const ctx = this.canvas.getContext('webgpu') as GPUCanvasContext | null;
        if (!ctx) {
            throw new Error('Failed to get GPU canvas context from canvas.getContext("webgpu").');
        }
        this.context = ctx;

        this.format = (navigator.gpu as any).getPreferredCanvasFormat ? navigator.gpu.getPreferredCanvasFormat() : 'rgba8unorm';

        this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });

        // Set physical size for drawable
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
        this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);

        this.isInitialized = true;
        console.log('GPU init ok:', { format: this.format, canvasW: this.canvas.width, canvasH: this.canvas.height });
    }

    public async ensureReady(): Promise<void> {
        try {
            await this.metadataLoaded;
        } catch (err) {
            console.error('ensureReady: metadata load failed', err);
            throw err;
        }
        try {
            await this.init();
        } catch (err) {
            console.error('ensureReady: init failed', err);
            throw new Error('GPU device not available after init (see console). ' + (err instanceof Error ? err.message : String(err)));
        }

        if (!this.device) {
            throw new Error('GPU device not available after init');
        }
        if (!this.context) {
            throw new Error('GPU canvas context not available after init');
        }
    }

    async read_binary_files(): Promise<[Float32Array, Float32Array]> {
        await this.metadataLoaded;
        if (!this.u_filepath || !this.v_filepath) throw new Error('u/v file paths not set');
        return ResourceCache.loadUV(this.u_filepath, this.v_filepath);
    }

    async loadShpb(url: string): Promise<ShpbData> {
        return ResourceCache.loadShpb(url);
    }

    protected ensureCameraBuffer() {
        if (this.cameraBuffer) return;
        this.cameraBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        // default: identity buffer
        this.device.queue.writeBuffer(this.cameraBuffer, 0, new Float32Array([1,0,0,0]).buffer);
    }

    protected writeCameraBuffer(invScale: number, offsetU: number, offsetV: number) {
        this.ensureCameraBuffer();
        this.device.queue.writeBuffer(this.cameraBuffer!, 0, new Float32Array([invScale, offsetU, offsetV, 0]).buffer);
    }

    protected computeWindowFromTransform(t: Transform): WindowDesc {
        const W = this.canvas ? this.canvas.clientWidth || 1 : window.innerWidth;
        const H = this.canvas ? this.canvas.clientHeight || 1 : window.innerHeight;
        const cols = this.dataCols;
        const rows = this.dataRows;

        const invScaleFull = 1 / t.scale;
        const offsetUFull = -t.tx / (t.scale * W);
        const offsetVFull = -t.ty / (t.scale * H);

        const windowCols = Math.min(cols, Math.max(1, Math.ceil(cols * invScaleFull)));
        const windowRows = Math.min(rows, Math.max(1, Math.ceil(rows * invScaleFull)));

        const rawTexelX = offsetUFull * cols;
        const rawTexelY = offsetVFull * rows;

        const startUFloor = Math.floor(rawTexelX);
        const startVFloor = Math.floor(rawTexelY);

        const fracX = rawTexelX - startUFloor;
        const fracY = rawTexelY - startVFloor;

        const startUWrapped = ((startUFloor % cols) + cols) % cols;
        const maxStartV = Math.max(0, rows - windowRows);
        let startVClamped = startVFloor;
        if (startVClamped < 0) startVClamped = 0;
        if (startVClamped > maxStartV) startVClamped = maxStartV;

        return { windowCols, windowRows, startUWrapped, startVClamped, fracX, fracY };
    }
}