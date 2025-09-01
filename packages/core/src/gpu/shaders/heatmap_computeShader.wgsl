struct Params {
  cols: u32,
  rows: u32,
  startU: u32,
  startV: u32,
  min_u: f32,
  min_v: f32,
  min_mag: f32,
  mag_range: f32,
};

@group(0) @binding(0) var<storage, read> ubuf: array<f32>;
@group(0) @binding(1) var<storage, read> vbuf: array<f32>;
@group(0) @binding(2) var outTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: Params;

fn wrap(x: i32, m: i32) -> i32 {
  let r = x % m;
  if (r < 0) {
    return r + m;
  }
  return r;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let ox = i32(gid.x);
  let oy = i32(gid.y);

  // compute output texture dims from implicit grid
  if (u32(ox) >= textureDimensions(outTex).x || u32(oy) >= textureDimensions(outTex).y) {
    return;
  }

  // source coordinate in full grid
  let srcX_i = ox + i32(params.startU);
  let srcY_i = oy + i32(params.startV);

  // wrap X
  let srcX_wrapped = wrap(srcX_i, i32(params.cols));
  let srcY_clamped = clamp(srcY_i, 0, i32(params.rows) - 1);

  let srcIndex = u32(srcY_clamped) * params.cols + u32(srcX_wrapped);
  let uu = ubuf[srcIndex];
  let vv = vbuf[srcIndex];

  if (!(uu > params.min_u && vv > params.min_v)) {
    textureStore(outTex, vec2u(u32(ox), u32(oy)), vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }

  let mag = sqrt(uu * uu + vv * vv);
  let norm = (mag - params.min_mag) / params.mag_range;
  textureStore(outTex, vec2u(u32(ox), u32(oy)), vec4f(norm, norm, norm, 1.0));
}
