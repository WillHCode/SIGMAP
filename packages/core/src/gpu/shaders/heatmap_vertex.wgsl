struct VertexOutput {
@builtin(position) position: vec4f,
@location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertexOutput {
const pos = array(
  vec2f(-1, -1),
  vec2f( 1, -1),
  vec2f(-1,  1),
  vec2f( 1,  1)
);
const uv = array(
  vec2f(0, 1),
  vec2f(1, 1),
  vec2f(0, 0),
  vec2f(1, 0)
);
return VertexOutput(vec4f(pos[vi], 0, 1), uv[vi]);
}