import { Sigmap, Basemap } from "@sigmap/webgpu-core";

async function demo() {
    const basemapCanvas = document.getElementById("basemap-canvas") as HTMLCanvasElement;
    const gpuCanvas  = document.getElementById("gpu-canvas") as HTMLCanvasElement;

    const sigmap = new Sigmap({ canvas: gpuCanvas });
    await sigmap.init();

    await sigmap.loadMapShaders("/shaders/heatmap.wgsl");

    const csvText = await fetch("/data/cities.csv").then(r => r.text());
    const rows = await sigmap.loadCSV(csvText);
    console.log(rows);

    const basemapOptions = {
        zoom: 6,
        center: { lat: 0, lon: 0 },
    }

    await sigmap.setBasemap(basemapCanvas, basemapOptions);
}

demo().then(() => null);
