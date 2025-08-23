export abstract class Engine{
    protected canvas: HTMLCanvasElement | null;
    protected device: GPUDevice;
    protected context: GPUCanvasContext;
    protected format: GPUTextureFormat;

    protected min_u: number = Number.MIN_VALUE;
    protected min_v: number = Number.MIN_VALUE;
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

        this.metadataLoaded = this.read_metadata(folder + 'meta.json')
            .then((data) => {
                this.min_u = data.min_u;
                this.min_v = data.min_v;

                this.u_filepath = folder + data.u_file;
                this.v_filepath = folder + data.v_file;
                this.lat_filepath = folder + data.lat_file;
                this.lon_filepath = folder + data.lon_file;

                // set the real data shape from metadata
                this.dataCols = data.cols;
                this.dataRows = data.rows;

                console.log('Metadata loaded, paths:', this.u_filepath, this.v_filepath, `cols=${this.dataCols}`, `rows=${this.dataRows}`);
            })
            .catch((err) => {
                console.error('Failed to load metadata:', err);
                return Promise.reject(err);
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

    async read_metadata(filepath: string): Promise<{
        min_u: number,
        min_v: number,
        u_file: string,
        v_file: string,
        lat_file: string,
        lon_file: string,
        rows: number,
        cols: number}> {
        const response = await fetch(filepath);
        if (!response.ok) {
            throw new Error(`Failed to load metadata: ${response.statusText}`);
        }
        const metadata = await response.json();

        return {
            min_u: metadata.min_u,
            min_v: metadata.min_v,
            u_file: metadata.u_file,
            v_file: metadata.v_file,
            lat_file: metadata.lat_file,
            lon_file: metadata.lon_file,
            rows: metadata.rows,
            cols: metadata.cols
        };
    }

    async read_binary_files(): Promise<[Float32Array, Float32Array]> {
        await this.metadataLoaded;

        if (!this.u_filepath || !this.v_filepath) {
            throw new Error('u/v file paths not set after loading metadata');
        }

        const fetchFloat32 = async (path: string): Promise<Float32Array> => {
            const resp = await fetch(path);
            if (!resp.ok) {
                const txt = await resp.text().catch(() => '<no body>');
                throw new Error(`Failed to fetch ${path}: ${resp.status} ${resp.statusText}. Body: ${txt}`);
            }

            const ab = await resp.arrayBuffer();

            if (ab.byteLength % 4 !== 0) {
                let snippet: string;
                try {
                    snippet = new TextDecoder().decode(ab).slice(0, 1000);
                } catch (_e) {
                    snippet = '<binary data (not text)>';
                }
                throw new Error(`Unexpected byte length for ${path}: ${ab.byteLength} (not multiple of 4). Server returned: ${snippet}`);
            }

            return new Float32Array(ab);
        };

        console.log('Fetching binary files:', this.u_filepath, this.v_filepath);
        const [u, v] = await Promise.all([
            fetchFloat32(this.u_filepath),
            fetchFloat32(this.v_filepath),
        ]);

        if (u.length !== v.length) {
            console.warn(`u and v lengths differ: u=${u.length}, v=${v.length}`);
        }

        return [u, v];
    }

    async loadShpb(url: string) : Promise<{
        xmin: number,
        ymin: number,
        xmax: number,
        ymax: number,
        vertexCount: number,
        indexCount: number,
        batches: { index_offset: number, index_count: number, color: [number,number,number,number], feature_id: number }[],
        vertices: Float32Array, // [x0,y0, x1,y1, ...] normalized 0..1
        indices: Uint32Array   // [i0, i1, i2, ...]
    }> {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
        const ab = await resp.arrayBuffer();
        const dv = new DataView(ab);

        let off = 0;
        // magic
        const magic = String.fromCharCode(
            dv.getUint8(off),
            dv.getUint8(off+1),
            dv.getUint8(off+2),
            dv.getUint8(off+3));
        off += 4;
        if (magic !== 'SHPB') throw new Error('Bad magic: '+magic);

        // TODO : ignore version and flags for now
        dv.getUint16(off, true); off += 2; // version
        dv.getUint16(off, true); off += 2; // flags

        const xmin = dv.getFloat64(off, true); off += 8;
        const ymin = dv.getFloat64(off, true); off += 8;
        const xmax = dv.getFloat64(off, true); off += 8;
        const ymax = dv.getFloat64(off, true); off += 8;

        const vertexCount = dv.getUint32(off, true); off += 4;
        const indexCount  = dv.getUint32(off, true); off += 4;
        const batchCount  = dv.getUint32(off, true); off += 4;
        const attrBlockSize = dv.getUint32(off, true); off += 4;

        // read vertices (Float32)
        const floatBytes = vertexCount * 2 * 4;
        const verticesF32 = new Float32Array(ab, off, vertexCount * 2);
        // copy to fresh buffer if you want to keep it separate:
        const vertices = new Float32Array(verticesF32); // detached copy
        off += floatBytes;

        // read indices (Uint32)
        const indicesU32 = new Uint32Array(ab, off, indexCount);
        const indices = new Uint32Array(indicesU32); // copy
        off += indexCount * 4;

        // read batches
        type Batch = { index_offset: number, index_count: number, color: [number,number,number,number], feature_id: number };
        const batches: Batch[] = [];
        for (let i = 0; i < batchCount; i++) {
            const index_offset = dv.getUint32(off, true); off += 4;
            const index_count  = dv.getUint32(off, true); off += 4;
            const r = dv.getFloat32(off, true); off += 4;
            const g = dv.getFloat32(off, true); off += 4;
            const b = dv.getFloat32(off, true); off += 4;
            const a = dv.getFloat32(off, true); off += 4;
            const feature_id = dv.getUint32(off, true); off += 4;
            batches.push({ index_offset, index_count, color: [r,g,b,a], feature_id });
        }

        // TODO: To implement later - read attr block
        if (attrBlockSize > 0) {
            console.log(`Skipping attrBlock of size ${attrBlockSize} bytes`);
        }

        return { xmin, ymin, xmax, ymax, vertexCount, indexCount, batches, vertices, indices };
    }

}