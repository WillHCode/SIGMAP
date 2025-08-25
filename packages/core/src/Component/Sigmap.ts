import {HeatMap} from "../gpu/HeatMap";
import { CSVLoader } from "../data/CSVLoader";
import { Basemap, BasemapOptions } from "./Basemap";
import {Particle, ParticleParameters} from "../gpu/Particle";
import {Polygon} from "../gpu/Polygons";

export class Sigmap {
    private basemap?: Basemap;
    private heatmap?: HeatMap;
    private particle?: Particle;
    private polygon?: Polygon;

    constructor() {}

    async loadCSV(text: string) {
        return CSVLoader.load(text);
    }

    async setHeatmap(canvas: HTMLCanvasElement | null, data_folder: string) {
        this.heatmap = new HeatMap(canvas, data_folder);
    }

    async renderHeatmap() {
        await this.heatmap.renderHeatmap();
    }

    async setParticles(canvas: HTMLCanvasElement | null, data_folder: string, params: ParticleParameters) {
        this.particle = new Particle(canvas, data_folder, params);
    }

    async renderParticles() {
        await this.particle.renderParticles();
    }

    async setPolygons(canvas: HTMLCanvasElement | null, data_folder: string, fileName: string) {
        this.polygon = new Polygon(canvas, data_folder, fileName);
    }

    async renderPolygons() {
        await this.polygon.renderPolygons();
    }

    setBasemap(canvas : HTMLCanvasElement, opts: BasemapOptions) {
        if (!this.basemap) {
            this.basemap = new Basemap(opts);
        }
        this.basemap.init(canvas);
    }
}
