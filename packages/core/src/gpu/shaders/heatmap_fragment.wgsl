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

// Define a color ramp
let colors = array<vec4f, 12>(
  vec4f(0.031, 0.188, 0.420, 1.0), // very deep blue (calm)
  vec4f(0.031, 0.317, 0.611, 1.0), // deep blue
  vec4f(0.000, 0.443, 0.737, 1.0), // blue
  vec4f(0.000, 0.576, 0.800, 1.0), // light blue
  vec4f(0.000, 0.690, 0.850, 1.0), // cyan
  vec4f(0.188, 0.784, 0.886, 1.0), // bright cyan
  vec4f(0.498, 0.875, 0.910, 1.0), // pale cyan
  vec4f(0.867, 0.922, 0.769, 1.0), // very light greenish-yellow (transitional)
  vec4f(0.976, 0.843, 0.463, 1.0), // yellow-orange
  vec4f(0.965, 0.596, 0.282, 1.0), // orange
  vec4f(0.902, 0.200, 0.149, 1.0), // red
  vec4f(1.000, 1.000, 1.000, 1.0)  // white (extreme currents)
);


let t = intensity * f32(12 - 1);
let i0 = clamp(u32(t), 0u, 12 - 1u);
let i1 = clamp(i0 + 1u, 0u, 12 - 1u);
let fract = t - floor(t);

return mix(colors[i0], colors[i1], fract);
}