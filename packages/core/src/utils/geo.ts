export function latLonToTile(lat: number, lon: number, zoom: number) {
    const n = Math.pow(2, zoom);
    const x = ((lon + 180) / 360) * n;
    const latRad = (lat * Math.PI) / 180;
    const y = (1/2) * (1 - (Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) * n;
    return { x, y };
}
