export function lonLatToTile(lon: number, lat: number, zoom: number) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor(
        (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) * Math.pow(2, zoom-1)
    );
    return { x, y };
}

export function tileToLonLat(x: number, y: number, zoom: number) {
    const lon = x / Math.pow(2, zoom) * 360 - 180;
    const lat = 2 * Math.atan(Math.exp(Math.PI*(1 - (2*y/Math.pow(2, zoom))))) - Math.PI / 2;
    return {lon, lat};
}
