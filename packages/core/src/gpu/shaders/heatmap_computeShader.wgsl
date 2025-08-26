struct Params {
  cols: u32,
  rows: u32,
  _unused0: u32,
  _unused1: u32,
  min_u: f32,
  min_v: f32,
  min_mag: f32,
  mag_range: f32,
};

@group(0) @binding(0) var<storage, read> ubuf: array<f32>;
@group(0) @binding(1) var<storage, read> vbuf: array<f32>;
@group(0) @binding(2) var outTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let x = gid.x;
  let y = gid.y;
  if (x >= params.cols || y >= params.rows) { return; }

  let idx = y * params.cols + x;
  let uu = ubuf[idx];
  let vv = vbuf[idx];

  if (!(uu > params.min_u && vv > params.min_v)) {
    textureStore(outTex, vec2u(x, y), vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }

  let mag = sqrt(uu * uu + vv * vv);
  let norm = (mag - params.min_mag) / params.mag_range;

  textureStore(outTex, vec2u(x, y), vec4f(norm, norm, norm, 1.0));
}
