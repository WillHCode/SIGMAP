struct VertexOutput {
@builtin(position) position: vec4f,
@location(0) uv: vec2f,
};

@group(0) @binding(0) var heatmap: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

@fragment
fn fs(input: VertexOutput) -> @location(0) vec4f {
// Flip Y-axis to correct orientation.
let uv = vec2f(input.uv.x, 1.0 - input.uv.y);
let intensity = textureSample(heatmap, samp, uv).r;

// Define a color ramp with 9 colors.
let colors = array<vec4f, 9>(
  vec4f(0.0, 0.0, 1.0, 1.0),  // Blue
  vec4f(0.0, 0.5, 1.0, 1.0),  // Light Blue
  vec4f(0.0, 1.0, 1.0, 1.0),  // Cyan
  vec4f(0.0, 1.0, 0.5, 1.0),  // Light Green
  vec4f(0.0, 1.0, 0.0, 1.0),  // Green
  vec4f(0.5, 1.0, 0.0, 1.0),  // Light Yellow
  vec4f(1.0, 1.0, 0.0, 1.0),  // Yellow
  vec4f(1.0, 0.5, 0.0, 1.0),  // Light Orange
  vec4f(1.0, 0.0, 0.0, 1.0)   // Red
);

let t = intensity * f32(9 - 1);
let i0 = clamp(u32(t), 0u, 9 - 1u);
let i1 = clamp(i0 + 1u, 0u, 9 - 1u);
let fract = t - floor(t);

return mix(colors[i0], colors[i1], fract);
}