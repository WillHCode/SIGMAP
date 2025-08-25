import {ResourceCache, ShpbData} from "./ResourceCache";

export abstract class Engine{
    protected canvas: HTMLCanvasElement | null;
    protected device: GPUDevice;
    protected context: GPUCanvasContext;
    protected format: GPUTextureFormat;

    protected min_u: number = Number.MIN_VALUE;
    protected min_v: number = Number.MIN_VALUE;
    protected max_u: number = Number.MAX_VALUE;
    protected max_v: number = Number.MAX_VALUE;
    protected u_filepath: string = '';
    protected v_filepath: string = '';
    protected lat_filepath: string = '';
    protected lon_filepath: string = '';
    protected dataCols: number = 0;
    protected dataRows: number = 0;
    protected metadataLoaded: Promise<void> = Promise.resolve();

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
        if (this.isInitialized) { return; }
        if (!this.canvas) { return; }
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("Failed to get GPU adapter");
        this.device = await adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu')!;
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });
        this.canvas.width = window.innerWidth * window.devicePixelRatio;
        this.canvas.height = window.innerHeight * window.devicePixelRatio;
        this.isInitialized = true;
    }

    public async ensureReady(): Promise<void> {
        await this.metadataLoaded;
        await this.init();
        if (!this.device) throw new Error('GPU device not available after init');
        if (!this.context) throw new Error('GPU canvas context not available after init');
    }

    async read_binary_files(): Promise<[Float32Array, Float32Array]> {
        await this.metadataLoaded;
        if (!this.u_filepath || !this.v_filepath) throw new Error('u/v file paths not set');
        return ResourceCache.loadUV(this.u_filepath, this.v_filepath);
    }
    async loadShpb(url: string): Promise<ShpbData> {
        return ResourceCache.loadShpb(url);
    }

}