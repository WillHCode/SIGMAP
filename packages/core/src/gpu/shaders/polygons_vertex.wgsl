@group(0) @binding(0) var<uniform> u_color : vec4<f32>;

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>
};

@vertex
fn vs(@location(0) in_pos: vec2<f32>) -> VertexOutput {
  var out: VertexOutput;
  let ndc : vec2<f32> = in_pos * 2.0 - vec2<f32>(1.0, 1.0);

  out.position = vec4<f32>(ndc.x, ndc.y, 0.0, 1.0);
  out.color = u_color;

  return out;
}
