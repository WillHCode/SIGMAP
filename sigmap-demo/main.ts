import { Sigmap } from "@sigmap/webgpu-core";

async function demo() {
    const basemapCanvas = document.getElementById("basemap-canvas") as HTMLCanvasElement;
    const gpuCanvas  = document.getElementById("gpu-canvas") as HTMLCanvasElement;

    const sigmap = new Sigmap({ canvas: gpuCanvas });
    await sigmap.init();

    const basemapOptions = {
        zoom: 2,
        center: { lat: 0, lon: 0 },
    }

    await sigmap.setBasemap(basemapCanvas, basemapOptions);
}

demo().then(() => null);
