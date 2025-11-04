import { Sigmap } from "@sigmap/webgpu-core";
import {MovementHandler} from "@sigmap/webgpu-core";

async function demo() {
    const container = document.getElementById("map-container") as HTMLElement;

    const basemapCanvas = document.getElementById("basemap-canvas") as HTMLCanvasElement;
    const gpuCanvas  = document.getElementById("gpu-canvas") as HTMLCanvasElement;
    const particleCanvas  = document.getElementById("particle-canvas") as HTMLCanvasElement;

    const handler = new MovementHandler(container, {
        minScale: 1,
        maxScale: 8,
        wrapX: true,
        applyCssTransforms: false
    });

    handler.addTarget(document.getElementById("gpu-canvas") as HTMLCanvasElement);
    handler.addTarget(document.getElementById("particle-canvas") as HTMLCanvasElement);
    handler.addTarget(document.getElementById("basemap-canvas") as HTMLCanvasElement);


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
    );
    const heatmap = await sigmap.getHeatmap();

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
    const particles = await sigmap.getParticles();

    // Set as a basemap
    // await sigmap.setPolygons(basemapCanvas, './grid_bins', 'fusion.shpb').then(
    //     async () => {
    //         await sigmap.renderPolygons();
    //     }
    // )
    // const polygons = await sigmap.getPolygons();

    // Handler events
    handler.onChange = async (t) => {
        particleCanvas.style.visibility = "hidden";
        heatmap.updateCameraFromTransform(t);
        await heatmap.setWindowFromTransform(t);
        particles.updateCameraFromTransform(t);
        await particles.setWindowFromTransform(t).then(
            () => particleCanvas.style.visibility = "visible"
        )
        //await polygons.updateCameraFromTransform(t);
    };
}

demo().then(() => null);
