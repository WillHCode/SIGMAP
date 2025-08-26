import { Sigmap } from "@sigmap/webgpu-core";

async function demo() {
    const basemapCanvas = document.getElementById("basemap-canvas") as HTMLCanvasElement;
    const gpuCanvas  = document.getElementById("gpu-canvas") as HTMLCanvasElement;
    const particleCanvas  = document.getElementById("particle-canvas") as HTMLCanvasElement;

    const sigmap = new Sigmap();

    const basemapOptions = {
        zoom: 2,
        center: { lat: 0, lon: 0 },
    }

    // sigmap.setBasemap(basemapCanvas, basemapOptions); // This map might be removed or re-implemented later

    await sigmap.setHeatmap(gpuCanvas, './grid_bins').then(
        async () => {
            await sigmap.renderHeatmap();
        }
    )

    await sigmap.setParticles(particleCanvas, './grid_bins', {
        numParticles: 300_000,
        simulationSpeed: 0.02,
        maxLifetime: 10,
        trailLength: 50,
        trailFade: 0.7
    }).then(
        async () => {
            await sigmap.renderParticles();
        }
    )

    // Set as a basemap
    await sigmap.setPolygons(basemapCanvas, './grid_bins', 'fusion.shpb').then(
        async () => {
            await sigmap.renderPolygons();
        }
    )
}

demo().then(() => null);
