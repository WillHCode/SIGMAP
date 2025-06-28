import { Sigmap, Basemap } from "@sigma/webgpu-core";

async function demo() {
    const canvas = document.querySelector("canvas")!;
    const sigma = new Sigmap({ canvas });
    await sigma.init();

    await sigma.loadMapShaders("/shaders/heatmap.wgsl");

    const csvText = await fetch("/data/cities.csv").then(r => r.text());
    const rows = await sigma.loadCSV(csvText);

    const basemapLayer = new Basemap();
    sigma.setBasemapLayer(basemapLayer);

    sigma.renderHeatmap(rows, {
        latField: "lat",
        lngField: "lon",
        valueField: "population"
    });
}

demo();
