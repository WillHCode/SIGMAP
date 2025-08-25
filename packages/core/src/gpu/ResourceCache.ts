export type MetaData = {
    min_u: number,
    min_v: number,
    max_u: number,
    max_v: number,
    u_file: string,
    v_file: string,
    lat_file: string,
    lon_file: string,
    rows: number,
    cols: number
};

export type ShpBatch = {
    index_offset: number,
    index_count: number,
    color: [number, number, number, number],
    feature_id: number
};

export type ShpbData = {
    xmin: number, ymin: number, xmax: number, ymax: number,
    vertexCount: number, indexCount: number,
    batches: ShpBatch[],
    vertices: Float32Array,
    indices: Uint32Array
};

export class ResourceCache {
    private static metaCache = new Map<string, Promise<MetaData>>();
    private static binaryCache = new Map<string, Promise<Float32Array>>();
    private static shpbCache = new Map<string, Promise<ShpbData>>();

    static loadMeta(url: string): Promise<MetaData> {
        const key = url;
        let p = this.metaCache.get(key);
        if (p) return p;
        p = fetch(url).then(async (resp) => {
            if (!resp.ok) throw new Error(`Failed to fetch meta: ${url} ${resp.status}`);
            return await resp.json() as Promise<MetaData>;
        });
        this.metaCache.set(key, p);
        return p;
    }

    static loadFloat32(url: string): Promise<Float32Array> {
        const key = url;
        let p = this.binaryCache.get(key);
        if (p) return p;
        p = fetch(url).then(async resp => {
            if (!resp.ok) throw new Error(`Failed to fetch binary: ${url} ${resp.status}`);
            const ab = await resp.arrayBuffer();
            if (ab.byteLength % 4 !== 0) throw new Error(`Unexpected byteLength ${ab.byteLength} for ${url}`);
            return new Float32Array(ab.slice(0)) as Float32Array;
        });
        this.binaryCache.set(key, p);
        return p;
    }

    static async loadUV(uUrl: string, vUrl: string): Promise<[Float32Array, Float32Array]> {
        const [u, v] = await Promise.all([this.loadFloat32(uUrl), this.loadFloat32(vUrl)]);
        return [u, v];
    }

    static loadShpb(url: string): Promise<ShpbData> {
        const key = url;
        let p = this.shpbCache.get(key);
        if (p) return p;

        p = fetch(url).then(async resp => {
            if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
            const ab = await resp.arrayBuffer();
            const dv = new DataView(ab);
            let off = 0;

            // magic
            const magic = String.fromCharCode(dv.getUint8(off), dv.getUint8(off+1), dv.getUint8(off+2), dv.getUint8(off+3));
            off += 4;
            if (magic !== 'SHPB') throw new Error('Bad magic: ' + magic);

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

            // vertices
            const floatBytes = vertexCount * 2 * 4;
            const verticesF32 = new Float32Array(ab.slice(off, off + floatBytes));
            const vertices = new Float32Array(verticesF32); // explicit copy
            off += floatBytes;

            // indices
            const indexBytes = indexCount * 4;
            const indicesU32 = new Uint32Array(ab.slice(off, off + indexBytes));
            const indices = new Uint32Array(indicesU32);
            off += indexBytes;

            const batches: ShpBatch[] = [];
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

            // ignore attrBlock for now (attrBlockSize bytes)
            return {
                xmin, ymin, xmax, ymax,
                vertexCount, indexCount,
                batches, vertices, indices
            } as ShpbData;
        });

        this.shpbCache.set(key, p);
        return p;
    }

    static clearMeta(url?: string) {
        if (url) this.metaCache.delete(url);
        else this.metaCache.clear();
    }
    static clearBinary(url?: string) {
        if (url) this.binaryCache.delete(url);
        else this.binaryCache.clear();
    }
    static clearShpb(url?: string) {
        if (url) this.shpbCache.delete(url);
        else this.shpbCache.clear();
    }
    static cleatrAll() {
        this.clearMeta();
        this.clearBinary();
        this.clearShpb();
    }
}
